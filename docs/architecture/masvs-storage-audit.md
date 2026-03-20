# MASVS-STORAGE Audit Report

**Audit ID:** MASVS-STORAGE-357
**Date:** 2025-07-22
**Auditor:** Security & Privacy Review Agent
**Scope:** All client-side data storage across Android, iOS, Web, and shared KMP sync layer
**Standard:** OWASP MASVS v2.0 — MASVS-STORAGE
**Related ADRs:** ADR-0003 (Local Storage Strategy), ADR-0004 (Auth Security Architecture)

---

## Executive Summary

The Finance application demonstrates a **strong security posture** for data storage across all platforms. Token storage uses platform-appropriate secure mechanisms (EncryptedSharedPreferences, Keychain, in-memory for Web). Field-level encryption with envelope encryption (DEK/KEK) protects sensitive financial fields at rest. Crypto-shredding supports GDPR Art. 17 compliance.

Several findings require attention, notably: the KMP Android `TokenStorage` actual class uses an in-memory stub instead of the production `SecureTokenStorage`, the iOS KMP Keychain implementation uses `kSecAttrAccessibleAfterFirstUnlock` (without `ThisDeviceOnly`), and the web app stores non-sensitive preferences in `localStorage` without risk documentation.

---

## Findings

### CRITICAL — None

No critical storage vulnerabilities were identified. No plaintext tokens, passwords, or financial data are persisted to unprotected storage.

---

### HIGH

#### H-1: KMP Android `TokenStorage` actual is an in-memory stub — not wired to `SecureTokenStorage`

**File:** `packages/sync/src/androidMain/kotlin/com/finance/sync/auth/TokenStorage.android.kt`
**Severity:** HIGH
**MASVS Control:** MASVS-STORAGE-1 (Secure credential storage)

**Description:**
The `TokenStorage` actual class for Android (`packages/sync`) uses a plain in-memory variable (`private var stored: StoredTokenData? = null`) rather than delegating to the production `SecureTokenStorage` class (which correctly uses `EncryptedSharedPreferences` backed by Android Keystore). The comment on line 9 acknowledges this: _"In-memory implementation for initial development. Production builds should migrate to EncryptedSharedPreferences."_

If the KMP sync layer's `TokenManager` is used directly (rather than the native `SecureTokenStorage`), tokens will not survive process death and, more critically, will not be encrypted at rest during the memory-to-disk swap.

**Recommendation:**
Wire the `TokenStorage.android.kt` actual to delegate to `SecureTokenStorage`. Inject the Android `Context` via a factory or DI container so `EncryptedSharedPreferences` can be initialised.

**Status:** FAIL

---

#### H-2: iOS KMP `TokenStorage` uses `kSecAttrAccessibleAfterFirstUnlock` — allows iCloud sync

**File:** `packages/sync/src/iosMain/kotlin/com/finance/sync/auth/TokenStorage.ios.kt` (line 135)
**Severity:** HIGH
**MASVS Control:** MASVS-STORAGE-1

