# ADR-0004: Authentication & Security Architecture

**Status:** Proposed
**Date:** 2025-07-15
**Author:** AI agent (Copilot), with human review pending
**Reviewers:** TBD

## Context

Finance is a multi-platform financial tracking application (iOS, Android, Web, Windows) that handles sensitive personal financial data. The application requires financial-grade security with a privacy-first, edge-first architecture that supports offline operation, household sharing, and biometric authentication.

Key forces driving this decision:

- **Financial-grade security:** Users trust us with transaction data, account balances, and spending patterns. A breach would be catastrophic for trust and potentially expose users to financial fraud.
- **Multi-platform consistency:** Authentication must work identically across iOS, Android, Web, and Windows while leveraging each platform's native security hardware (Secure Enclave, TEE, TPM).
- **Offline-first requirement:** Users must be able to access their data without a network connection, which requires cached credentials with appropriate security gating.
- **Household sharing:** Multiple users within a household share financial data with role-based access, requiring a multi-tenant authorization model.
- **Regulatory compliance:** GDPR, CCPA/CPRA, and financial data handling standards (PCI DSS awareness, SOC 2 principles) impose strict requirements on data handling, encryption, and user rights.
- **Phishing resistance:** Traditional passwords are the #1 attack vector for financial applications. We need a fundamentally phishing-resistant primary authentication method.

## Decision

We will implement a **layered authentication and security architecture** with the following key components:

### 1. Passkeys (WebAuthn/FIDO2) as Primary Authentication

Passkeys provide phishing-resistant, passwordless authentication using platform-native APIs. Users register a passkey on their device, which creates a public/private key pair. The private key never leaves the device's secure hardware.

**Platform implementation:**

| Platform | Passkey API | Key Sync |
|----------|------------|----------|
| iOS 16+ | `ASAuthorizationPlatformPublicKeyCredentialProvider` | iCloud Keychain |
| Android 9+ | Credential Manager API | Google Password Manager |
| Web | `navigator.credentials.create()` / `.get()` | Browser sync |
| Windows | Windows Hello | Microsoft account |

