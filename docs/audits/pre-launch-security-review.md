# Pre-Launch Security Review — Finance App v1.0

**Date:** 2025-07-23
**Reviewer:** Security & Privacy Reviewer
**Scope:** Full codebase pre-launch security audit
**Status:** CONDITIONAL PASS — 3 HIGH findings must be resolved before launch

---

## Executive Summary

This pre-launch security review covers all security-critical components of the Finance application ahead of v1.0 release. The review spans Supabase backend (PostgreSQL + Edge Functions), Kotlin Multiplatform shared code, platform-specific security implementations (Android, iOS, Web, Windows/JVM), PowerSync sync rules, and authentication flows.

### Overall Assessment

The Finance app demonstrates **mature security architecture** with strong fundamentals:

- ✅ RLS enabled on ALL tables with proper tenant isolation
- ✅ Parameterized queries everywhere (no SQL injection vectors)
- ✅ CORS origin-allowlist (no wildcard)
- ✅ Proper WebAuthn/passkey implementation with challenge scoping
- ✅ Rate limiting on all Edge Functions
- ✅ Secrets managed via environment variables (none hardcoded)
- ✅ Structured logging with sensitive data exclusions
- ✅ PKCE for OAuth flows (RFC 7636 compliant)
- ✅ Platform-appropriate secure token storage on all platforms
- ✅ Envelope encryption (DEK/KEK) for field-level encryption

Two previously CRITICAL findings from the v1 audit (CORS wildcard, non-CSPRNG RandomProvider) have been fully resolved.

### Finding Summary

| Severity     | Count  | Action Required               |
| ------------ | ------ | ----------------------------- |
| **CRITICAL** | 0      | —                             |
| **HIGH**     | 3      | Must fix before launch        |
| **MEDIUM**   | 7      | Fix within sprint / launch +1 |
| **LOW**      | 7      | Address when convenient       |
| **TOTAL**    | **17** |                               |

---

## HIGH Severity Findings

### H-1: Non-constant-time CRON_SECRET comparison in `process-recurring`

- **Severity:** HIGH
- **Category:** MASVS-CRYPTO / Timing Side-Channel
- **File:** `services/api/supabase/functions/process-recurring/index.ts`, line 70
- **Code:**
  ```typescript
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
  ```
- **Risk:** JavaScript's `!==` operator short-circuits on the first differing byte, creating a timing side-channel. An attacker with network access could brute-force the CRON_SECRET one character at a time. The `auth-webhook` function correctly uses `constantTimeEqual()` (lines 51–63), but `process-recurring` does not.
- **Impact:** If the CRON_SECRET is compromised, an attacker can trigger arbitrary recurring transaction generation — potentially creating fraudulent transaction records across all households.
- **Remediation:** Extract `constantTimeEqual()` from `auth-webhook/index.ts` to `_shared/auth.ts` and use it:
  ```typescript
  const token = authHeader.replace('Bearer ', '');
  if (!constantTimeEqual(token, cronSecret)) {
    /* reject */
  }
  ```

### H-2: `checkAbuseStatus()` increments counter as side-effect

- **Severity:** HIGH
- **Category:** MASVS-AUTH / Abuse Detection Bypass
- **File:** `services/api/supabase/functions/_shared/abuse-detection.ts`, lines 222–281
- **Risk:** The `checkAbuseStatus()` function calls `check_rate_limit` RPC with `p_max_requests: 999999` (line 246). Since the RPC always performs an atomic UPSERT, every status check increments the abuse counter. This means:
  1. Legitimate users are blocked faster than intended (counter inflated by read-only checks)
  2. An attacker could trigger status checks against other identifiers to inflate their counters, causing denial-of-service to legitimate users
- **Impact:** Legitimate users could be locked out of sensitive endpoints (passkey auth, account deletion) due to phantom counter increments.
- **Remediation:** Add a read-only `get_rate_limit_status` RPC that performs `SELECT` without `UPSERT`, or add a `p_increment BOOLEAN DEFAULT true` parameter to the existing RPC.

### H-3: `invited_email` PII synced to all household members via PowerSync

- **Severity:** HIGH
- **Category:** MASVS-STORAGE / GDPR Data Minimization
- **File:** `services/api/powersync/sync-rules.yaml`, lines 97–101
- **Code:**
  ```yaml
  SELECT id, household_id, invited_by, invite_code, invited_email,
  role, expires_at, accepted_at, accepted_by, ...
  FROM household_invitations
  WHERE household_id = bucket.household_id AND deleted_at IS NULL
  ```
