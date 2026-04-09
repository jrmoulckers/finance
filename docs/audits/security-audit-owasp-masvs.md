# OWASP MASVS Level 2 — Security Audit Report

**Issue:** #78
**Date:** 2025-07-22
**Standard:** [OWASP MASVS v2](https://mas.owasp.org/MASVS/) Level 2 (L2)
**Scope:** Crypto implementations, auth flow, network security, data storage, input validation, Edge Functions
**Auditor:** Security & Privacy Reviewer (automated)
**Status:** Complete

---

## Executive Summary

This audit reviewed the Finance monorepo against OWASP MASVS v2 Level 2 requirements, covering:

- **Cryptographic implementations** across all KMP platforms (Android, iOS, JS, JVM)
- **Authentication flows** (Supabase Auth, passkey WebAuthn, OAuth + PKCE, token lifecycle)
- **Network security** (TLS, CORS, certificate handling)
- **Data storage encryption** (SQLite, Keychain, EncryptedSharedPreferences, JVM KeyStore)
- **Input validation** and injection prevention across all Edge Functions
- **Edge Function security** (12 functions in `services/api/supabase/functions/`)
- **Sync rules** and tenant isolation (`services/api/powersync/sync-rules.yaml`)

### Finding Summary

| Severity     | Count | Status                  |
| ------------ | ----- | ----------------------- |
| **CRITICAL** | 0     | ---                     |
| **HIGH**     | 3     | Fix before release      |
| **MEDIUM**   | 5     | Fix within sprint       |
| **LOW**      | 6     | Address when convenient |

### Overall Assessment

The codebase demonstrates **strong security architecture and mature implementation**. Compared to the v1 audit (`docs/architecture/security-audit-v1.md`), two previously critical issues have been fully resolved:

- PASS **C-1 (CORS wildcard):** `cors.ts` now uses origin allowlist --- never `*` (lines 15--35).
- PASS **C-2 (Non-CSPRNG default):** `RandomProvider.kt` delegates to `PlatformSHA256.randomBytes()`, backed by platform CSPRNG on all targets.
- PASS **A-5 (Passkey session):** `passkey-authenticate/index.ts` now mints proper Supabase JWT sessions (lines 271--312).
- PASS **API-9 (Challenge scoping):** Challenge lookup is scoped by exact challenge value, not global most recent (lines 207--237).
- PASS **S-8 (toString leaks):** Both `AuthSession` and `SyncCredentials` redact tokens in `toString()`.

The remaining findings are defense-in-depth improvements with no active data exposure risks.

---

## MASVS-CRYPTO --- Cryptography

### C-1: process-recurring uses non-constant-time secret comparison --- Severity: HIGH

- **File:** `services/api/supabase/functions/process-recurring/index.ts`, line 70
- **Code:** `authHeader !== Bearer $`{cronSecret}```
- **Issue:** The `CRON_SECRET` comparison uses JavaScript's `!==` operator, which short-circuits on the first differing byte. This creates a timing side-channel that could allow an attacker to brute-force the secret one character at a time. The `auth-webhook` function correctly uses `constantTimeEqual()` (line 51--63 of `auth-webhook/index.ts`), but `process-recurring` does not.
- **MASVS:** MASVS-CRYPTO-2 (use proven cryptographic primitives correctly)
- **Remediation:** Import or inline the `constantTimeEqual()` function from `auth-webhook/index.ts` (or extract it to `_shared/auth.ts`) and use it for the comparison:
  `	ypescript
const token = authHeader.replace('Bearer ', '');
if (!constantTimeEqual(token, cronSecret)) { ... }
`

### C-2: JVM/Android SecureRandom instantiated per call --- Severity: MEDIUM

- **File:** `packages/sync/src/androidMain/kotlin/com/finance/sync/auth/PlatformSHA256.android.kt`, line 19; same in `jvmMain` variant
- **Code:** `java.security.SecureRandom().nextBytes(bytes)` creates a new `SecureRandom` instance for each invocation.
- **Issue:** While functionally correct, repeated instantiation wastes entropy pool initialization. On Android particularly, early-boot entropy starvation is a known issue. A singleton `SecureRandom` instance would be both more performant and safer.
- **MASVS:** MASVS-CRYPTO-1 (strong random number generation)
- **Remediation:** Use a companion object singleton:
  `kotlin
actual object PlatformSHA256 {
    private val secureRandom = java.security.SecureRandom()
    actual fun randomBytes(size: Int): ByteArray {
        val bytes = ByteArray(size)
        secureRandom.nextBytes(bytes)
        return bytes
    }
}
`

### C-3: JVM KeyStore uses hardcoded password --- Severity: MEDIUM

- **File:** `packages/sync/src/jvmMain/kotlin/com/finance/sync/auth/TokenStorage.jvm.kt`, line 76
- **Code:** `private val keystorePassword = "finance-token-ks".toCharArray()`
- **Issue:** The PKCS12 keystore password is hardcoded in source. While the comment (line 74--76) acknowledges that actual security comes from OS file permissions, the hardcoded password means anyone with read access to the source code and the keystore file can extract the AES key. This violates MASVS-CRYPTO-1 (secure key management). In a compiled binary, this string is trivially extractable.
- **MASVS:** MASVS-CRYPTO-1 (secure key management)
- **Remediation:** Derive the keystore password from a platform-specific secret (e.g., a machine-unique identifier hashed with PBKDF2) or use the OS credential store directly (DPAPI on Windows, `libsecret` on Linux). At minimum, generate the password at first run from `SecureRandom` and store it in a separate OS-protected location.

### C-4: Argon2id not yet implemented --- plan to upgrade from PBKDF2 --- Severity: LOW

- **Files:** All `KeyDerivation.*.kt` platform actuals
- **Issue:** The `expect` declaration documents Argon2id as the target KDF, but all platform actuals use PBKDF2-HMAC-SHA256. PBKDF2 with 600,000 iterations is OWASP-compliant and adequate, but Argon2id provides superior resistance to GPU/ASIC attacks due to memory-hardness.
- **MASVS:** MASVS-CRYPTO-2 (proven cryptographic primitives)
- **Remediation:** Track upgrade to Argon2id as a backlog item. Current PBKDF2 with 600k iterations is acceptable per OWASP 2023 guidelines. Priority: LOW.

### C-5: Password CharArray not cleared on iOS/JS paths --- Severity: LOW

- **Files:** `KeyDerivation.ios.kt` (line 58), `KeyDerivation.js.kt` (line 59)
- **Issue:** The Android/JVM implementations correctly call `spec.clearPassword()` in a `finally` block (line 59 of `.android.kt`). The iOS and JS implementations convert `password` to `ByteArray` via `encodeToByteArray()` but never zero-fill the intermediate byte arrays. In Kotlin/Native (iOS), memory is managed by the GC --- the password bytes may persist in the heap longer than necessary.
- **MASVS:** MASVS-CRYPTO-1 (minimize key material lifetime)
- **Remediation:** After use, zero-fill intermediate `ByteArray`s: `passwordBytes.fill(0)`. For JS, also zero-fill ipadKey/opadKey after derivation completes. Note: GC-managed languages provide no hard guarantee, but filling with zeros reduces the window.

### C-6: PASS --- Envelope encryption (DEK/KEK) correctly implemented

- **Files:** `EnvelopeEncryption.kt`, `FieldEncryptor.kt`, `HouseholdKeyManager.kt`, `KeyRotation.kt`
- **Assessment:** 256-bit DEK generation via CSPRNG, AES-256-GCM for wrapping, fresh nonce per operation, proper key rotation with DEK re-wrapping (not data re-encryption). Design is sound.

### C-7: PASS --- Crypto-shredding for GDPR Art. 17

- **Files:** `CryptoShredder.kt`, `DeletionCertificate.kt`
- **Assessment:** Key destruction + verification + audit certificate. No sensitive data in certificates.

---

## MASVS-AUTH --- Authentication and Authorization

### A-1: checkAbuseStatus increments the counter as a side effect --- Severity: HIGH

- **File:** `services/api/supabase/functions/_shared/abuse-detection.ts`, lines 222--281
- **Issue:** The `checkAbuseStatus()` function is documented as a read-only check (without incrementing the error counter) but it calls `check_rate_limit` RPC with `p_max_requests: 999999` (line 246). Since the RPC performs an atomic UPSERT, this **always increments the counter**. The comment at line 232--240 acknowledges this limitation. This means every status check adds 1 to the counter, causing legitimate users to be blocked faster than the configured threshold, and an attacker could deliberately trigger status checks to inflate counters for other identifiers.
- **MASVS:** MASVS-AUTH-3 (the application should limit the number of failed attempts)
- **Remediation:** Either:
  1. Add a separate read-only RPC (`get_rate_limit_status`) that does `SELECT` without `UPSERT`, or
  2. Add a `p_increment` boolean parameter to the existing `check_rate_limit` RPC, or
  3. Remove `checkAbuseStatus()` and rely solely on `recordAbuseSignal()` + `checkRateLimit()`.

### A-2: Admin authorization relies solely on email allowlist --- Severity: MEDIUM

- **File:** `services/api/supabase/functions/admin-dashboard/index.ts`, lines 70--80
- **Issue:** Admin access is determined by checking `user.email` against the `ADMIN_EMAILS` env var. This is a soft control --- if an attacker compromises a Supabase Auth account with an admin email (via password reset, email takeover), they gain full admin access. There is no secondary factor or role-based check at the database level.
- **MASVS:** MASVS-AUTH-2 (enforce authorization at the server side)
- **Remediation:** Add a database-level `is_admin` column on the `users` table (or an `admin_roles` table) and verify against it. The env var can serve as a bootstrap mechanism, but the authoritative check should be database-backed and include MFA requirement for admin actions.

### A-3: PASS --- All authenticated endpoints use requireAuth()

- **Files:** All Edge Function `index.ts` files
- **Assessment:** Every user-facing endpoint calls `requireAuth(req)` which validates the JWT via `supabase.auth.getUser(token)`. Server-to-server endpoints (`auth-webhook`, `process-recurring`) use shared secrets with `Authorization: Bearer` header. Health check is appropriately public.

### A-4: PASS --- PKCE implementation is RFC 7636 compliant

- **File:** `packages/sync/src/commonMain/kotlin/com/finance/sync/auth/PKCEHelper.kt`
- **Assessment:** S256 challenge method, 64-char verifier (384 bits entropy), CSPRNG random bytes, proper base64url encoding without padding, CSRF state parameter support. Code verifier character set matches RFC 7636 S4.1.

### A-5: PASS --- Passkey WebAuthn implementation is hardened

- **Files:** `passkey-register/index.ts`, `passkey-authenticate/index.ts`
- **Assessment:** Challenge scoped by exact value (not most recent), 5-minute expiry, one-time use (deleted before verification result), counter increment for replay prevention, proper Supabase session minting via `generateLink` + `verifyOtp`, `requireUserVerification: true`.

### A-6: PASS --- Token lifecycle management is sound

- **File:** `packages/sync/src/commonMain/kotlin/com/finance/sync/auth/TokenManager.kt`
- **Assessment:** 2-minute proactive refresh threshold, platform-secure storage delegation, proper `clearTokens()` on sign-out, `toString()` redaction on `StoredTokenData`, `AuthSession`, and `SyncCredentials`.

---

## MASVS-STORAGE --- Data Storage

### S-1: household_invitations sync includes invited_email --- Severity: HIGH

- **File:** `services/api/powersync/sync-rules.yaml`, lines 97--101
- **Issue:** The `household_invitations` query in the `by_household` bucket selects `invited_email` (line 99). This means **all household members** can see the email addresses of people who have been invited --- not just the inviter. Email addresses are PII subject to GDPR Art. 5(1)(c) data minimization. Members other than the inviter have no legitimate need to see the invited person's email.
- **MASVS:** MASVS-STORAGE-2 (prevent unauthorized access to sensitive data)
- **Remediation:** Remove `invited_email` from the sync rule's SELECT columns. If the invited email is needed for the inviter's UI, add a separate user-scoped query in the `user_profile` bucket filtered by `invited_by = bucket.user_id`. Alternatively, sync only a masked version (e.g., `j***@example.com`).

### S-2: PASS --- Android uses EncryptedSharedPreferences correctly

- **File:** `packages/sync/src/androidMain/kotlin/com/finance/sync/auth/TokenStorage.android.kt`
- **Assessment:** AES256-SIV key encryption, AES256-GCM value encryption, Android Keystore-backed master key, lazy initialization, proper `apply()` for async writes.

### S-3: PASS --- iOS Keychain uses kSecAttrAccessibleWhenUnlockedThisDeviceOnly

- **File:** `packages/sync/src/iosMain/kotlin/com/finance/sync/auth/TokenStorage.ios.kt`
- **Assessment:** Correct accessibility attribute prevents access when device is locked and blocks iCloud Keychain sync. Thread-safe via `NSLock`. Proper upsert pattern with `errSecDuplicateItem` handling.

### S-4: PASS --- Web uses in-memory storage (not localStorage)

- **File:** `packages/sync/src/jsMain/kotlin/com/finance/sync/auth/TokenStorage.js.kt`
- **Assessment:** Tokens stored only in JS heap. Not persisted to localStorage, sessionStorage, or IndexedDB. Tokens cleared on page close. Well-documented security rationale.

### S-5: PASS --- JVM uses AES-256-GCM encrypted file with PKCS12 KeyStore

- **File:** `packages/sync/src/jvmMain/kotlin/com/finance/sync/auth/TokenStorage.jvm.kt`
- **Assessment:** Fresh 12-byte IV per encryption, 128-bit GCM tag, proper `synchronized` locking. See C-3 for the hardcoded keystore password concern.

### S-6: Sensitive fields classification may be incomplete --- Severity: LOW

- **File:** `packages/sync/src/commonMain/kotlin/com/finance/sync/crypto/FieldEncryptor.kt`, lines 31--35
- **Issue:** Only `payee`, `note`, and `account.name` are encrypted. `amount_cents` is left in cleartext for server-side queries. While documented as intentional, financial amounts + dates + categories enable behavior inference. This is a risk acceptance that should be formally documented.
- **MASVS:** MASVS-STORAGE-1 (encrypt sensitive data at rest)
- **Remediation:** Create a formal threat model document for the field encryption classification. If `amount_cents` must remain queryable, consider order-preserving encryption or document the risk acceptance with management sign-off.

---

## MASVS-NETWORK --- Network Security

### N-1: SMTP relay uses plaintext HTTP --- Severity: MEDIUM

- **File:** `services/api/supabase/functions/_shared/notification.ts`, line 354
- **Code:** `const response = await fetch(http://$`{smtpHost}:$`{smtpPort}/send, ...)`
- **Issue:** The email delivery uses `http://` (plaintext) to connect to the SMTP relay. If the relay is on a different host or traverses a network boundary, email content (including notification subjects and bodies) is transmitted unencrypted.
- **MASVS:** MASVS-NETWORK-1 (use TLS for all network communication)
- **Remediation:** Change to `https://` and validate the relay certificate. If the relay is localhost-only (same Deno isolate), document this as an accepted risk. Add a validation check:
  `	ypescript
const protocol = smtpHost === 'localhost' || smtpHost === '127.0.0.1' ? 'http' : 'https';
`

### N-2: PASS --- CORS is origin-allowlist based, never wildcard

- **File:** `services/api/supabase/functions/_shared/cors.ts`
- **Assessment:** Origins read from `ALLOWED_ORIGINS` env var, strict `includes()` check, empty string returned for non-allowed origins. No `*` anywhere.

### N-3: PASS --- All sync traffic uses bearer auth over HTTPS

- **File:** `packages/sync/src/commonMain/kotlin/com/finance/sync/provider/HttpSyncProvider.kt`
- **Assessment:** `bearerAuth(authToken)` on all requests. Ktor `HttpClient` respects platform TLS configuration. No custom certificate validation overrides.

### N-4: PASS --- Webhook endpoints require HTTPS

- **File:** `services/api/supabase/functions/manage-webhooks/index.ts`, line 180
- **Assessment:** `!endpointUrl.startsWith('https://')` rejects non-HTTPS URLs. HMAC-SHA256 payload signing via Web Crypto API.

---

## MASVS-PLATFORM --- Platform Interaction

### P-1: PASS --- Sensitive data redacted in toString() across all auth types

- **Files:** `AuthSession.kt` (line 34), `SyncCredentials.kt` (line 37), `StoredTokenData.kt` (line 196), `AuthCredentials.kt` (lines 41, 61, 80)
- **Assessment:** All credential classes override `toString()` to mask tokens/passwords with `*****`. Prevents accidental logging. Comprehensive coverage across `EmailPassword`, `OAuth`, `Passkey`, and `RefreshToken` variants.

### P-2: PASS --- Structured logger never logs sensitive data

- **File:** `services/api/supabase/functions/_shared/logger.ts`
- **Assessment:** Logger emits only request IDs, function names, HTTP statuses, durations, and error types. Security policy documented in header comment. `userId` is the only identifier logged (needed for audit correlation).

### P-3: PASS --- Error messages do not leak internal details

- **Files:** All Edge Function `index.ts` files
- **Assessment:** `internalErrorResponse()` returns generic Internal server error (500). Database error messages are logged server-side only, never returned to clients. `env.ts` does not reveal which env vars are missing. `sync-health-report/index.ts` sanitizes error messages with PII patterns before DB persistence.

---

## MASVS-CODE --- Code Quality

### Q-1: data-export uses SELECT \* for table queries --- Severity: MEDIUM

- **File:** `services/api/supabase/functions/data-export/index.ts`, line 245
- **Code:** `let query = supabase.from(table.name).select('*');`
- **Issue:** Using `SELECT *` means any new column added to a table (including internal-only columns like `sync_version`, `is_synced`, or future sensitive columns) will automatically be included in user data exports without explicit review. The `REDACTED_COLUMNS` set (line 67) only redacts `public_key`.
- **MASVS:** MASVS-CODE-4 (minimize exposed functionality)
- **Remediation:** Replace `select('*')` with explicit column lists for each table, matching or subsetting the column allowlists in `sync-rules.yaml`. Add any new internal columns to `REDACTED_COLUMNS` as a defense-in-depth measure.

### Q-2: household-invite POST does not validate role input --- Severity: LOW

- **File:** `services/api/supabase/functions/household-invite/index.ts`, line 84
- **Code:** `const { household_id, invited_email, role = 'member', expires_in_hours = 72 } = body;`
- **Issue:** The `role` field from the request body is passed directly to the database insert (line 141) without validation against an allowlist. If the DB has a CHECK constraint this is caught, but relying solely on DB-level validation means the error message may leak schema details.
- **MASVS:** MASVS-CODE-4 (validate all input)
- **Remediation:** Add application-level validation:
  `	ypescript
const VALID_ROLES = ['member', 'admin'] as const;
if (!VALID_ROLES.includes(role)) {
  return errorResponse(req, 'Invalid role. Must be "member" or "admin".');
}
`

### Q-3: household-invite POST does not validate expires_in_hours --- Severity: LOW

- **File:** `services/api/supabase/functions/household-invite/index.ts`, line 84
- **Issue:** `expires_in_hours` is used directly in expiry calculation (line 132) without bounds checking. A malicious request could set `expires_in_hours: 999999` (creating invitations valid for ~114 years) or `expires_in_hours: 0` (immediately expired) or negative values.
- **MASVS:** MASVS-CODE-4 (validate all input)
- **Remediation:**
  `	ypescript
const MAX_EXPIRY_HOURS = 168; // 7 days
const MIN_EXPIRY_HOURS = 1;
const validExpiry = Math.min(MAX_EXPIRY_HOURS, Math.max(MIN_EXPIRY_HOURS, expires_in_hours));
`

### Q-4: CSV export vulnerable to formula injection --- Severity: LOW

- **File:** `services/api/supabase/functions/data-export/index.ts`, lines 130--151
- **Issue:** The `recordsToCsv()` function escapes commas, quotes, and newlines, but does not sanitize values starting with `=`, `+`, `-`, or `@`. If a user has entered a payee name like `=CMD('calc')`, the exported CSV could execute formulas when opened in Excel or Google Sheets (CSV injection / formula injection).
- **MASVS:** MASVS-CODE-4 (validate and sanitize output)
- **Remediation:** Prefix values starting with `=`, `+`, `-`, `@`, `\t`, `\r` with a single quote:
  `	ypescript
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];
if (FORMULA_TRIGGERS.some(t => str.startsWith(t))) {
  return "'$`{str.replace(/"/g, '""')}";
  }
  `

### Q-5: PASS --- All Edge Functions use parameterized queries

- **Assessment:** All database operations use Supabase client methods (`.eq()`, `.in()`, `.select()`, `.insert()`, `.update()`, `.rpc()`) which generate parameterized queries. No string interpolation or concatenation in SQL contexts. RPC calls use named parameters.

### Q-6: PASS --- Rate limiting applied to all endpoints

- **File:** `services/api/supabase/functions/_shared/rate-limit.ts`
- **Assessment:** All 12 Edge Functions have rate limit configurations in `RATE_LIMITS`. Authenticated endpoints use user ID as key; pre-auth endpoints use client IP. Fail-open design prevents legitimate traffic from being blocked by infrastructure failures.

### Q-7: PASS --- Environment variables validated before use

- **File:** `services/api/supabase/functions/_shared/env.ts`
- **Assessment:** Per-function env var requirements defined. Missing vars return 503 without revealing which are absent. `requireEnv()` throws after validation gate.

---

## MASVS-RESILIENCE --- Resilience Against Reverse Engineering

### R-1: PASS --- Sync rules enforce tenant isolation

- **File:** `services/api/powersync/sync-rules.yaml`
- **Assessment:** `by_household` bucket parameterized on `household_members.user_id = token_parameters.user_id`. `user_profile` bucket scoped to authenticated user. Soft-delete filtering (`deleted_at IS NULL`) on all queries. Column allowlisting prevents internal column leakage. `public_key` excluded from `passkey_credentials` sync.

### R-2: PASS --- Webhook secrets properly managed

- **File:** `services/api/supabase/functions/manage-webhooks/index.ts`
- **Assessment:** Secrets returned only on creation (line 237). Never included in GET/list responses (line 293) or update responses (line 400). HMAC-SHA256 signing uses Web Crypto API.

---

## Remediation Priority

### Must Fix Before Release (HIGH)

| ID  | Finding                                       | Effort | Owner   |
| --- | --------------------------------------------- | ------ | ------- |
| C-1 | Non-constant-time CRON_SECRET comparison      | Small  | Backend |
| A-1 | checkAbuseStatus increments counter           | Medium | Backend |
| S-1 | invited_email synced to all household members | Small  | Backend |

### Fix Within Sprint (MEDIUM)

| ID  | Finding                                          | Effort | Owner   |
| --- | ------------------------------------------------ | ------ | ------- |
| C-2 | SecureRandom instantiated per call (JVM/Android) | Small  | KMP     |
| C-3 | Hardcoded JVM KeyStore password                  | Medium | KMP     |
| A-2 | Admin auth relies on email allowlist only        | Medium | Backend |
| N-1 | SMTP relay uses plaintext HTTP                   | Small  | Backend |
| Q-1 | data-export uses SELECT \*                       | Medium | Backend |

### Address When Convenient (LOW)

| ID  | Finding                                   | Effort | Owner    |
| --- | ----------------------------------------- | ------ | -------- |
| C-4 | Argon2id not yet implemented              | Large  | KMP      |
| C-5 | Password ByteArray not zeroed on iOS/JS   | Small  | KMP      |
| S-6 | Sensitive field classification incomplete | Medium | Security |
| Q-2 | Invite role not validated at app layer    | Small  | Backend  |
| Q-3 | Invite expiry hours not bounded           | Small  | Backend  |
| Q-4 | CSV export formula injection              | Small  | Backend  |

---

## Previously Resolved Findings (from v1 audit)

The following critical/high findings from `docs/architecture/security-audit-v1.md` have been verified as resolved:

| v1 ID | Finding                     | Resolution                                                    |
| ----- | --------------------------- | ------------------------------------------------------------- |
| C-1   | CORS wildcard \*            | `cors.ts` uses origin allowlist from `ALLOWED_ORIGINS` env    |
| C-2   | Non-CSPRNG RandomProvider   | Delegates to platform CSPRNG via `PlatformSHA256.randomBytes` |
| A-5   | Passkey returns raw user_id | Mints full Supabase JWT session via magiclink + OTP exchange  |
| API-9 | Global challenge lookup     | Challenge scoped by exact value + type + expiry               |
| S-8   | toString() leaks tokens     | All auth classes override toString() with redaction           |

---

## Appendix A: Files Reviewed

### Crypto Layer (packages/sync/src/)

- `commonMain/.../crypto/KeyDerivation.kt` --- expect declaration
- `androidMain/.../crypto/KeyDerivation.android.kt` --- PBKDF2 600k iterations
- `iosMain/.../crypto/KeyDerivation.ios.kt` --- CommonCrypto PBKDF2
- `jsMain/.../crypto/KeyDerivation.js.kt` --- Pure-Kotlin PBKDF2
- `jvmMain/.../crypto/KeyDerivation.jvm.kt` --- JCA PBKDF2
- `commonMain/.../crypto/EncryptionService.kt` --- Interface
- `commonMain/.../crypto/EnvelopeEncryption.kt` --- DEK/KEK pattern
- `commonMain/.../crypto/FieldEncryptor.kt` --- Per-field encryption
- `commonMain/.../crypto/CryptoShredder.kt` --- GDPR key destruction
- `commonMain/.../crypto/HouseholdKeyManager.kt` --- KEK lifecycle
- `commonMain/.../crypto/KeyRotation.kt` --- KEK rotation + DEK re-wrapping
- `commonMain/.../crypto/RandomProvider.kt` --- CSPRNG abstraction

### Auth Layer (packages/sync/src/)

- `commonMain/.../auth/AuthManager.kt` --- Auth interface
- `commonMain/.../auth/AuthSession.kt` --- Session data class
- `commonMain/.../auth/AuthCredentials.kt` --- Credential variants
- `commonMain/.../auth/PKCEHelper.kt` --- RFC 7636 PKCE
- `commonMain/.../auth/TokenManager.kt` --- Token lifecycle
- `{android,ios,js,jvm}Main/.../auth/TokenStorage.*.kt` --- Platform storage
- `{android,ios,js,jvm}Main/.../auth/PlatformSHA256.*.kt` --- Platform crypto

### Edge Functions (services/api/supabase/functions/)

- `_shared/auth.ts` --- JWT validation
- `_shared/cors.ts` --- Origin allowlist CORS
- `_shared/logger.ts` --- Structured logging
- `_shared/rate-limit.ts` --- Sliding window rate limiter
- `_shared/response.ts` --- Response helpers
- `_shared/env.ts` --- Environment validation
- `_shared/abuse-detection.ts` --- Error-frequency abuse detection
- `_shared/webhook.ts` --- HMAC-SHA256 webhook signing
- `_shared/notification.ts` --- Email notifications
- `account-deletion/index.ts` --- GDPR Art. 17 erasure
- `data-export/index.ts` --- GDPR Art. 20 portability
- `passkey-register/index.ts` --- WebAuthn registration
- `passkey-authenticate/index.ts` --- WebAuthn authentication
- `household-invite/index.ts` --- Invitation lifecycle
- `auth-webhook/index.ts` --- Signup provisioning
- `admin-dashboard/index.ts` --- Admin metrics
- `process-recurring/index.ts` --- Cron-triggered transactions
- `manage-webhooks/index.ts` --- Webhook CRUD
- `send-notification/index.ts` --- Notification dispatch
- `health-check/index.ts` --- Uptime monitoring
- `sync-health-report/index.ts` --- Sync telemetry

### Sync Rules

- `services/api/powersync/sync-rules.yaml` --- Tenant isolation + column allowlisting

### Network

- `packages/sync/src/commonMain/.../provider/HttpSyncProvider.kt` --- Sync HTTP client

---

## Appendix B: Methodology

This audit followed OWASP MASVS v2 Level 2 requirements with particular focus on:

1. **Static analysis** of all cryptographic code for algorithm correctness, key management, and random number generation
2. **Data flow analysis** tracing sensitive data (tokens, passwords, financial data, PII) from input to storage to output
3. **Authorization boundary verification** at every Edge Function, sync rule, and RLS boundary
4. **Input/output validation** at all trust boundaries (client to server, server to database, server to external services)
5. **Comparison with v1 audit** to verify remediation of previously identified critical/high findings
6. **Cross-platform consistency check** ensuring all four platforms (Android, iOS, JS, JVM) meet equivalent security levels
