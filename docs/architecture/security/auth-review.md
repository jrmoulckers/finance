# Authentication Flow Security Review

**Sprint:** Security Review Sprint 5
**Date:** 2025-07-27
**Auditor:** Security Reviewer (AI-assisted)
**Scope:** Passkey/WebAuthn, OAuth, biometric auth across all platforms; token handling, session management, credential storage
**Methodology:** OWASP MASVS-AUTH, ASVS 4.0 Authentication chapter

---

## Executive Summary

The Finance application implements a modern, defense-in-depth authentication architecture centered on passkeys (WebAuthn/FIDO2) with email/password and OAuth fallbacks. The review covers all platforms (iOS, Android, Web, Windows) and the Supabase Edge Function backend. The implementation is **well-designed with strong security fundamentals** and a few areas needing attention.

### Overall Assessment: **STRONG**

| Category                   | Assessment | Confidence |
| -------------------------- | ---------- | ---------- |
| WebAuthn/Passkey (Web)     | ✅ PASS    | HIGH       |
| WebAuthn/Passkey (Backend) | ✅ PASS    | HIGH       |
| Email/Password Auth        | ✅ PASS    | MEDIUM     |
| Token Storage (Web)        | ✅ PASS    | HIGH       |
| Token Storage (Android)    | ✅ PASS    | HIGH       |
| Token Storage (iOS)        | ✅ PASS    | HIGH       |
| Session Management         | ✅ PASS    | MEDIUM     |
| CORS / Origin Validation   | ✅ PASS    | HIGH       |
| Rate Limiting (Auth)       | ✅ PASS    | HIGH       |

### Finding Summary

| Severity | Count | Description                                                     |
| -------- | ----- | --------------------------------------------------------------- |
| CRITICAL | 0     | —                                                               |
| HIGH     | 1     | Passkey session fallback exposes user_id without session token  |
| MEDIUM   | 3     | Challenge cleanup, signup response, CSRF on state-changing POST |
| LOW      | 2     | Token expiry assumption, WebAuthn attestation mode              |

---

## 1. WebAuthn/Passkey Flow Review

### 1.1 Registration Ceremony (Server-Side)

**Source:** `services/api/supabase/functions/passkey-register/index.ts`

| Check                                     | Status  | Notes                                                   |
| ----------------------------------------- | ------- | ------------------------------------------------------- |
| Requires authentication (Bearer JWT)      | ✅ PASS | `getAuthenticatedUser(req)` called before any operation |
| Rate limited (10/min per user)            | ✅ PASS | User-based rate limiting via `checkRateLimit`           |
| Environment variables validated           | ✅ PASS | `validateEnv()` called at function entry                |
| Challenge stored with expiry (5 min)      | ✅ PASS | Line 152: `Date.now() + 5 * 60 * 1000`                  |
| Challenge scoped to user                  | ✅ PASS | Stored with `user_id`                                   |
| Existing credentials excluded             | ✅ PASS | Lines 123-132: queries existing creds for excludeList   |
| Origin and RPID validated                 | ✅ PASS | `verifyRegistrationResponse` with `expectedOrigin/RPID` |
| User verification required                | ✅ PASS | `requireUserVerification: true` on line 196             |
| Credential stored with all metadata       | ✅ PASS | public_key, counter, device_type, transports stored     |
| Used challenge deleted after verification | ✅ PASS | Line 228: `delete().eq('id', challenges[0].id)`         |
| CORS headers applied                      | ✅ PASS | All responses include `getCorsHeaders(req)`             |

**⚠️ Finding AUTH-M1 (MEDIUM): Expired/unused challenges not cleaned up automatically.**

- Challenges that are never used (user abandons registration) remain in the `webauthn_challenges` table until manually cleaned.
- The table has an `expires_at` column and an index on it, but no scheduled cleanup job was found.
- **Risk:** Table bloat over time; very old challenges could theoretically be used if the expiry check had a bug.
- **Recommendation:** Add a periodic cleanup job (cron or database function) to delete challenges where `expires_at < now()`. The existing `cleanup_expired_rate_limits` pattern can be reused.

### 1.2 Authentication Ceremony (Server-Side)

**Source:** `services/api/supabase/functions/passkey-authenticate/index.ts`