- **Risk:** The `invited_email` column is synced to ALL household members, not just the inviter. This violates GDPR Article 5(1)(c) data minimization — members who didn't create the invitation have no legitimate need to see the invited person's email address.
- **Impact:** PII exposure to unauthorized household members. Could trigger GDPR violation findings in a regulatory audit.
- **Remediation:** Remove `invited_email` from the `by_household` sync rule's SELECT columns. If needed for the inviter's UI, create a separate query in the `user_profile` bucket filtered by `invited_by = bucket.user_id`, or sync only a masked version (e.g., `j***@example.com`).

---

## MEDIUM Severity Findings

### M-1: JVM KeyStore uses hardcoded password

- **Severity:** MEDIUM
- **Category:** MASVS-CRYPTO / Key Management
- **File:** `packages/sync/src/jvmMain/kotlin/com/finance/sync/auth/TokenStorage.jvm.kt`, line 76
- **Code:** `private val keystorePassword = "finance-token-ks".toCharArray()`
- **Risk:** The PKCS12 keystore password is hardcoded. Anyone with source code access and the keystore file can extract the AES key. The string is trivially extractable from compiled binaries.
- **Remediation:** Derive the password from a machine-unique identifier via PBKDF2, or use the OS credential store directly (DPAPI on Windows, `libsecret` on Linux). At minimum, generate at first run from `SecureRandom` and store separately.

### M-2: Admin authorization relies solely on email allowlist

- **Severity:** MEDIUM
- **Category:** MASVS-AUTH / Authorization
- **File:** `services/api/supabase/functions/admin-dashboard/index.ts`, lines 70–80
- **Risk:** Admin access is determined by checking `user.email` against `ADMIN_EMAILS` env var. If an attacker compromises a Supabase Auth account with an admin email (password reset, email takeover), they gain full admin dashboard access. No secondary factor or database-level role check exists.
- **Remediation:** Add a database-level `is_admin` column on the `users` table. The env var can bootstrap, but the authoritative check should be DB-backed and require MFA for admin actions.

### M-3: SMTP relay uses plaintext HTTP

- **Severity:** MEDIUM
- **Category:** MASVS-NETWORK / TLS
- **File:** `services/api/supabase/functions/_shared/notification.ts`, line 354
- **Code:** `const response = await fetch(`http://${smtpHost}:${smtpPort}/send`, ...)`
- **Risk:** Email delivery uses `http://` (plaintext). If the SMTP relay is on a different host, notification content (including subjects referencing financial events) is transmitted unencrypted.
- **Remediation:** Change to `https://` and validate the TLS certificate. If localhost-only, document as accepted risk with conditional logic:
  ```typescript
  const protocol = smtpHost === 'localhost' || smtpHost === '127.0.0.1' ? 'http' : 'https';
  ```

### M-4: `data-export` uses `SELECT *` for all table queries

- **Severity:** MEDIUM
- **Category:** MASVS-CODE / Data Leakage
- **File:** `services/api/supabase/functions/data-export/index.ts`, line 245
- **Code:** `let query = supabase.from(table.name).select('*');`
- **Risk:** Any new column added to any table (including internal columns like `sync_version`, `is_synced`, or future sensitive columns) will automatically be included in user data exports without review. The `REDACTED_COLUMNS` set only covers `public_key`.
- **Remediation:** Replace `select('*')` with explicit column lists for each table, matching the column allowlists in `sync-rules.yaml`. Add new internal columns to `REDACTED_COLUMNS` as defense-in-depth.

### M-5: JVM/Android `SecureRandom` instantiated per call

- **Severity:** MEDIUM
- **Category:** MASVS-CRYPTO / Random Number Generation
- **File:** `packages/sync/src/androidMain/kotlin/com/finance/sync/auth/PlatformSHA256.android.kt`, line 19; same in `jvmMain`
- **Risk:** Repeated `SecureRandom()` instantiation wastes entropy pool initialization. On Android, early-boot entropy starvation is a known issue.
- **Remediation:** Use a companion object singleton `SecureRandom` instance.

### M-6: No certificate pinning on any platform

- **Severity:** MEDIUM
- **Category:** MASVS-NETWORK / TLS
- **Files:** Android `AndroidManifest.xml` (no `network_security_config.xml` reference), iOS `Info.plist` (no `NSPinnedDomains`), Ktor client (no pin configuration)
- **Risk:** For a financial application, the absence of certificate pinning means a compromised CA or corporate MITM proxy could intercept all API traffic. While Supabase enforces TLS 1.2+ server-side, pinning provides defense-in-depth against CA compromise.
- **Remediation:**
  - Android: Create `network_security_config.xml` with `<pin-set>` for Supabase API domains
  - iOS: Add `NSPinnedDomains` to `Info.plist`
  - Consider Ktor client-level pinning in shared KMP code

