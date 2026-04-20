<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Session Binding and Device Fingerprinting Strategy — Finance App

**Issue:** #334
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Assessment Complete — Implementation Specification
**MASVS Control:** MASVS-AUTH-2, MASVS-NETWORK-3

---

## Executive Summary

Session binding ties an authentication session to a specific device and context,
preventing token theft from being exploitable on a different device. Combined with
device fingerprinting, it creates a multi-factor session verification that detects
when a token is used from an unexpected environment.

### Current Session Architecture

| Component     | Implementation                             | Binding             | Assessment                                    |
| ------------- | ------------------------------------------ | ------------------- | --------------------------------------------- |
| Access Token  | JWT (Supabase)                             | None (bearer token) | ❌ Unbounded — usable from any device         |
| Refresh Token | Opaque (Supabase)                          | None                | ❌ Unbounded                                  |
| Token Storage | Platform-secure (Keychain, Keystore, etc.) | Device-local        | ✅ Cannot be extracted without root/jailbreak |
| Passkey Auth  | WebAuthn                                   | Device-bound key    | ✅ Cannot be replayed                         |
| PKCE          | Code verifier                              | In-memory only      | ✅ Single-use                                 |

**Key Gap:** Once a JWT access token or refresh token is extracted (via root/jailbreak,
debugger, memory dump, or logging), it can be used from **any device** without
restriction. There is no server-side mechanism to detect or prevent this.

---

## Threat Model

### Token Theft Scenarios

| Scenario                                | Likelihood | Impact | Current Mitigation                 |
| --------------------------------------- | ---------- | ------ | ---------------------------------- |
| Token extracted from rooted device      | Medium     | HIGH   | Platform-secure storage            |
| Token leaked in crash report            | Low        | HIGH   | Logger PII exclusions              |
| Token intercepted via MITM (no pinning) | Medium     | HIGH   | TLS (no pinning yet)               |
| Token stolen from memory dump           | Low        | HIGH   | Short token lifetime               |
| Malware on device reads token           | Medium     | HIGH   | App sandbox                        |
| Insider/developer accesses logs         | Low        | MEDIUM | Structured logging with exclusions |

### What Session Binding Prevents

With session binding, a stolen token is **non-transferable**:

- Using the token from a different device → rejected
- Using the token from a different IP range → flagged
- Using the token with a different user agent → flagged
- Replaying the token after device context changes → rejected

---

## Session Binding Architecture

### Design

```
Authentication (passkey/OAuth)
    │
    ├─► Client generates device fingerprint
    │   ├── Platform ID (Android/iOS/Web/Windows)
    │   ├── App version
    │   ├── OS version
    │   ├── Locale / timezone offset
    │   └── Screen resolution category (not exact)
    │
    ├─► Client sends fingerprint with auth request
    │
    ├─► Server stores fingerprint hash with session
    │
    ├─► On each API request:
    │   ├── Client includes device fingerprint header
    │   ├── Server compares with stored fingerprint
    │   ├── Exact match → proceed normally
    │   ├── Partial match → log anomaly, proceed (soft enforcement)
    │   └── No match → reject or require re-auth (hard enforcement)
    │
    └─► Session includes binding metadata in JWT claims
```

### Device Fingerprint Composition

**Privacy-preserving fingerprint** — collects NO unique device identifiers:

```kotlin
/**
 * Generate a privacy-preserving device fingerprint.
 *
 * PRIVACY: This fingerprint deliberately avoids unique identifiers
 * (IMEI, serial number, MAC address, advertising ID). It uses only
 * categorical attributes that describe the device class, not the
 * specific device instance. Many devices will share the same fingerprint.
 *
 * This is NOT a tracking mechanism — it's a session anomaly detector.
 * The fingerprint is hashed before transmission (SHA-256) so the
 * server never sees the raw attributes.
 */
data class DeviceFingerprint(
    val platform: String,          // "android", "ios", "web", "windows"
    val platformVersion: String,   // "14", "17.5", "chromium-126", "11"
    val appVersion: String,        // "1.0.0"
    val locale: String,            // "en-US"
    val timezoneOffset: Int,       // UTC offset in minutes (-480 for PST)
    val screenCategory: String,    // "phone", "tablet", "desktop"
    val biometricCapability: String, // "face", "fingerprint", "none"
) {
    /**
     * Compute a SHA-256 hash of the fingerprint attributes.
     *
     * The server stores and compares this hash, never the raw attributes.
     * This prevents the fingerprint from being reversed to identify the device.
     */
    fun toHash(): String {
        val raw = "$platform|$platformVersion|$appVersion|$locale|$timezoneOffset|$screenCategory|$biometricCapability"
        return PlatformSHA256.hash(raw.encodeToByteArray()).toHexString()
    }

    override fun toString(): String = "DeviceFingerprint(hash=${toHash().take(8)}...)"
}
```

