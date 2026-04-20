<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Device Attestation and Integrity Verification — Finance App

**Issue:** #331
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Assessment Complete — Implementation Specification
**MASVS Control:** MASVS-RESILIENCE-4

---

## Executive Summary

Device attestation provides **server-verifiable proof** that the Finance app is running
on a genuine, uncompromised device. Unlike client-side RASP (which can be hooked/bypassed),
device attestation is validated server-side using cryptographic proofs from the device
manufacturer (Google, Apple, Microsoft).

This document specifies the attestation strategy for each platform, the server-side
verification architecture, and the integration with the existing auth and sync flows.

### Platform Attestation APIs

| Platform | API                             | Verification                 | Key Features                                           |
| -------- | ------------------------------- | ---------------------------- | ------------------------------------------------------ |
| Android  | Play Integrity API              | Server-side (Google servers) | Device integrity verdict, app licensing, app integrity |
| iOS      | App Attest (DCAppAttestService) | Server-side (Apple servers)  | App identity, device identity, assertion counter       |
| Windows  | TPM 2.0 Attestation             | Server-side (custom)         | Hardware-backed key, platform state                    |
| Web      | N/A                             | N/A                          | No device attestation available                        |

---

## Threat Model for Device Attestation

### What Attestation Proves

| Property         | Meaning                                     | Threat Mitigated                |
| ---------------- | ------------------------------------------- | ------------------------------- |
| Device integrity | Device is not rooted/jailbroken             | Keystore/Keychain bypass        |
| App integrity    | App has not been tampered with              | Repackaged APK, modified binary |
| App licensing    | App was installed from official store       | Sideloaded malicious builds     |
| App identity     | App is signed with the expected certificate | Impersonation attacks           |

### What Attestation Does NOT Prove