**Description:**
The KMP iOS `TokenStorage` sets `kSecAttrAccessible` to `kSecAttrAccessibleAfterFirstUnlock`. This accessibility class **does not** include the `ThisDeviceOnly` qualifier, meaning Keychain items are eligible for iCloud Keychain backup and cross-device sync. In contrast, the native Swift `KeychainManager` (line 102) correctly uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`.

Syncing auth tokens via iCloud expands the attack surface — a compromise of the user's iCloud account could expose refresh tokens stored by the KMP layer.

**Recommendation:**
Change line 135 to use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. This preserves background-sync access while preventing iCloud backup.

**Status:** FAIL

---

### MEDIUM

#### M-1: `console.log` with user ID in `auth-webhook` edge function

**File:** `services/api/supabase/functions/auth-webhook/index.ts` (line 167)
**Severity:** MEDIUM | **MASVS Control:** MASVS-STORAGE-2

**Description:** Line 167 uses raw `console.log` instead of the structured logger, bypassing request-ID correlation and log-level filtering.

**Recommendation:** Replace with `logger.info('User already provisioned', { userId: record.id })`.

**Status:** PARTIAL

---

#### M-2: SQLCipher passphrase generated from `UUID.randomUUID()` — suboptimal entropy

**File:** `apps/android/src/main/kotlin/com/finance/android/security/KeystoreEncryptionKeyProvider.kt` (line 44)
**Severity:** MEDIUM | **MASVS Control:** MASVS-STORAGE-1, MASVS-CRYPTO-1

**Description:** The passphrase is generated via `UUID.randomUUID().toString()` (122 bits of entropy). A 32-byte `SecureRandom` key (256 bits) would maximise entropy fed into SQLCipher's PBKDF2 key derivation.

**Recommendation:** Use `ByteArray(32).also { SecureRandom().nextBytes(it) }` and Base64-encode.

**Status:** PARTIAL

---

#### M-3: Web `localStorage` usage for non-sensitive preferences undocumented

**Files:** `SettingsPage.tsx`, `useSyncStatus.ts`, `replayMutations.ts`
**Severity:** MEDIUM | **MASVS Control:** MASVS-STORAGE-2

**Description:** `localStorage` is used for theme, currency, notifications, and last-sync timestamps. None are sensitive, but currency preference could be a minor privacy signal. Usage should be documented as an explicit design decision.

**Status:** PARTIAL

---

#### M-4: Service Worker caches API responses — may cache financial data

**File:** `apps/web/src/sw/service-worker.ts` (lines 97–99, 219–241)
**Severity:** MEDIUM | **MASVS Control:** MASVS-STORAGE-2

**Description:** Network-first caching for `/api/` endpoints stores responses in Cache Storage API in cleartext. If API responses contain financial data, an XSS vulnerability could exfiltrate cached data.

**Recommendation:** Restrict caching to non-sensitive endpoints. Add `Cache-Control: no-store` on sensitive API responses.

**Status:** PARTIAL

---

#### M-5: Token `toString()` redaction — verify no serializer bypasses

**File:** `packages/sync/src/commonMain/kotlin/com/finance/sync/auth/TokenManager.kt` (line 196)
**Severity:** MEDIUM

**Description:** All credential classes override `toString()` to redact sensitive fields. Excellent defence-in-depth. `AuthCredentials` is `@Serializable`, so serialized forms must never be logged.

**Status:** PASS (with caveat)

---

### LOW

#### L-1: Web SQLite not encrypted at rest

**File:** `apps/web/src/db/sqlite-wasm.ts` | **Status:** PARTIAL (accepted risk)

#### L-2: Missing `dataExtractionRules` for Android 12+

**File:** `apps/android/src/main/AndroidManifest.xml` | **Status:** PARTIAL

#### L-3: iOS biometric preference in `UserDefaults` — non-sensitive boolean | **Status:** PASS

#### L-4: Monitoring `console.debug` dev-only gated | **Status:** PASS

---

## Compliance Summary

| MASVS-STORAGE Control                       | Platform         | Status     | Notes                                                 |
| ------------------------------------------- | ---------------- | ---------- | ----------------------------------------------------- |
| **STORAGE-1: Secure credential storage**    | Android (native) | ✅ PASS    | EncryptedSharedPreferences + AES-256-GCM via Keystore |
|                                             | Android (KMP)    | ❌ FAIL    | In-memory stub (H-1)                                  |
|                                             | iOS (native)     | ✅ PASS    | Keychain with `WhenUnlockedThisDeviceOnly`            |
|                                             | iOS (KMP)        | ⚠️ PARTIAL | Keychain without `ThisDeviceOnly` (H-2)               |
|                                             | Web              | ✅ PASS    | Tokens in-memory only; HttpOnly cookie refresh        |
| **STORAGE-2: No sensitive data in logs**    | Android          | ✅ PASS    | Timber redacts; `toString()` masks secrets            |
|                                             | iOS              | ✅ PASS    | `os.Logger`; no token values logged                   |
|                                             | Web              | ✅ PASS    | Dev-only `console.debug`                              |
|                                             | Edge Functions   | ⚠️ PARTIAL | One raw `console.log` (M-1)                           |
| **STORAGE-3: No sensitive data in backups** | Android          | ⚠️ PARTIAL | Needs `dataExtractionRules` (L-2)                     |
|                                             | iOS              | ✅ PASS    | `ThisDeviceOnly` excludes iCloud backup               |
| **STORAGE-4: No 3rd-party data sharing**    | All              | ✅ PASS    | No analytics SDK; on-device crash reporter            |
| **STORAGE-5: Keyboard/clipboard**           | All              | ✅ PASS    | Secure input for password fields                      |
| **STORAGE-6: Data encrypted at rest**       | Android          | ✅ PASS    | SQLCipher + Keystore                                  |
|                                             | iOS              | ✅ PASS    | SQLCipher + Keychain                                  |
|                                             | Web              | ⚠️ PARTIAL | Unencrypted OPFS SQLite (L-1)                         |
|                                             | Sync layer       | ✅ PASS    | Envelope encryption AES-256-GCM                       |
| **STORAGE-7: Crypto-shredding**             | All              | ✅ PASS    | `CryptoShredder` + `DeletionCertificate`              |

---

## Positive Findings

1. **Envelope encryption** — per-record DEKs wrapped with household KEKs enable key rotation without re-encrypting all data.
2. **Token redaction** — all credential classes override `toString()` to mask secrets.
3. **Web token storage** — `token-storage.ts`: tokens in JS heap only; HttpOnly cookie refresh.
4. **iOS Keychain** — `KeychainManager` uses `WhenUnlockedThisDeviceOnly`; Secure Enclave gating.
5. **Android Keystore + StrongBox** — AES-256-GCM, 128-bit auth tags, StrongBox-preferred.
6. **Structured logging** — `createLogger` enforces JSON; header says "NEVER log sensitive data."
7. **Consent-gated crash reporting** — `TimberCrashReporter` checks consent per-call.

---

## Recommendations Summary

| Priority   | Finding                                           | Action                                                 |
| ---------- | ------------------------------------------------- | ------------------------------------------------------ |
| **HIGH**   | H-1: KMP Android `TokenStorage` is in-memory stub | Wire to `SecureTokenStorage` via DI                    |
| **HIGH**   | H-2: iOS KMP Keychain missing `ThisDeviceOnly`    | Use `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` |
| **MEDIUM** | M-1: Raw `console.log` in auth-webhook            | Replace with structured logger                         |
| **MEDIUM** | M-2: UUID-based SQLCipher passphrase              | Use 32-byte `SecureRandom` key                         |
| **MEDIUM** | M-3: `localStorage` usage undocumented            | Add risk classification comments                       |
| **MEDIUM** | M-4: SW caches API responses                      | Restrict to non-sensitive endpoints                    |
| **LOW**    | L-1: Web SQLite unencrypted                       | Document as accepted risk                              |
| **LOW**    | L-2: Missing `dataExtractionRules`                | Add Android 12+ backup exclusion                       |