**Registration and authentication ceremonies** are handled server-side using [SimpleWebAuthn](https://simplewebauthn.dev/), with a consistent Relying Party ID (`RPID`) set to the application domain across all platforms.

### 2. OAuth 2.0 + PKCE as Fallback

OAuth 2.0 with PKCE (Proof Key for Code Exchange, per RFC 9700) serves as the fallback authentication method and the mechanism for initial account creation via social providers (Apple Sign-In, Google Sign-In).

**Flow:**
1. Client generates random `code_verifier`, derives `code_challenge` (SHA-256).
2. Authorization request includes `code_challenge`.
3. User authenticates at the authorization server.
4. Client redeems the authorization code with the original `code_verifier`.
5. Server validates the challenge/verifier pair and issues tokens.

**Platform browser integration:**

| Platform | System Browser | Redirect Handling |
|----------|---------------|-------------------|
| iOS | `ASWebAuthenticationSession` | Universal Links |
| Android | Chrome Custom Tabs | App Links |
| Web | Standard redirect | Origin validation |
| Windows | System browser / WAM | Custom URI scheme |

Social auth (Apple Sign-In, Google Sign-In) uses OAuth 2.0 + PKCE under the hood. Apple's "Hide My Email" relay is supported.

### 3. Biometric Gating Per Platform

Biometric authentication gates access to locally stored credentials and tokens. The application never sees raw biometric data — only the platform-provided pass/fail response.

| Platform | API | Hardware |
|----------|-----|----------|
| iOS | `LocalAuthentication` (LAContext) | Secure Enclave |
| Android | `BiometricPrompt` (androidx.biometric) | TEE / Secure Element |
| Windows | `Windows.Security.Credentials.UI` | TPM / VBS |
| Web | WebAuthn `userVerification: "required"` | Platform authenticator |

**Security requirements:**
- Biometric unlock gates access to Keychain/Keystore-stored tokens only.
- Sensitive operations (large transfers, settings changes) require re-authentication.
- PIN/password fallback is always available.

### 4. Token Management — JWT + Opaque Refresh Tokens

**Access tokens:** Short-lived JWTs (15-minute expiry), signed with ES256. Self-contained for stateless validation. Include `jti` (JWT ID) for revocation tracking. Never contain sensitive data (financial info, PII).

**Refresh tokens:** Opaque, server-stored tokens with metadata. Easy to revoke by deleting from the store. 30-day inactivity expiry.

**Refresh token rotation:** Every use of a refresh token issues a new one and invalidates the old one. If a previously-used refresh token is presented (reuse detection), the entire token family is invalidated and the user is forced to re-authenticate.

### 5. Secure Token Storage Per Platform

| Platform | Storage | Encryption | Configuration |
|----------|---------|------------|---------------|
| iOS | Keychain Services | Hardware (Secure Enclave) | `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` |
| Android | Android Keystore + EncryptedSharedPreferences | Hardware (TEE/SE) | `AndroidKeyStore` provider |
| Windows | DPAPI / Credential Locker | User/machine-bound | `Windows.Security.Credentials.PasswordVault` |
| Web | HttpOnly + Secure + SameSite cookies | TLS in transit | **Never** localStorage for tokens |

### 6. Hybrid E2E Encryption for Sensitive Fields

Pure end-to-end encryption prevents server-side search and sync operations. We adopt a **hybrid approach:**

- **Encrypted client-side:** Transaction amounts, account numbers, notes, balances (sensitive fields).
- **Server-readable:** Timestamps, categories, `household_id`, sync metadata (required for sync and search).

**Envelope encryption pattern:**
- Data encrypted with a **Data Encryption Key (DEK)** using AES-256-GCM.
- DEK encrypted with a **Key Encryption Key (KEK)** stored in the platform's Keychain/Keystore.

### 7. Key Derivation — Argon2id

**Key hierarchy:**
```
Master Password / Biometric
    └─► Key Derivation (Argon2id, 256-bit)
        └─► Master Key (stored in Keychain/Keystore)
            ├─► Data Encryption Key (DEK) — per-database
            ├─► Sync Encryption Key — for cloud sync
            └─► Sharing Key — for household key exchange
```

**Argon2id parameters:** ≥64 MB memory, ≥3 iterations, 256-bit output, unique per-user salt.

**Key rotation:** DEKs rotated periodically with background re-encryption. Master key rotated on password change. **Crypto-shredding** for account deletion: destroy the KEK to make all encrypted data permanently irrecoverable.

### 8. Household RBAC Model

A "household" is the multi-tenant unit and data isolation boundary:

```
Household (tenant)
├── Owner (1) — full control
├── Partner (0-N) — read/write most data, limited admin
├── Member (0-N) — read/write own data, read shared
└── Viewer (0-N) — read-only access to shared data
```

**Permission matrix:**

| Permission | Owner | Partner | Member | Viewer |
|-----------|-------|---------|--------|--------|
| View own transactions | ✅ | ✅ | ✅ | ❌ |
| View shared transactions | ✅ | ✅ | ✅ | ✅ |
| Create transactions | ✅ | ✅ | ✅ | ❌ |
| Edit others' transactions | ✅ | ✅ | ❌ | ❌ |
| Manage budgets | ✅ | ✅ | ❌ | ❌ |
| Invite/remove members | ✅ | ✅* | ❌ | ❌ |
| Delete household | ✅ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ |
| Export all data | ✅ | ✅ | Own only | ❌ |

*Partners can invite Members and Viewers, not other Partners.

### 9. PostgreSQL Row-Level Security for Tenant Isolation

Every table containing user data includes a `household_id` column. PostgreSQL RLS policies enforce tenant isolation at the database level as defense-in-depth:

```sql
-- Enable RLS on the transactions table
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see transactions in their household
CREATE POLICY transactions_household_isolation ON transactions
  USING (household_id = current_setting('app.current_household_id')::uuid);

-- Policy: role-based write access
CREATE POLICY transactions_write ON transactions
  FOR INSERT
  WITH CHECK (
    household_id = current_setting('app.current_household_id')::uuid
    AND current_setting('app.current_role') IN ('owner', 'partner', 'member')
  );
```

Authorization is checked at three layers (defense-in-depth):
1. **API gateway:** JWT `household_id` claim validated against requested resource.
2. **Service layer:** Policy engine evaluates `(user, role, household, resource, action) → allow/deny`.
3. **Data access layer:** PostgreSQL RLS enforces isolation regardless of application logic bugs.

## Alternatives Considered

### Alternative 1: Email/Password Authentication

- **Pros:** Universally understood; simple to implement; no platform-specific APIs needed; works on all devices.
- **Cons:** Phishing-vulnerable (the #1 attack vector for financial apps); password reuse across sites; requires password storage and rotation policies; weaker security posture than passkeys; higher user friction (remembering passwords, reset flows).

### Alternative 2: Magic Links Only

- **Pros:** No passwords to remember or store; simple user experience; reduced attack surface (no credential database).
- **Cons:** Requires email access for every login (unusable offline); vulnerable to email account compromise; higher latency (wait for email delivery); not suitable as primary auth for a financial application that needs instant, offline-capable access.

### Alternative 3: Social-Only Authentication (Apple/Google)

- **Pros:** Minimal friction; leverages existing identity providers; no credential management.
- **Cons:** Vendor lock-in to identity providers; no offline auth capability; users without Apple/Google accounts excluded; privacy concerns with third-party identity dependency; provider outages block all access.

### Alternative 4: Server-Side Session Tokens (No JWTs)

- **Pros:** Easy revocation; no token data exposure; simpler implementation.
- **Cons:** Every API request requires a server-side session lookup (latency); poor fit for offline-first architecture; horizontal scaling requires shared session store; doesn't support stateless edge validation.

## Consequences

### Positive

- **Phishing-resistant primary auth** eliminates the most common attack vector for financial applications.
- **Offline-first capable:** Biometric-gated cached tokens allow full app functionality without network access.
- **Defense-in-depth:** Three authorization layers (gateway, service, database RLS) ensure a bug in one layer doesn't expose data.
- **GDPR-compliant deletion:** Crypto-shredding makes data irrecoverable without the KEK, including in backups.
- **Platform-native security:** Each platform uses its best available hardware security (Secure Enclave, TEE, TPM).
- **Household sharing:** RBAC model supports real-world family financial management with appropriate access controls.

### Negative

- **Increased implementation complexity:** Passkey integration requires platform-specific code for each of the four platforms plus server-side ceremony handling.
- **Key management overhead:** The envelope encryption pattern with key hierarchy requires careful implementation to avoid key loss scenarios.
- **Hybrid E2E limits server capabilities:** Server-side analytics, search across encrypted fields, and reporting are constrained by the encryption boundary.
- **Passkey adoption curve:** Some users may be unfamiliar with passkeys and require educational onboarding.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Key loss (user locked out) | Medium | High | Key recovery via backup codes, social auth re-link, email OTP fallback |
| Passkey platform support gaps | Low | Medium | OAuth 2.0 + PKCE fallback always available |
| RLS policy misconfiguration | Low | Critical | Automated RLS policy tests in CI; audit logging of all cross-boundary attempts |
| Refresh token compromise | Low | High | Token rotation + reuse detection + device binding |
| Argon2id performance on low-end devices | Medium | Low | Tune parameters per platform; use platform Keychain/Keystore for subsequent unlocks |

## Implementation Notes

### Supabase Auth Configuration

The backend uses Supabase Auth, which natively supports OAuth 2.0 + PKCE and can be extended for passkey support:

```typescript
// supabase auth configuration (services/api)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',           // Enforce PKCE for all OAuth flows
    autoRefreshToken: true,      // Automatic token refresh
    persistSession: true,        // Session persistence (platform-specific storage adapter)
    detectSessionInUrl: true,    // Handle OAuth redirects
  },
});

// Social auth example
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'apple',
  options: {
    redirectTo: 'finance://auth/callback',
    scopes: 'email name',
  },
});
```

### Platform-Specific Biometric Integration

**iOS (Swift):**
```swift
import LocalAuthentication

func authenticateWithBiometrics() async throws -> Bool {
    let context = LAContext()
    context.localizedReason = "Unlock Finance to view your accounts"

    // Require biometric only (no passcode fallback for initial unlock)
    context.biometryType == .faceID || context.biometryType == .touchID

    return try await context.evaluatePolicy(
        .deviceOwnerAuthenticationWithBiometrics,
        localizedReason: "Access your financial data"
    )
}

// After biometric success, retrieve tokens from Keychain
func retrieveTokenFromKeychain() throws -> String {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.finance.auth",
        kSecAttrAccount as String: "access_token",
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        kSecReturnData as String: true,
    ]
    // ... Keychain retrieval
}
```

**Android (Kotlin):**
```kotlin
import androidx.biometric.BiometricPrompt

fun showBiometricPrompt(activity: FragmentActivity, onSuccess: (BiometricPrompt.AuthenticationResult) -> Unit) {
    val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Unlock Finance")
        .setSubtitle("Verify your identity to access your accounts")
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .setNegativeButtonText("Use PIN")
        .build()

    val biometricPrompt = BiometricPrompt(activity, executor,
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                onSuccess(result)
                // Retrieve tokens from Android Keystore
            }
        }
    )
    biometricPrompt.authenticate(promptInfo)
}
```

### Authentication Flow Decision Tree

```
User opens app
    │
    ├─ Has cached session + biometric enrolled?
    │   └─ YES → Biometric prompt → Unlock Keychain/Keystore token
    │       ├─ Access token valid? → Proceed (offline-capable)
    │       └─ Access token expired? → Attempt refresh
    │           ├─ Online? → Refresh token rotation → New tokens
    │           └─ Offline? → Allow read-only with cached data
    │
    └─ NO cached session
        ├─ Has passkey? → WebAuthn authentication
        ├─ Social auth? → OAuth 2.0 + PKCE (Apple/Google)
        ├─ Email/password? → OAuth 2.0 + PKCE
        └─ New user? → Sign up → Passkey registration encouraged
```

### Household Key Sharing Protocol

For E2E encryption with shared household data:
1. Owner generates household KEK during household creation.
2. KEK is encrypted with each member's public key (from passkey or derived key pair).
3. On member invite: encrypt household KEK with the new member's public key.
4. On member removal: rotate household KEK, re-encrypt for all remaining members.
5. Shared data is encrypted with a DEK derived from the household KEK.

### Local Database Encryption

All platforms use SQLCipher for local SQLite database encryption (AES-256-GCM). The encryption key is derived from the user's master key stored in the platform Keychain/Keystore:

| Platform | DB Encryption | Key Storage |
|----------|--------------|-------------|
| iOS | SQLCipher + Data Protection API | Keychain (Secure Enclave) |
| Android | SQLCipher + EncryptedFile | Keystore (TEE) |
| Windows | SQLCipher + DPAPI | DPAPI / TPM |
| Web | IndexedDB + Web Crypto API | Web Crypto non-extractable keys |

### Compliance Implementation

| Right | Implementation |
|-------|---------------|
| GDPR Right to Access | Self-serve data export (JSON/CSV) across local + backend |
| GDPR Right to Erasure | Crypto-shredding: destroy KEK → all data irrecoverable |
| GDPR Right to Portability | Automated machine-readable export |
| CCPA Right to Delete | Honor deletion requests with crypto-shredding |
| CCPA Right to Opt-Out | No sale/sharing of personal information |

## References

- [RFC 9700 — OAuth 2.0 Security Best Current Practice (Jan 2025)](https://datatracker.ietf.org/doc/rfc9700/)
- [FIDO Alliance — Passkeys](https://fidoalliance.org/passkeys/)
- [OWASP MASVS — Mobile Application Security](https://mas.owasp.org/)
- [SimpleWebAuthn — Passkeys](https://simplewebauthn.dev/docs/advanced/passkeys/)
- [ADR-0001: Edge-First Sync Architecture](./0001-edge-first-sync-architecture.md) (related — offline auth strategy)
- [ADR-0002: Cross-Platform Framework Selection](./0002-cross-platform-framework-selection.md) (related — platform APIs)