- User identity (that's what auth is for)
- Network integrity (that's what cert pinning is for)
- Data confidentiality (that's what encryption is for)
- Runtime integrity between attestation checks (that's what RASP is for)

### Combined Defence: Attestation + RASP

```
                     ┌─────────────────────────┐
                     │   Server-Side Policy     │
                     │                          │
                     │  Attestation Valid?       │
                     │  ├── Yes → Normal access  │
                     │  └── No  → Degraded mode  │
                     └──────────┬──────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
    ┌─────▼─────┐         ┌────▼────┐          ┌─────▼─────┐
    │  Android   │         │  iOS    │          │  Windows  │
    │            │         │         │          │           │
    │ Play       │         │ App     │          │ TPM 2.0   │
    │ Integrity  │         │ Attest  │          │ Attest    │
    │ API        │         │         │          │           │
    │            │         │         │          │           │
    │ + RASP     │         │ + RASP  │          │ + RASP    │
    │ (local)    │         │ (local) │          │ (local)   │
    └────────────┘         └─────────┘          └───────────┘
```

---

## Platform Implementation Specifications

### 1. Android — Play Integrity API

#### Overview

The Play Integrity API (successor to SafetyNet) provides three integrity verdicts:

- **Device integrity:** `MEETS_DEVICE_INTEGRITY` (genuine, non-rooted)
- **App integrity:** `MEETS_BASIC_INTEGRITY` + `MEETS_STRONG_INTEGRITY`
- **Account licensing:** `LICENSED` (installed from Play Store)

#### Client-Side Integration

```kotlin
/**
 * Android device attestation via Play Integrity API.
 *
 * Called during:
 *   1. Initial authentication (after successful passkey/OAuth)
 *   2. Periodic re-attestation (configurable interval, default 24h)
 *   3. Before high-value operations (account deletion, data export)
 *
 * The integrity token is sent to the backend for server-side verification.
 * The client NEVER evaluates the token directly.
 */
class PlayIntegrityAttestor(
    private val context: Context,
    private val cloudProjectNumber: Long,
) {
    private val integrityManager = IntegrityManagerFactory.create(context)

    /**
     * Request an integrity token with a server-generated nonce.
     *
     * @param nonce Server-generated, single-use nonce (base64url, min 16 bytes)
     * @return The integrity token string to send to the backend
     */
    suspend fun requestIntegrityToken(nonce: String): Result<String> {
        return try {
            val request = IntegrityTokenRequest.builder()
                .setNonce(nonce)
                .setCloudProjectNumber(cloudProjectNumber)
                .build()

            val response = integrityManager
                .requestIntegrityToken(request)
                .await()

            Result.success(response.token())
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

#### Server-Side Verification (Edge Function)

```typescript
/**
 * Verify a Play Integrity token server-side.
 *
 * Uses Google's Play Integrity API to decrypt and validate the token.
 * NEVER trust the client to evaluate integrity verdicts.
 */
async function verifyPlayIntegrityToken(
  token: string,
  expectedNonce: string,
): Promise<IntegrityVerdict> {
  const response = await fetch(
    'https://playintegrity.googleapis.com/v1/' + `${PACKAGE_NAME}:decryptToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await getGoogleAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrity_token: token }),
    },
  );

  const result = await response.json();

  // Verify nonce matches
  if (result.tokenPayloadExternal?.requestDetails?.nonce !== expectedNonce) {
    return { valid: false, reason: 'nonce_mismatch' };
  }

  // Check device integrity
  const deviceIntegrity = result.tokenPayloadExternal?.deviceIntegrity?.deviceRecognitionVerdict;
  const appIntegrity = result.tokenPayloadExternal?.appIntegrity?.appRecognitionVerdict;

  return {
    valid: true,
    deviceIntegrity: deviceIntegrity?.includes('MEETS_DEVICE_INTEGRITY') ?? false,
    appIntegrity: appIntegrity === 'PLAY_RECOGNIZED',
    verdicts: deviceIntegrity ?? [],
  };
}
```

#### Play Integrity Specific Considerations

- **Rate limits:** Google limits Play Integrity API to 10,000 requests/day (standard tier)
- **Nonce generation:** Server MUST generate nonces; client MUST NOT generate its own
- **Token caching:** Tokens are single-use; do NOT cache or replay
- **Grace period:** Allow 1-2 failed attestations before restricting (network issues)
- **Emulator handling:** Emulators fail attestation — provide dev mode bypass (debug builds only)

### 2. iOS — App Attest (DCAppAttestService)

#### Overview

App Attest provides two capabilities:

1. **Key attestation:** Proves a key was generated in the Secure Enclave of a genuine Apple device
2. **Assertion:** Proves a specific request came from the attested app instance

#### Client-Side Integration

```swift
/// iOS device attestation via App Attest.
///
/// Flow:
///   1. Generate a key pair in the Secure Enclave (one-time)
///   2. Attest the key (proves device + app identity to Apple)
///   3. For each protected request, generate an assertion (proves request authenticity)
actor AppAttestManager {

    private let service = DCAppAttestService.shared
    private var keyId: String?

    /// Check if App Attest is available on this device.
    var isSupported: Bool {
        service.isSupported
    }

    /// Generate and attest a new key pair.
    /// Call once during initial app setup (after first authentication).
    func attestKey(serverChallenge: Data) async throws -> Data {
        // Generate key in Secure Enclave
        let keyId = try await service.generateKey()
        self.keyId = keyId

        // Attest the key with a server-provided challenge
        let attestation = try await service.attestKey(keyId, clientDataHash: serverChallenge)

        return attestation // Send to server for verification
    }

    /// Generate an assertion for a protected request.
    /// Call before data-export, account-deletion, or other high-value operations.
    func generateAssertion(for requestHash: Data) async throws -> Data {
        guard let keyId else {
            throw AppAttestError.keyNotGenerated
        }

        return try await service.generateAssertion(keyId, clientDataHash: requestHash)
    }
}
```

#### Server-Side Verification

```typescript
/**
 * Verify an App Attest attestation object.
 *
 * Validates:
 *   1. The attestation is signed by Apple's App Attest CA
 *   2. The nonce matches the server-generated challenge
 *   3. The app ID matches the expected bundle identifier
 *   4. The counter is as expected (prevents replay)
 *
 * Uses Apple's attestation verification format (CBOR + X.509).
 */
async function verifyAppAttestation(
  attestation: Uint8Array,
  challenge: Uint8Array,
  expectedAppId: string,
): Promise<AttestationResult> {
  // 1. Decode CBOR attestation object
  // 2. Verify X.509 certificate chain to Apple App Attest CA
  // 3. Verify nonce = SHA256(challenge || clientDataHash)
  // 4. Extract and store the public key + counter for future assertions
  // Implementation uses @simplewebauthn/server or custom CBOR/X.509 parsing
}
```

#### App Attest Specific Considerations

- **Availability:** Requires iOS 14+, A12+ chip (already met: deployment target iOS 17)
- **One key per device:** The key is tied to the Secure Enclave; lost if device is wiped
- **Counter tracking:** Server must track the assertion counter per device to prevent replay
- **Simulator handling:** App Attest is not available in simulator — use feature flag
- **Key migration:** No key migration between devices; new attestation required on new device

### 3. Windows — TPM 2.0 Attestation

#### Overview

Windows devices with TPM 2.0 can generate hardware-backed attestation statements.
The Finance app on Windows (JVM/Kotlin) can use the TPM to prove device integrity.

#### Implementation Approach

```kotlin
/**
 * Windows device attestation via TPM 2.0.
 *
 * Uses the Windows CNG (Cryptography Next Generation) API to generate
 * a TPM-backed key and attestation statement.
 *
 * Note: This requires JNI or a native helper (e.g., PowerShell script
 * via ProcessBuilder) since Java has no direct TPM API.
 */
class WindowsTpmAttestor {
    /**
     * Check if TPM 2.0 is available.
     */
    fun isTpmAvailable(): Boolean {
        // Check via WMI or registry:
        // HKLM\SYSTEM\CurrentControlSet\Services\TPM\WMI\SpecVersion
        return checkTpmRegistry()
    }

    /**
     * Generate a TPM-backed attestation statement.
     *
     * Uses Windows Hello or the Platform Crypto Provider to create
     * a key pair in the TPM and generate an attestation blob.
     */
    suspend fun attest(nonce: ByteArray): Result<AttestationBlob> {
        // Implementation via JNI to Windows CNG API
        // or via PowerShell: Get-TpmEndorsementKeyInfo
    }
}
```

**Windows-specific considerations:**

- TPM 2.0 is required for Windows 11 but optional on Windows 10
- Fallback: DPAPI-protected attestation for non-TPM devices (lower assurance)
- Enterprise environments may restrict TPM access — handle gracefully

---

## Server-Side Attestation Policy

### Architecture

```
New Edge Function: verify-device-attestation
    │
    ├─► Receive attestation token + platform identifier
    ├─► Route to platform-specific verification
    │   ├─► Android: Google Play Integrity API
    │   ├─► iOS: Apple App Attest verification
    │   └─► Windows: TPM attestation validation
    ├─► Store attestation result in device_attestations table
    ├─► Return attestation status + any policy adjustments
    └─► Other Edge Functions check attestation status
```

### Database Schema

```sql
CREATE TABLE device_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'windows')),
    attestation_id TEXT NOT NULL, -- Platform-specific device/key ID
    device_integrity BOOLEAN NOT NULL DEFAULT false,
    app_integrity BOOLEAN NOT NULL DEFAULT false,
    last_attested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attestation_counter INTEGER DEFAULT 0,
    -- Privacy: NO device identifiers, IMEI, serial numbers, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Users can only see their own attestations
ALTER TABLE device_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_attestations" ON device_attestations
    FOR ALL USING (auth.uid() = user_id);
```

### Policy Enforcement

| Attestation Result            | Session Lifetime  | Allowed Operations            | Additional Checks                             |
| ----------------------------- | ----------------- | ----------------------------- | --------------------------------------------- |
| Device + App integrity PASS   | Standard (1 hour) | All                           | None                                          |
| Device integrity FAIL         | Reduced (15 min)  | Read-only, no export/deletion | Require re-auth for writes                    |
| App integrity FAIL            | Reduced (15 min)  | Read-only                     | Show warning, log alert                       |
| Attestation unavailable (Web) | Standard          | All                           | Rely on other controls (CSP, CORS)            |
| Attestation failed (error)    | Standard          | All                           | Log, don't block (fail-open for availability) |

---

## Integration Points

### 1. Authentication Flow

```
User authenticates (passkey/OAuth)
    │
    ├─► Client requests device attestation (platform-specific)
    │
    ├─► Client sends attestation token to verify-device-attestation
    │
    ├─► Server validates attestation
    │   ├─► PASS: Set session.device_integrity = true
    │   └─► FAIL: Set session.device_integrity = false, reduce session lifetime
    │
    └─► Session includes device integrity flag for downstream policy
```

### 2. High-Value Operations

Before `account-deletion` or `data-export`:

```typescript
// In the Edge Function handler, after requireAuth():
const attestation = await getLatestAttestation(supabase, user.id);
if (!attestation?.device_integrity) {
  // Require re-attestation for high-value operations
  return errorResponse(req, 'Device attestation required', 403);
}
```

### 3. Sync Health Integration

Device attestation status is included in sync health reports (generic flag only,
no attestation details) to enable server-side monitoring of fleet integrity.

---

## Privacy Safeguards

Device attestation MUST comply with privacy requirements:

1. **No device identifiers stored** — only a platform-generated attestation ID
2. **No hardware identifiers** (IMEI, serial, MAC) ever collected
3. **Attestation results are per-user** — protected by RLS
4. **No cross-device tracking** — attestation IDs are opaque and non-correlatable
5. **Attestation failure does not reveal reason** to client — generic error only
6. **Data retention:** Attestation records deleted with account (GDPR Art. 17)
7. **DSAR export:** Attestation records included in data export (GDPR Art. 20)

---

## Implementation Roadmap

| Phase   | Priority | Control                                   | Effort   | Target               |
| ------- | -------- | ----------------------------------------- | -------- | -------------------- |
| Phase 1 | P1       | Play Integrity API (Android)              | 3-4 days | Post-launch sprint 1 |
| Phase 1 | P1       | Server-side verification Edge Function    | 2-3 days | Post-launch sprint 1 |
| Phase 1 | P1       | device_attestations table + RLS           | 1 day    | Post-launch sprint 1 |
| Phase 2 | P2       | App Attest (iOS)                          | 3-4 days | Post-launch sprint 2 |
| Phase 2 | P2       | Assertion verification for high-value ops | 2 days   | Post-launch sprint 2 |
| Phase 3 | P3       | TPM attestation (Windows)                 | 5-7 days | Post-launch sprint 3 |
| Phase 3 | P3       | Policy engine integration                 | 3-5 days | Post-launch sprint 3 |

---

## References

- Google Play Integrity API: https://developer.android.com/google/play/integrity
- Apple App Attest: https://developer.apple.com/documentation/devicecheck/dcappattestservice
- OWASP MASVS v2: MASVS-RESILIENCE-4 (Integrity Verification)
- FIDO Alliance: Device attestation standards
- TPM 2.0 Specification: https://trustedcomputinggroup.org/resource/tpm-library-specification/