### M-7: Web CSP allows `'unsafe-inline'` for scripts

- **Severity:** MEDIUM
- **Category:** MASVS-PLATFORM / XSS Defense
- **File:** `apps/web/vite.config.ts`, line 51
- **Code:** `"script-src 'self' 'unsafe-inline'"`
- **Risk:** `'unsafe-inline'` weakens XSS protection. While this is in the dev server config, no separate production CSP is configured — Vite uses the same headers during build.
- **Remediation:** Configure separate CSP for production using nonces or hashes. Remove `'unsafe-inline'` from `script-src` in production builds.

---

## LOW Severity Findings

### L-1: Web passkey auth fallback trusts client-supplied `user_id`

- **Severity:** LOW
- **Category:** MASVS-AUTH / Session Management
- **File:** `apps/web/src/auth/auth-context.tsx`, lines 290–297
- **Code:**
  ```typescript
  // Fallback: use the user_id from the passkey result
  setUser({
    id: result.userId,
    email: email ?? '',
    hasPasskey: true,
  });
  ```
- **Risk:** If the session endpoint call on line 267 fails, the fallback sets user state from the client-side passkey result without a server-issued JWT. This creates a degraded "authenticated" state without a valid token. While `hasValidToken()` would return false, the UI would show the user as logged in.
- **Impact:** Low — no actual data access is possible without a valid JWT, but it creates confusing UX and could mask auth failures.
- **Remediation:** Remove the fallback block. If session creation fails, treat it as an authentication failure and show an error.

### L-2: Household invite `role` field not validated at application layer

- **Severity:** LOW
- **Category:** MASVS-CODE / Input Validation
- **File:** `services/api/supabase/functions/household-invite/index.ts`, line 84
- **Risk:** The `role` field is passed directly to the DB without app-layer validation. If the DB CHECK constraint catches it, the error message may leak schema details.
- **Remediation:** Add validation:
  ```typescript
  const VALID_ROLES = ['member', 'admin'] as const;
  if (!VALID_ROLES.includes(role)) {
    return errorResponse(req, 'Invalid role. Must be "member" or "admin".');
  }
  ```

### L-3: Household invite `expires_in_hours` not bounded

- **Severity:** LOW
- **Category:** MASVS-CODE / Input Validation
- **File:** `services/api/supabase/functions/household-invite/index.ts`, line 84
- **Risk:** `expires_in_hours` has no bounds. A malicious request could set `999999` (~114 years) or negative values.
- **Remediation:** Clamp to reasonable bounds (1–168 hours).

### L-4: CSV export vulnerable to formula injection

- **Severity:** LOW
- **Category:** MASVS-CODE / Output Sanitization
- **File:** `services/api/supabase/functions/data-export/index.ts`, lines 130–151
- **Risk:** The `recordsToCsv()` function does not sanitize values starting with `=`, `+`, `-`, `@`. A user with a payee name like `=CMD('calc')` could trigger formula execution when the CSV is opened in Excel.
- **Remediation:** Prefix values starting with formula trigger characters with a single quote.

### L-5: Production source maps enabled for web app

- **Severity:** LOW
- **Category:** MASVS-RESILIENCE / Reverse Engineering
- **File:** `apps/web/vite.config.ts`, line 19
- **Code:** `sourcemap: true`
- **Risk:** Source maps expose full source code structure, including security-relevant implementation details.
- **Remediation:** Set `sourcemap: 'hidden'` for production builds.

### L-6: Password `ByteArray` not cleared on iOS/JS paths

- **Severity:** LOW
- **Category:** MASVS-CRYPTO / Key Material Lifetime
- **Files:** `KeyDerivation.ios.kt`, `KeyDerivation.js.kt`
- **Risk:** Intermediate byte arrays from password encoding are not zero-filled after use, unlike Android/JVM which call `spec.clearPassword()`. Password bytes may persist in GC-managed memory.
- **Remediation:** Call `passwordBytes.fill(0)` after use.

### L-7: No data retention policies or purge jobs for ephemeral data

- **Severity:** LOW
- **Category:** GDPR Compliance / Data Minimization
- **Files:** `webauthn_challenges`, `household_invitations` (expired), `rate_limits` (old windows)
- **Risk:** Expired WebAuthn challenges (5-min TTL), expired invitations, and stale rate limit entries accumulate indefinitely. While `cleanup_expired_rate_limits` exists as a function, no cron schedule is configured to invoke it. Similarly, no purge exists for expired challenges or invitations.
- **Remediation:** Configure `pg_cron` or an external scheduler to periodically call cleanup functions for these tables.