### Server-Side Session Binding

#### JWT Custom Claims

Add device fingerprint hash to JWT custom claims via Supabase auth hook:

```typescript
/**
 * Auth hook to embed device context in JWT claims.
 *
 * Called by Supabase Auth on token creation/refresh.
 * Adds a `device_fingerprint_hash` claim to the JWT.
 */
async function authHook(event: AuthHookEvent): Promise<AuthHookResponse> {
  const fingerprintHash = event.claims.app_metadata?.device_fingerprint_hash;

  return {
    claims: {
      ...event.claims,
      // Embed device context for downstream verification
      device_fingerprint_hash: fingerprintHash,
    },
  };
}
```

#### Middleware: Session Context Verification

```typescript
/**
 * Verify that the request's device context matches the session's
 * bound device fingerprint.
 *
 * This is a SOFT enforcement initially — mismatches are logged but
 * not rejected. After a monitoring period, switch to hard enforcement
 * for sensitive operations.
 */
async function verifySessionBinding(
  req: Request,
  user: AuthenticatedUser,
): Promise<SessionBindingResult> {
  const requestFingerprint = req.headers.get('x-device-fingerprint');
  const sessionFingerprint = user.device_fingerprint_hash; // from JWT

  if (!requestFingerprint || !sessionFingerprint) {
    return { status: 'unbound', action: 'allow' };
  }

  if (requestFingerprint === sessionFingerprint) {
    return { status: 'match', action: 'allow' };
  }

  // Mismatch — potential token theft or legitimate device change
  return {
    status: 'mismatch',
    action: 'flag', // Initially soft enforcement
    // In hard enforcement mode: action: 'require_reauth'
  };
}
```

### Phased Enforcement

| Phase                    | Mode                   | Mismatch Response                                 | Duration  |
| ------------------------ | ---------------------- | ------------------------------------------------- | --------- |
| Phase 1: Monitor         | Soft                   | Log anomaly, allow request                        | 4-6 weeks |
| Phase 2: Warn            | Soft                   | Log + notify user of new device                   | 2-4 weeks |
| Phase 3: Enforce (reads) | Hard for sensitive ops | Require re-auth for data-export, account-deletion | Ongoing   |
| Phase 4: Enforce (all)   | Hard                   | Require re-auth for all operations on mismatch    | Ongoing   |

---

## Combined Biometric + Session Architecture

### High-Value Operation Flow

```
User requests account deletion
    │
    ├─► 1. Session binding check (device fingerprint match)
    │       │
    │       ├── Match → proceed
    │       └── Mismatch → require re-auth + fresh biometric
    │
    ├─► 2. Biometric authentication (CryptoObject-bound)
    │       │
    │       └── Sign operation challenge with biometric-bound key
    │
    ├─► 3. Device attestation check (if available)
    │       │
    │       └── Verify device integrity
    │
    ├─► 4. Server verification
    │       ├── Verify biometric signature (public key on server)
    │       ├── Verify device fingerprint matches session
    │       ├── Verify attestation is current
    │       └── Verify rate limit and abuse check
    │
    └─► 5. Execute operation
```

### Security Properties of Combined Approach

