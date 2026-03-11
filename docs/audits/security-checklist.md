# Security Audit Checklist — OWASP MASVS L1

**Last updated:** 2025-07-22
**Standard:** [OWASP MASVS v2](https://mas.owasp.org/MASVS/) Level 1 (L1)
**References:** [ADR-0004 Auth & Security](../architecture/0004-auth-security-architecture.md), [ADR-0003 Local Storage](../architecture/0003-local-storage-strategy.md)

> This checklist covers the Finance application security posture across all
> four platforms (Android, iOS, Web, Windows). Items reference MASVS controls
> and map to the existing ADRs where the architectural decisions were made.
>
> **CRITICAL:** Any item marked with FAIL blocks release. Items marked WARN
> require a risk-accepted justification documented in the audit sign-off.

---

## 1. Data Storage (MASVS-STORAGE)

Sensitive financial data must be encrypted at rest on every platform.

### 1.1 Database Encryption — SQLCipher Verification

- [ ] **SQLCipher is enabled on all platforms** — verify AES-256 encryption is active
  - Android: `SupportSQLiteOpenHelper` with SQLCipher driver
  - iOS: SQLCipher via `grdb` or native C library linked
  - Windows: SQLCipher linked via NuGet or native build
  - Web: IndexedDB + Web Crypto API (AES-GCM) for structured data
- [ ] **Encryption key never stored in plaintext** — key derived from Keychain/Keystore-stored master key
- [ ] **Database file is encrypted on disk** — open the `.db` file in a hex editor; it must not contain readable SQL or data
- [ ] **WAL file is encrypted** — SQLCipher WAL mode uses the same encryption
- [ ] **Database passes are not logged** — no `PRAGMA key` values in logs or crash reports
- [ ] **Backup exclusion** — database files excluded from unencrypted cloud backups
  - Android: `android:allowBackup="false"` or Auto Backup rules excluding DB
  - iOS: `isExcludedFromBackup = true` on DB file URL

### 1.2 Credential & Token Storage

| Platform | Required Storage                                                      | Verification                                                                   |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Android  | Android Keystore + `EncryptedSharedPreferences`                       | Tokens not in `SharedPreferences`, logs, or `/data/data/` plaintext files      |
| iOS      | Keychain Services with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` | Tokens not in `UserDefaults`, plist files, or NSCoder archives                 |
| Windows  | DPAPI / `PasswordVault` / TPM-backed credential storage               | Tokens not in registry, AppData plaintext files, or localStorage               |
| Web      | `HttpOnly` + `Secure` + `SameSite=Strict` cookies                     | Tokens **never** in `localStorage`, `sessionStorage`, or JS-accessible cookies |

### 1.3 Token Storage Verification Steps

- [ ] **Install app, authenticate, then inspect storage** — pull Android app data, inspect iOS Keychain, check browser DevTools
- [ ] **Access tokens are NOT in application logs** — search logcat / Console.app / DevTools for JWT patterns
- [ ] **Refresh tokens are NOT accessible to JavaScript** (web) — verify `HttpOnly` flag
- [ ] **Tokens are cleared on logout** — verify complete cleanup of Keychain/Keystore/cookies
- [ ] **No tokens in URL parameters** — tokens transmitted via headers or POST body only
- [ ] **No tokens in crash reports** — verify crash reporting SDK strips Authorization headers

### 1.4 Sensitive Data Leakage Prevention

- [ ] **App snapshot/screenshot protection** — iOS: protected data check, Android: `FLAG_SECURE` on sensitive screens
- [ ] **Clipboard timeout** — copied account numbers or amounts cleared from clipboard after 60 seconds
- [ ] **No sensitive data in system keyboard cache** — secure text fields disable autocomplete for account numbers
- [ ] **Pasteboard exclusion** (iOS 16+) — `UIPasteboard` items set with expiration date
- [ ] **No financial data in push notification payloads** — notifications contain only opaque references, not amounts or accounts

---

## 2. Network Security (MASVS-NETWORK)

All data in transit must be encrypted. The app must not be vulnerable to
man-in-the-middle attacks.

### 2.1 TLS Configuration

- [ ] **All network connections use TLS 1.2+** — no fallback to TLS 1.0/1.1 or plaintext HTTP
- [ ] **No cleartext traffic** — verified via:
  - Android: `android:usesCleartextTraffic="false"` in `AndroidManifest.xml`
  - iOS: App Transport Security (ATS) enabled, no `NSAllowsArbitraryLoads`
  - Web: HSTS header with `max-age >= 31536000`, `includeSubDomains`, `preload`
  - Windows: `HttpClient` configured to reject non-TLS
- [ ] **Strong cipher suites** — TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256
- [ ] **OCSP stapling enabled** on server
- [ ] **Certificate validity monitored** — alerts before expiry

### 2.2 Certificate Pinning

- [ ] **Certificate pinning implemented** for API endpoints
  - Android: Network Security Config with `<pin-set>` (SHA-256 SPKI hashes)
  - iOS: `URLSessionDelegate` with `SecTrustEvaluateWithError` + pinned public keys
  - Web: Rely on Certificate Transparency logs for monitoring
  - Windows: `ServerCertificateValidationCallback` with pinned hashes
- [ ] **Backup pins configured** — at least one backup pin for rotation
- [ ] **Pin rotation procedure documented** — runbook for rotating pins before certificate renewal
- [ ] **Pinning failures logged (not silently ignored)** — alert on pin mismatch (potential MITM)

### 2.3 API Security Headers (Web)

- [ ] **Content-Security-Policy** — strict CSP with no `unsafe-inline`, no `unsafe-eval`

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.finance.app; frame-ancestors 'none';
```

- [ ] **X-Content-Type-Options: nosniff**
- [ ] **X-Frame-Options: DENY** (or CSP `frame-ancestors 'none'`)
- [ ] **Referrer-Policy: strict-origin-when-cross-origin**
- [ ] **Permissions-Policy** — disable unused browser features (camera, microphone, geolocation)
- [ ] **CORS restricted** — `Access-Control-Allow-Origin` set to specific domains, not `*`

---

## 3. Authentication (MASVS-AUTH)

Authentication follows [ADR-0004](../architecture/0004-auth-security-architecture.md).
This section verifies the implementation matches the architecture.

### 3.1 Passkey / WebAuthn Verification

- [ ] **Passkey registration works on all platforms** — iOS (ASAuthorization), Android (Credential Manager), Web (navigator.credentials), Windows (Windows Hello)
- [ ] **Relying Party ID is consistent** across all platforms
- [ ] **User verification is required** (`userVerification: "required"`)
- [ ] **Attestation is validated server-side** — using SimpleWebAuthn or equivalent
- [ ] **Challenge is server-generated, single-use, and time-limited** (< 5 minutes)
- [ ] **No credential ID or public key logged in plaintext**

### 3.2 OAuth 2.0 + PKCE Verification

- [ ] **PKCE is enforced for all OAuth flows** — `flowType: 'pkce'` in Supabase config
- [ ] **`code_verifier` is cryptographically random** (>= 43 characters, RFC 7636)
- [ ] **`code_challenge_method` is S256** (not `plain`)
- [ ] **Authorization code is single-use** — server rejects replay
- [ ] **Redirect URI strictly validated** — exact match, no wildcard or open redirect
- [ ] **State parameter used for CSRF protection** (in addition to PKCE)

### 3.3 Biometric Authentication

- [ ] **Biometric prompt uses platform-native UI** — no custom biometric screens
- [ ] **`BIOMETRIC_STRONG` required on Android** — not `BIOMETRIC_WEAK`
- [ ] **Biometric gating only unlocks token access** — biometric data never leaves device
- [ ] **Fallback to PIN/password available** — but not weaker than biometric
- [ ] **Re-authentication for sensitive operations** — large transfers, settings changes, data export

### 3.4 Token Lifecycle

- [ ] **Access tokens expire in <= 15 minutes**
- [ ] **Refresh token rotation is implemented** — each use issues a new refresh token
- [ ] **Reuse detection is active** — if an old refresh token is presented, invalidate the entire family
- [ ] **JWTs contain no PII or financial data** — only `sub`, `household_id`, `role`, `jti`, `exp`
- [ ] **Token revocation endpoint exists** — for logout and forced session invalidation
- [ ] **All sessions invalidated on password change**

---

## 4. Code Quality (MASVS-CODE)

### 4.1 No Hardcoded Secrets

- [ ] **No API keys, tokens, or passwords in source code** — scan via TruffleHog (see `.github/workflows/security.yml`)
- [ ] **No secrets in build files** — `build.gradle.kts`, `vite.config.ts`, `Info.plist`
- [ ] **No secrets in CI workflow files** — all secrets via GitHub Actions secrets
- [ ] **`.env.example` has placeholders only** — never real values
- [ ] **`.gitignore` excludes** — `.env`, `.env.local`, `*.keystore`, `*.jks`, `*.p12`, `secrets/`

### 4.2 Parameterized Queries

- [ ] **All database queries are parameterized** — no string concatenation or interpolation
  - SQLDelight: `.sq` files with `?` placeholders (enforced by compiler)
  - Supabase: `.eq()`, `.filter()` methods (parameterized by default)
  - Raw SQL: **never** used — always through ORM/query builder
- [ ] **No SQL injection vectors in search** — user-entered search terms are parameterized
- [ ] **No NoSQL injection** — if any document store is used, validate/sanitize input

### 4.3 Input Validation

- [ ] **All user inputs validated on client AND server** — never trust client-side validation alone
- [ ] **Financial amounts validated** — reject negative amounts where inappropriate, enforce precision limits
- [ ] **Category names sanitized** — prevent XSS in user-created category names
- [ ] **Account names sanitized** — prevent injection in user-entered account names
- [ ] **Date inputs validated** — reject out-of-range dates, future-dated transactions if not allowed
- [ ] **File uploads (if any) validated** — type, size, content scanning

### 4.4 Dependency Security

- [ ] **No known critical/high vulnerabilities** — `npm audit`, `./gradlew dependencyCheckAnalyze`
- [ ] **Dependabot enabled** — `.github/dependabot.yml` configured for npm, Gradle, GitHub Actions
- [ ] **License compliance** — no GPL-3.0, AGPL-3.0 dependencies (see `security.yml` deny-licenses)
- [ ] **Lock files committed** — `package-lock.json`, `gradle.lockfile` ensure reproducible builds
- [ ] **Supply chain attestation** — GitHub Actions use pinned SHA commits, not mutable tags where possible

### 4.5 Error Handling

- [ ] **No stack traces in production** — error responses contain user-friendly messages only
- [ ] **No sensitive data in error messages** — no account numbers, SQL queries, or internal paths
- [ ] **Structured error logging** — server logs include correlation IDs, not user data
- [ ] **Crash reports sanitized** — crash reporting SDK configured to strip PII before upload

---

## 5. Platform-Specific Security

### 5.1 Android

- [ ] **Exported components audited** — all `<activity>`, `<service>`, `<receiver>`, `<provider>` in `AndroidManifest.xml`:
  - Components without intent filters: `android:exported="false"`
  - Deep link activities: validate incoming Intent data
  - No `android:debuggable="true"` in release builds
- [ ] **Minimum SDK >= 26 (Android 8.0)** — ensures security patches available
- [ ] **ProGuard/R8 enabled** — code shrinking and obfuscation in release builds
- [ ] **Root detection** — warn users on rooted devices (advisory, not blocking)
- [ ] **Tapjacking protection** — `filterTouchesWhenObscured="true"` on sensitive views

### 5.2 iOS

- [ ] **ATS enabled, no exceptions** — `NSAppTransportSecurity` has no `NSAllowsArbitraryLoads`
- [ ] **Data Protection: Complete** — files use `NSFileProtectionComplete` or `completeUnlessOpen`
- [ ] **Jailbreak detection** — advisory warning on jailbroken devices
- [ ] **Minimum deployment target iOS 16+** — ensures modern security APIs
- [ ] **Background snapshot protection** — blur or hide financial data in app switcher
- [ ] **URL scheme validation** — deep links validated before processing

### 5.3 Web

- [ ] **CSP deployed and enforced** — see Section 2.3
- [ ] **Subresource Integrity (SRI)** — for any CDN-loaded resources
- [ ] **Service Worker scope limited** — no overly broad scope
- [ ] **No `eval()` or `Function()` constructors**
- [ ] **DOM XSS prevention** — React JSX escaping by default, no `dangerouslySetInnerHTML`
- [ ] **CSRF protection** — `SameSite` cookies + CSRF tokens for state-changing requests

### 5.4 Windows

- [ ] **DPAPI or TPM-backed storage** — secrets not in plaintext registry or AppData
- [ ] **Code signing** — MSIX/appx packages signed with trusted certificate
- [ ] **ASLR, DEP, CFG enabled** — default for modern .NET/WinUI builds
- [ ] **No elevated permissions required** — app runs without admin rights
- [ ] **Windows Defender Application Control compatible** — no unsigned DLLs loaded

---

## 6. Dependency Vulnerability Review Process

### 6.1 Automated Scanning

| Tool                                                              | Scope                       | Frequency                     | Configuration                      |
| ----------------------------------------------------------------- | --------------------------- | ----------------------------- | ---------------------------------- |
| [Dependabot](https://docs.github.com/en/code-security/dependabot) | npm, Gradle, GitHub Actions | Daily                         | `.github/dependabot.yml`           |
| [CodeQL](https://codeql.github.com/)                              | Java/Kotlin, TypeScript     | Every push to `main` + weekly | `.github/workflows/security.yml`   |
| [TruffleHog](https://github.com/trufflesecurity/trufflehog)       | Secret detection            | Every push to `main`          | `.github/workflows/security.yml`   |
| `npm audit`                                                       | npm packages                | Every CI run                  | `npm audit --audit-level=high`     |
| OWASP Dependency-Check                                            | Gradle/JVM                  | Per release                   | `./gradlew dependencyCheckAnalyze` |

### 6.2 Vulnerability Response SLA

| Severity               | Response Time | Fix Deadline | Escalation               |
| ---------------------- | ------------- | ------------ | ------------------------ |
| Critical (CVSS >= 9.0) | 4 hours       | 24 hours     | Immediate hotfix release |
| High (CVSS 7.0–8.9)    | 24 hours      | 7 days       | Next scheduled release   |
| Medium (CVSS 4.0–6.9)  | 7 days        | 30 days      | Address in sprint        |
| Low (CVSS < 4.0)       | 30 days       | 90 days      | Address when convenient  |

### 6.3 Review Process

1. **Triage** — Dependabot/CodeQL alert appears, assign to security reviewer
2. **Assess** — Determine exploitability in Finance context (not all CVEs are relevant)
3. **Remediate** — Update dependency, apply patch, or add compensating control
4. **Verify** — Confirm fix via re-scan, add regression test if applicable
5. **Document** — Record in audit log with justification for any risk-accepted items

---

## 7. Audit Sign-Off

| Date         | Auditor | Scope             | Result        | Critical Issues | Risk Accepted               |
| ------------ | ------- | ----------------- | ------------- | --------------- | --------------------------- |
| _YYYY-MM-DD_ | _Name_  | _Full / Targeted_ | _Pass / Fail_ | _#N, #M_        | _None / #X (justification)_ |

**Sign-off criteria:** All CRITICAL and HIGH items must pass. MEDIUM items
may be risk-accepted with documented justification. LOW items are tracked
for future improvement.