---

## Previously Resolved Findings (Verified)

The following critical/high findings from prior audits have been verified as fully resolved:

| Prior ID | Finding                             | Resolution                                                      | Verified |
| -------- | ----------------------------------- | --------------------------------------------------------------- | -------- |
| v1/C-1   | CORS wildcard `*` in Edge Functions | `cors.ts` uses origin allowlist from `ALLOWED_ORIGINS` env var  | ✅       |
| v1/C-1   | Non-CSPRNG `DefaultRandomProvider`  | Delegates to platform CSPRNG via `PlatformSHA256.randomBytes()` | ✅       |
| v1/A-5   | Passkey auth returns raw `user_id`  | Mints proper Supabase JWT via `generateLink` + `verifyOtp`      | ✅       |
| v1/API-9 | Global WebAuthn challenge lookup    | Challenge scoped by exact value + type + expiry, one-time use   | ✅       |
| v1/S-8   | `toString()` leaks tokens           | All auth classes override with redaction                        | ✅       |
| v1/S-1   | Android `allowBackup="true"`        | Set to `android:allowBackup="false"`                            | ✅       |

---

## Security Architecture Strengths

### Authentication (STRONG)

- ✅ All authenticated endpoints use `requireAuth()` with JWT validation via `supabase.auth.getUser()`
- ✅ Server-to-server endpoints use shared secrets with `Authorization: Bearer` header
- ✅ WebAuthn implementation: challenge scoping, 5-min expiry, one-time use, counter increment
- ✅ PKCE (RFC 7636): S256 method, 384-bit verifier, CSPRNG random bytes
- ✅ Biometric: `BIOMETRIC_STRONG` (Class 3) on Android, `LAContext` on iOS, Windows Hello

### Data at Rest (STRONG)

- ✅ SQLCipher encryption architecture via `expect/actual` pattern
- ✅ Android: `EncryptedSharedPreferences` (AES256-SIV key, AES256-GCM value)
- ✅ iOS: Keychain with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- ✅ Web: In-memory only (never localStorage/sessionStorage/IndexedDB for tokens)
- ✅ Windows: DPAPI-encrypted file with path traversal validation
- ✅ Envelope encryption (DEK/KEK) with AES-256-GCM, fresh nonce per operation

### Data in Transit (GOOD)

- ✅ All sync traffic uses bearer auth over HTTPS
- ✅ Webhook endpoints require HTTPS (`startsWith('https://')`)
- ✅ CORS origin allowlist (never wildcard)
- ⚠️ No certificate pinning (M-6)
- ⚠️ SMTP relay uses HTTP (M-3)

### SQL Injection Prevention (STRONG)

- ✅ SQLDelight: All queries use `?` parameter placeholders
- ✅ Supabase client: `.eq()`, `.in()`, `.select()`, `.rpc()` generate parameterized queries
- ✅ No string interpolation/concatenation in any SQL context
- ✅ RPC calls use named parameters

### RLS Policies (STRONG)

- ✅ RLS enabled on ALL 11 tables (users, households, household_members, accounts, categories, transactions, budgets, goals, passkey_credentials, household_invitations, webauthn_challenges, audit_log, rate_limits)
- ✅ Household-scoped tables: access gated by `auth.household_ids()` function
- ✅ User-scoped tables: `id = auth.uid()` or `user_id = auth.uid()`
- ✅ Audit log: read-only for users, insert via `SECURITY DEFINER` functions only
- ✅ Rate limits: no user-facing policies (service_role only via `SECURITY DEFINER`)

### Secrets Management (STRONG)

- ✅ No hardcoded secrets found in source (`.env.example` uses placeholders)
- ✅ `.gitignore` covers `.env`, `.env.local`, `*.key`, `*.keystore`, `secrets/`
- ✅ Environment variables validated at startup without revealing which are missing
- ✅ Webhook secrets returned only on creation, never in list/update responses

### Input Validation (GOOD)

- ✅ Export format validated against allowlist
- ✅ Webhook URLs validated for HTTPS and max length
- ✅ Date formats validated with regex
- ✅ Notification types validated against `VALID_NOTIFICATION_TYPES`
- ✅ Webhook event types validated against `VALID_EVENT_TYPES`
- ⚠️ Invite role/expiry not validated at app layer (L-2, L-3)

---

## OWASP MASVS Cross-Reference