| Property                  | Provided By                         | Attack Prevented                      |
| ------------------------- | ----------------------------------- | ------------------------------------- |
| **Identity verification** | Biometric + CryptoObject            | Impersonation, callback hooking       |
| **Device binding**        | Session fingerprint + token binding | Token theft cross-device use          |
| **Device integrity**      | Attestation                         | Rooted/jailbroken device exploitation |
| **Freshness**             | Server nonce + timestamp            | Replay attacks                        |
| **Non-repudiation**       | Signed operation challenge          | Denial of action                      |

---

## Findings

### SB-1: Tokens Are Pure Bearer Tokens — Severity: HIGH

**Files:**

- `packages/sync/src/commonMain/kotlin/com/finance/sync/auth/AuthSession.kt`
- `packages/sync/src/commonMain/kotlin/com/finance/sync/auth/TokenManager.kt`

**Description:** The current JWT access tokens are pure bearer tokens with no
device binding. Any party possessing the token can use it from any device. The
refresh token is similarly unbounded. Combined with the root/jailbreak risk
(no RASP), token extraction leads directly to session hijacking.

**Recommendation:** Implement device fingerprint binding in JWT custom claims
via Supabase auth hooks. Start with soft enforcement (logging) and graduate
to hard enforcement for sensitive operations.

### SB-2: No Session Invalidation on Device Context Change — Severity: MEDIUM

**Description:** When a user's device context changes (e.g., OS update, app update),
the fingerprint changes but there is no mechanism to re-bind the session. The user
must re-authenticate. This needs graceful handling to avoid false positives.

**Recommendation:** Allow partial fingerprint matches (e.g., if only `appVersion`
or `platformVersion` changed, accept with a log entry). Only flag when multiple
attributes change simultaneously.

### SB-3: Refresh Token Rotation Not Enforced — Severity: MEDIUM

**Description:** While Supabase supports refresh token rotation (each use generates
a new refresh token), the current implementation doesn't verify that old refresh
tokens are invalidated. An attacker who steals a refresh token could use it
indefinitely in parallel with the legitimate user.

**Recommendation:** Enable Supabase's refresh token rotation and verify that
old tokens are invalidated after use. Detect parallel session usage (same refresh
token used from different fingerprints) as a session hijacking indicator.

### SB-4: No Session Concurrency Limits — Severity: LOW

**Description:** No limit on the number of concurrent sessions per user. While
this is a UX convenience (multiple devices), it increases the attack surface
for token theft. A compromised token creates a parallel session with no detection.

**Recommendation:** Display active sessions in account settings. Allow users
to revoke sessions. Alert when a new session is created from an unusual context.

---

## Privacy Safeguards

Session binding MUST comply with privacy requirements:

1. **No unique device identifiers** — fingerprint uses categorical attributes only
2. **Fingerprint is hashed** — server never sees raw attributes
3. **Not a tracking mechanism** — many devices share the same fingerprint
4. **No cross-site correlation** — fingerprint is application-specific
5. **GDPR transparency:** Document fingerprint collection in privacy policy
6. **User control:** Allow users to view and clear their device registrations
7. **Data retention:** Device data deleted with account (GDPR Art. 17)

---

## Recommendations Summary

| Priority | Finding                                                 | Action                                    | Effort   |
| -------- | ------------------------------------------------------- | ----------------------------------------- | -------- |
| **P1**   | SB-1: Token device binding                              | Implement device fingerprint + JWT claims | 5-7 days |
| **P1**   | BIO-1: CryptoObject binding (from biometric assessment) | Bind biometric to Keystore operation      | 3-4 days |
| **P2**   | SB-2: Graceful fingerprint change handling              | Partial match logic with threshold        | 2 days   |
| **P2**   | SB-3: Refresh token rotation                            | Enable and verify Supabase token rotation | 1-2 days |
| **P3**   | SB-4: Session concurrency                               | Active sessions UI + revocation           | 3-5 days |

---

## References

- OWASP MASVS v2: MASVS-AUTH-2 (Session Management)
- OWASP Session Management Cheat Sheet
- RFC 8471: Token Binding Protocol
- NIST SP 800-63B: Digital Identity Guidelines (Authentication)
- Supabase Auth Hooks: https://supabase.com/docs/guides/auth/auth-hooks