| Check                                          | Status  | Notes                                               |
| ---------------------------------------------- | ------- | --------------------------------------------------- |
| Rate limited (20/min per IP — pre-auth)        | ✅ PASS | IP-based rate limiting for pre-auth endpoint        |
| Challenge scoped by exact value (#362, API-9)  | ✅ PASS | Extracts challenge from clientDataJSON for lookup   |
| Challenge single-use (deleted before verify)   | ✅ PASS | Line 237: deletes before verification result        |
| Challenge expiry enforced                      | ✅ PASS | `.gt('expires_at', new Date().toISOString())`       |
| Counter updated (replay prevention)            | ✅ PASS | Lines 263-269: updates counter after verification   |
| Proper session minted via Supabase Auth        | ✅ PASS | Lines 272-312: admin.generateLink → verifyOtp flow  |
| Origin and RPID validated                      | ✅ PASS | `verifyAuthenticationResponse` with expected values |
| User verification required                     | ✅ PASS | `requireUserVerification: true`                     |
| Error responses don''t leak credential details | ✅ PASS | Generic "Credential not found" messages             |

**Security Improvement (#362):** The passkey-authenticate function was significantly hardened:

- A-5: Now mints a proper Supabase JWT session instead of returning raw `user_id`
- API-9: Challenge lookup is now scoped to the exact challenge value (extracted from clientDataJSON), not "most recent for user"
- One-time use enforcement: challenge is deleted immediately regardless of verification outcome

### 1.3 Registration Ceremony (Client-Side)

**Source:** `apps/web/src/auth/webauthn.ts`

| Check                                 | Status  | Notes                                                |
| ------------------------------------- | ------- | ---------------------------------------------------- |
| WebAuthn support check before use     | ✅ PASS | `isWebAuthnSupported()` guards all operations        |
| Conditional mediation support check   | ✅ PASS | `isConditionalMediationAvailable()` for autofill     |
| Base64URL encoding/decoding correct   | ✅ PASS | Proper padding and character replacement             |
| Config initialization required        | ✅ PASS | `initWebAuthn()` must be called; throws if not       |
| Credentials created via browser API   | ✅ PASS | `navigator.credentials.create()` — no custom crypto  |
| Auth token required for registration  | ✅ PASS | `callEdgeFunction` includes Authorization header     |
| Attestation response fully serialized | ✅ PASS | rawId, clientDataJSON, attestationObject, transports |

**⚠️ Finding AUTH-L1 (LOW): Attestation type is `none`.**

- The registration uses `attestationType: 'none'` (server-side, line 139 of passkey-register).
- This means the server doesn''t verify the authenticator''s make/model.
- **Risk:** Very low — attestation `none` is acceptable for consumer apps. Full attestation would limit user choice of authenticators.
- **Recommendation:** Document as intentional design decision. Consider `indirect` attestation for high-security operations (e.g., bank connections).

### 1.4 Authentication Context (Client-Side)

**Source:** `apps/web/src/auth/auth-context.tsx`

| Check                                     | Status  | Notes                                               |
| ----------------------------------------- | ------- | --------------------------------------------------- |
| Tokens NEVER exposed in React context     | ✅ PASS | Only `isAuthenticated`, `user`, and actions exposed |
| Token operations via token-storage module | ✅ PASS | `setAccessToken`, `getAccessToken`, `clearTokens`   |
| Session restore via refresh cookie        | ✅ PASS | `tryRestoreSession()` on mount                      |
| Error state management                    | ✅ PASS | Generic error messages; no token details            |
| Logout clears both server and client      | ✅ PASS | `revokeRefreshToken` + `clearTokens`                |
| ProtectedRoute component                  | ✅ PASS | Guards routes; redirects unauthenticated users      |

**⚠️ Finding AUTH-H1 (HIGH): Passkey login fallback sets user without session token.**

- In `loginWithPasskey` (lines 291-298), if the session exchange (`passkey-authenticate?step=session`) fails, the code falls back to setting the user from `result.userId` WITHOUT a valid access token.
- This creates a state where `user` is set but `isAuthenticated` returns false (because `hasValidToken()` is false).
- **Risk:** The UI could show authenticated state momentarily before `isAuthenticated` check catches it. More importantly, the fallback path reveals a `user_id` without proper session establishment, which could be confusing.
- **Recommendation:** Remove the fallback. If session exchange fails after passkey verification, treat it as a complete authentication failure and throw an error. The passkey verification alone is NOT sufficient for session establishment.

**⚠️ Finding AUTH-M2 (MEDIUM): Signup endpoint doesn''t auto-login.**

- The `signupWithEmail` method (lines 357-385) creates the account but doesn''t establish a session.
- The response doesn''t include an access token or trigger auto-login.
- **Risk:** No direct security risk, but users might be confused. Some implementations accidentally expose the signup response in a way that leaks user details.
- **Recommendation:** Either auto-login after signup (if email verification is not required) or clearly redirect to login. Ensure the signup response never includes sensitive data beyond success/failure.

---

## 2. Token Management Review

### 2.1 Web Token Storage

**Source:** `apps/web/src/auth/token-storage.ts`

| Check                                    | Status  | Notes                                                   |
| ---------------------------------------- | ------- | ------------------------------------------------------- |
| Access token in-memory only              | ✅ PASS | Module-scoped variable; never persisted                 |
| No localStorage/sessionStorage/IndexedDB | ✅ PASS | Documented and verified in code                         |
| Refresh token in HttpOnly cookie         | ✅ PASS | `credentials: 'include'` on refresh; server sets cookie |
| Proactive refresh before expiry          | ✅ PASS | 2-minute threshold + 10-second safety margin            |
| Refresh deduplication                    | ✅ PASS | `isRefreshing` flag + subscriber queue                  |
| Token cleared on logout                  | ✅ PASS | `clearTokens()` resets all state + clears timer         |
| JWT decoded client-side for expiry only  | ✅ PASS | `decodeJwtPayload` — comment says no verification       |
| No token in URL parameters               | ✅ PASS | All token transmission via headers/cookies              |

**⚠️ Finding AUTH-L2 (LOW): Default 1-hour expiry assumed when JWT has no `exp` claim.**

- Line 231: if `payload.exp` is missing, the code assumes 1 hour expiry.
- **Risk:** Very low — all Supabase JWTs include `exp`. But if a non-standard token were used, the 1-hour assumption could be too long.
- **Recommendation:** Consider a shorter default (15 minutes) or rejecting tokens without `exp`.

### 2.2 Android Token Storage

**Referenced:** `apps/android/src/main/kotlin/com/finance/android/security/SecureTokenStorage.kt`
**From security-audit-v1.md:** Uses `EncryptedSharedPreferences` with AES256_SIV key encryption and AES256_GCM value encryption, backed by Android Keystore.

| Check                           | Status  | Notes                           |
| ------------------------------- | ------- | ------------------------------- |
| EncryptedSharedPreferences used | ✅ PASS | AES256_SIV + AES256_GCM         |
| Android Keystore backing        | ✅ PASS | Hardware-backed where available |
| No plaintext token fallback     | ✅ PASS | Only encrypted storage path     |
| Token cleared on logout         | ✅ PASS | Documented in security audit    |

### 2.3 iOS Token Storage

**Referenced:** `apps/ios/Finance/Security/KeychainManager.swift`
**From security-audit-v1.md:** Uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Separate background access with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.

| Check                                   | Status  | Notes                                     |
| --------------------------------------- | ------- | ----------------------------------------- |
| Keychain with device-only access        | ✅ PASS | No iCloud Keychain sync for tokens        |
| Biometric-gated access (Secure Enclave) | ✅ PASS | `.biometryCurrentSet` access control      |
| Background access properly separated    | ✅ PASS | Separate `saveForBackgroundAccess` method |
| Token cleared on logout                 | ✅ PASS | Keychain items deleted                    |

---

## 3. Session Management Review

### 3.1 Session Lifecycle

| Check                                        | Status   | Notes                                               |
| -------------------------------------------- | -------- | --------------------------------------------------- |
| Access token short-lived (1 hour)            | ✅ PASS  | Supabase default; refreshed proactively             |
| Refresh token in HttpOnly Secure cookie      | ✅ PASS  | Server-side cookie setting                          |
| SameSite cookie attribute                    | ⚠️ CHECK | Verify server sets `SameSite=Strict` or `Lax`       |
| Session invalidation on logout (server-side) | ✅ PASS  | `revokeRefreshToken` calls logout endpoint          |
| Session invalidation on account deletion     | ✅ PASS  | `auth.admin.deleteUser` in account-deletion         |
| Concurrent session handling                  | ⚠️ CHECK | Not explicitly limited; each device has own session |
| Session binding to device/IP                 | ⚠️ CHECK | Not implemented; see session-binding-strategy.md    |

**⚠️ Finding AUTH-M3 (MEDIUM): No CSRF protection on state-changing POST endpoints.**

- The login endpoint uses `credentials: 'include'` to receive cookies, and subsequent state-changing requests use the `Authorization` header.
- However, the Edge Functions don''t implement CSRF token validation.
- **Risk:** Since the API uses Bearer token auth (not cookie-based auth for API calls), the CSRF risk is LOW. The primary attack vector would be on the login/logout endpoints which set/clear cookies.
- **Recommendation:** For state-changing endpoints that rely on cookies (login, logout, refresh), consider adding a CSRF token or `SameSite=Strict` cookie attribute. The current architecture mitigates this significantly since API calls use the `Authorization` header, not cookies.

---

## 4. CORS and Origin Security

**Source:** `services/api/supabase/functions/_shared/cors.ts`

| Check                                 | Status  | Notes                                            |
| ------------------------------------- | ------- | ------------------------------------------------ |
| No wildcard `*` in CORS               | ✅ PASS | Origin validated against allowlist               |
| Origins from environment variable     | ✅ PASS | `ALLOWED_ORIGINS` env var, comma-separated       |
| Non-matching origin gets empty string | ✅ PASS | `isAllowed ? origin : ''`                        |
| Preflight handled correctly           | ✅ PASS | 204 response with appropriate headers            |
| Max-Age set for preflight caching     | ✅ PASS | `86400` (24 hours)                               |
| Allow-Credentials not set             | ✅ NOTE | Missing `Access-Control-Allow-Credentials: true` |

**Note:** The CORS configuration does NOT set `Access-Control-Allow-Credentials: true`. This means cookies won''t be sent in cross-origin requests from the browser. For the passkey-authenticate function (which uses `credentials: 'same-origin'`), this is fine since it uses `apikey` header instead. For the login endpoint (which uses `credentials: 'include'`), this may need the `Allow-Credentials` header if the login endpoint is cross-origin from the web app.

---

## 5. Rate Limiting on Auth Endpoints

**Source:** `services/api/supabase/functions/_shared/rate-limit.ts`

| Endpoint             | Limit      | Key Type  | Assessment |
| -------------------- | ---------- | --------- | ---------- |
| passkey-register     | 10 req/min | User ID   | ✅ PASS    |
| passkey-authenticate | 20 req/min | Client IP | ✅ PASS    |
| auth-webhook         | 30 req/min | N/A       | ✅ PASS    |
| account-deletion     | 3 req/hour | User ID   | ✅ PASS    |

**Analysis:** Auth endpoints are appropriately rate limited. Pre-auth endpoints (passkey-authenticate) use IP-based limiting, while authenticated endpoints use user-based limiting. The abuse detection module provides a secondary layer with stricter thresholds (5 errors/min for auth endpoints).

**Positive Security Notes:**

1. Rate limiter uses atomic `check_rate_limit` PostgreSQL RPC — no race conditions
2. Abuse detection tracks error frequency separately from request volume
3. `getClientIp()` uses rightmost X-Forwarded-For entry (not spoofable leftmost)
4. Fail-open design prevents infrastructure issues from blocking legitimate users
5. IP validation (`isPlausibleIp`) rejects injection payloads in forwarded headers

---

## 6. Cryptographic Security

### 6.1 Timing-Safe Comparison

**Source:** `services/api/supabase/functions/_shared/crypto.ts`

| Check                               | Status  | Notes                                          |
| ----------------------------------- | ------- | ---------------------------------------------- |
| HMAC-based constant-time comparison | ✅ PASS | Uses Web Crypto `subtle.verify` for comparison |
| Handles empty strings               | ✅ PASS | Short-circuit for zero-length (no timing info) |
| Length check before comparison      | ✅ PASS | Length difference is not timing-sensitive      |
| No custom crypto implementations    | ✅ PASS | Delegates to Web Crypto API                    |

### 6.2 Invite Code Generation

**Source:** `services/api/supabase/functions/household-invite/index.ts:36-44`

| Check                           | Status  | Notes                                        |
| ------------------------------- | ------- | -------------------------------------------- |
| CSPRNG used                     | ✅ PASS | `crypto.getRandomValues(new Uint8Array(16))` |
| Sufficient entropy (128 bits)   | ✅ PASS | 16 bytes = 128 bits                          |
| Codes are single-use            | ✅ PASS | Marked as accepted after use                 |
| Codes expire (default 72 hours) | ✅ PASS | `expires_at` field enforced                  |

---

## 7. Platform-Specific Authentication

### 7.1 iOS Biometric Authentication

**Source:** `apps/ios/Finance/Security/BiometricAuthManager.swift`, `BiometricCryptoManager.swift`

| Check                                | Status  | Notes                             |
| ------------------------------------ | ------- | --------------------------------- |
| LAContext with `.biometryCurrentSet` | ✅ PASS | Biometric change invalidates keys |
| Secure Enclave key generation        | ✅ PASS | Key bound to biometric enrollment |
| Jailbreak detection                  | ✅ PASS | `JailbreakDetector.swift` present |
| App Attest integration               | ✅ PASS | `AppAttestManager.swift` present  |
| Debug detection (release builds)     | ✅ PASS | `IOSDebugDetector.swift` present  |

### 7.2 Android Biometric Authentication

**Referenced via architecture docs and `libs.versions.toml`**

| Check                                   | Status   | Notes                                               |
| --------------------------------------- | -------- | --------------------------------------------------- |
| BiometricPrompt with Class 3 biometrics | ⚠️ CHECK | Verify `setAllowedAuthenticators(BIOMETRIC_STRONG)` |
| Credential Manager for passkeys         | ✅ PASS  | `credentials:1.3.0` in dependencies                 |
| Android Keystore backing                | ✅ PASS  | Via `security-crypto:1.0.0`                         |

---

## 8. Findings Summary with Remediation

### AUTH-H1: Passkey login fallback exposes user without session (HIGH)

- **File:** `apps/web/src/auth/auth-context.tsx`, lines 291-298
- **Issue:** Fallback sets user state without valid access token after session exchange failure
- **Remediation:** Remove fallback; treat session exchange failure as complete authentication failure
- **Priority:** Fix before next release

### AUTH-M1: Expired WebAuthn challenges not cleaned up (MEDIUM)

- **Table:** `webauthn_challenges`
- **Issue:** No scheduled cleanup for expired challenges
- **Remediation:** Add `cleanup_expired_challenges()` function; schedule via pg_cron or application cron
- **Priority:** Next sprint

### AUTH-M2: Signup doesn''t establish session (MEDIUM)

- **File:** `apps/web/src/auth/auth-context.tsx`, lines 357-385
- **Issue:** Account creation succeeds but user must separately log in
- **Remediation:** Either auto-login after signup or ensure clean redirect to login page
- **Priority:** Next sprint

### AUTH-M3: No explicit CSRF protection on cookie-setting endpoints (MEDIUM)

- **Files:** Login, logout, and refresh endpoints
- **Issue:** No CSRF token; mitigated by Bearer token auth for API calls
- **Remediation:** Add `SameSite=Strict` to cookies; consider CSRF tokens for cookie-dependent endpoints
- **Priority:** Before launch

### AUTH-L1: Attestation type `none` for passkey registration (LOW)

- **File:** `services/api/supabase/functions/passkey-register/index.ts`, line 139
- **Issue:** No authenticator attestation verification
- **Remediation:** Document as intentional; consider `indirect` for high-security operations
- **Priority:** Document only

### AUTH-L2: Default 1-hour expiry for tokens without `exp` claim (LOW)

- **File:** `apps/web/src/auth/token-storage.ts`, line 231
- **Issue:** Assumes 1 hour if `exp` missing
- **Remediation:** Reduce default to 15 minutes or reject tokens without `exp`
- **Priority:** Low

---

**Next Review:** Sprint 6 — Data Handling & Privacy Compliance Audit
**Document Version:** 1.0