| MASVS Category   | Status                  | Notes                                                                                |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| MASVS-STORAGE    | ✅ PASS (with findings) | Platform-appropriate encryption; invited_email PII leak (H-3)                        |
| MASVS-CRYPTO     | ✅ PASS (with findings) | CSPRNG fixed; timing attack in process-recurring (H-1); hardcoded JVM password (M-1) |
| MASVS-AUTH       | ✅ PASS (with findings) | Comprehensive auth; abuse detection counter bug (H-2); admin email-only auth (M-2)   |
| MASVS-NETWORK    | ⚠️ PARTIAL              | TLS everywhere but no cert pinning (M-6); HTTP SMTP (M-3)                            |
| MASVS-PLATFORM   | ✅ PASS (with findings) | Proper platform integration; CSP needs hardening (M-7)                               |
| MASVS-CODE       | ✅ PASS (with findings) | Parameterized queries; minor input validation gaps (L-2, L-3, L-4)                   |
| MASVS-RESILIENCE | ✅ PASS                 | Sync rules enforce tenant isolation; column allowlisting                             |

---

## Remediation Priority

### Must Fix Before Launch (HIGH)

| ID  | Finding                                  | Effort | Owner   |
| --- | ---------------------------------------- | ------ | ------- |
| H-1 | Non-constant-time CRON_SECRET comparison | Small  | Backend |
| H-2 | checkAbuseStatus increments counter      | Medium | Backend |
| H-3 | invited_email PII synced to all members  | Small  | Backend |

### Fix Within Sprint (MEDIUM)

| ID  | Finding                             | Effort | Owner   |
| --- | ----------------------------------- | ------ | ------- |
| M-1 | Hardcoded JVM KeyStore password     | Medium | KMP     |
| M-2 | Admin auth email-only allowlist     | Medium | Backend |
| M-3 | SMTP relay plaintext HTTP           | Small  | Backend |
| M-4 | data-export SELECT \*               | Medium | Backend |
| M-5 | SecureRandom per-call instantiation | Small  | KMP     |
| M-6 | No certificate pinning              | Medium | Mobile  |
| M-7 | CSP allows unsafe-inline            | Small  | Web     |

### Address When Convenient (LOW)

| ID  | Finding                                | Effort | Owner   |
| --- | -------------------------------------- | ------ | ------- |
| L-1 | Passkey fallback trusts client user_id | Small  | Web     |
| L-2 | Invite role not validated              | Small  | Backend |
| L-3 | Invite expiry not bounded              | Small  | Backend |
| L-4 | CSV formula injection                  | Small  | Backend |
| L-5 | Production source maps enabled         | Small  | Web     |
| L-6 | Password ByteArray not zeroed (iOS/JS) | Small  | KMP     |
| L-7 | No ephemeral data purge jobs           | Medium | Backend |

---

## Files Reviewed

### Edge Functions (12 functions)

- `services/api/supabase/functions/_shared/{auth,cors,logger,rate-limit,env,response,abuse-detection,webhook,notification}.ts`
- `services/api/supabase/functions/{passkey-register,passkey-authenticate,auth-webhook,data-export,account-deletion,household-invite,admin-dashboard,process-recurring,manage-webhooks,send-notification,health-check,sync-health-report}/index.ts`

### Database Migrations

- `services/api/supabase/migrations/20260306000001_initial_schema.sql`
- `services/api/supabase/migrations/20260306000002_rls_policies.sql`
- `services/api/supabase/migrations/20260306000003_auth_config.sql`
- `services/api/supabase/migrations/20260316000001_edge_function_security.sql`
- `services/api/supabase/migrations/20260323000003_rate_limits.sql`

### Sync Rules

- `services/api/powersync/sync-rules.yaml`

### Platform Security

- `apps/android/src/main/AndroidManifest.xml`
- `apps/web/src/auth/{auth-context.tsx,token-storage.ts,webauthn.ts}`
- `apps/web/vite.config.ts`

### Environment & Secrets

- `services/api/.env.example`
- `apps/web/.env.example`
- `.gitignore`
- `services/api/supabase/config.toml`
- `services/api/supabase/seed.sql`

### Prior Audits Referenced

- `docs/audits/security-audit-owasp-masvs.md`
- `docs/architecture/security-audit-v1.md`
- `docs/architecture/privacy-audit-v1.md`

---

## Conclusion

The Finance app has a **strong security foundation** suitable for a v1.0 launch, contingent on resolving the 3 HIGH findings. The architecture demonstrates security-first design with defense-in-depth across all layers. The most critical gaps are operational (timing side-channel, abuse detection counter bug, PII leakage in sync rules) rather than architectural, indicating the security posture is mature.

**Launch recommendation:** CONDITIONAL PASS — resolve H-1, H-2, and H-3 before production deployment.
