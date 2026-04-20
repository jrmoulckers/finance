<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Biometric Security: Liveness Detection Assessment — Finance App

**Issue:** #333
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Assessment Complete — Implementation Specification
**MASVS Control:** MASVS-AUTH-3

---

## Executive Summary

Biometric authentication in the Finance app currently relies on platform-native APIs
(BiometricPrompt on Android, LAContext on iOS, Windows Hello on Windows). While these
APIs provide strong Class 3 / BIOMETRIC_STRONG biometrics with hardware-backed
cryptographic operations, they are vulnerable to **presentation attacks** (spoofing)
using photos, 3D masks, or synthetic fingerprints.

Liveness detection adds a layer of verification that the biometric sample comes from
a living person physically present at the device — not a spoofed artifact. For a
financial application, this is a **defense-in-depth** control against account takeover
via biometric bypass.

### Current Biometric Implementation

| Platform | API                                    | Biometric Type             | Liveness Detection   | Assessment  |
| -------- | -------------------------------------- | -------------------------- | -------------------- | ----------- |
| Android  | BiometricPrompt                        | BIOMETRIC_STRONG (Class 3) | Hardware-dependent   | ⚠️ Variable |
| iOS      | LAContext (.deviceOwnerAuthentication) | Face ID / Touch ID         | Apple-native (depth) | ✅ Strong   |
| Windows  | Windows Hello                          | Face / Fingerprint / PIN   | Hardware-dependent   | ⚠️ Variable |
| Web      | N/A                                    | N/A                        | N/A                  | N/A         |

---

## Threat Model: Biometric Bypass

### Attack Vectors

| Attack                   | Target             | Complexity | Success Rate (no liveness) | Success Rate (with liveness) |
| ------------------------ | ------------------ | ---------- | -------------------------- | ---------------------------- |
| High-res photo           | Face recognition   | Low        | Medium (35-65%)            | Very Low (<5%)               |
| 3D-printed mask          | Face recognition   | High       | High (60-80%)              | Low (10-20%)                 |
| Video replay             | Face recognition   | Low        | Medium (30-50%)            | Very Low (<5%)               |
| Silicone fingerprint     | Fingerprint        | Medium     | High (50-70%)              | Low (5-15%)                  |
| Gummy finger (gelatin)   | Fingerprint        | Low        | Medium (40-60%)            | Very Low (<5%)               |
| Deepfake video           | Face recognition   | High       | Medium (varies)            | Low (varies)                 |
| Sleep/unconscious attack | Face / Fingerprint | Low        | High (80%+)                | N/A (physical)               |

### Risk Assessment

| Scenario                             | Likelihood | Impact                  | Risk   | Mitigation                     |
| ------------------------------------ | ---------- | ----------------------- | ------ | ------------------------------ |
| Stolen device + face photo           | Medium     | HIGH (account access)   | HIGH   | Attention detection + liveness |
| Coerced biometric (duress)           | Low        | CRITICAL (full access)  | MEDIUM | Duress PIN (out of scope)      |
| Synthetic fingerprint at ATM         | Very Low   | HIGH (if device stolen) | LOW    | Liveness detection             |
| Partner/family access while sleeping | Medium     | HIGH (financial snoop)  | HIGH   | Attention-aware Face ID        |

---

## Platform Liveness Capabilities

### 1. Android Liveness Detection

#### Hardware-Backed Liveness (Class 3)

Android's BIOMETRIC_STRONG (Class 3) requirement already mandates that the sensor
implementation pass **Presentation Attack Detection (PAD)** testing. However, the
quality of PAD varies significantly between device manufacturers:

| Vendor                         | Face Sensor                | PAD Quality | Liveness               |
| ------------------------------ | -------------------------- | ----------- | ---------------------- |
| Google Pixel                   | IR structured light        | Excellent   | 3D depth + IR liveness |
| Samsung Galaxy                 | Camera-based (some models) | Variable    | Depends on model       |
| Samsung Galaxy (ultrasonic FP) | Ultrasonic under-display   | Excellent   | Pulse detection        |
| Others                         | Optical / camera           | Poor-Good   | Varies widely          |

**Current state:** `BiometricAuthManager.kt` correctly requires `BIOMETRIC_STRONG`,
which filters out weak sensors. However, even Class 3 sensors have variable PAD quality.

**Enhancement options:**

1. **Android Face API (ML Kit):** Google's face detection includes liveness scores
   (eye open, smile detection, face mesh). Can supplement hardware biometrics.

2. **Play Integrity API + Biometric:** Combine device attestation with biometric
   result for server-side verification that biometric was performed on a genuine device.

3. **Third-party liveness SDK:** Commercial options (FaceTec, iProov, BioID) provide
   certified ISO 30107-3 PAD testing. High cost, adds dependency.

**Recommendation for Finance app:**

- **Phase 1:** Rely on BIOMETRIC_STRONG (Class 3) hardware PAD — already implemented
- **Phase 2:** Add attention detection for face auth (require eyes open)
- **Phase 3:** Evaluate third-party liveness SDK if fraud rates justify cost

#### Android-Specific Code Enhancement

```kotlin
/**
 * Enhanced biometric authentication with liveness awareness.
 *
 * Adds cryptographic proof of biometric authentication by using
 * CryptoObject to bind the biometric result to a Keystore operation.
 * This prevents replay of biometric results.
 */
fun authenticateWithCrypto(
    activity: FragmentActivity,
    onSuccess: (BiometricPrompt.CryptoObject) -> Unit,
    onError: (String) -> Unit,
) {
    // Create a key that requires biometric auth to use
    val cipher = getCryptoObject() // AES cipher backed by Keystore
    // The key is only usable after successful biometric auth
    // This binds the biometric event to a cryptographic operation
    biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
}
```

**Key improvement:** Using `CryptoObject` creates a **cryptographic binding** between
the biometric authentication event and a Keystore operation. This means:

- A hooked `onAuthenticationSucceeded()` callback is useless without the CryptoObject
- The biometric result is tied to a specific cryptographic key in hardware
- Replay attacks become impossible (each CryptoObject is single-use)

### 2. iOS Liveness Detection

#### Native Face ID Liveness

Face ID on iOS uses a TrueDepth camera system with:

- **Structured light projection** (30,000 IR dots)
- **2D + 3D depth mapping**
- **Attention awareness** (detects if eyes are looking at device)
- **Neural Engine processing** (on-device ML for anti-spoofing)

Face ID's PAD is among the strongest in the industry. Apple reports a false acceptance
rate (FAR) of < 1 in 1,000,000 with a presentation attack detection passing rate well
above ISO 30107-3 Level 2.

**Current state:** `BiometricAuthManager.swift` uses `.deviceOwnerAuthentication`
which enables Face ID with passcode fallback. This is correct.

**Enhancement options:**

1. **Require `.biometryCurrentSet`:** Use this access control flag on Keychain items
   to ensure biometric template hasn't changed (prevents adding a new face after
   compromise). **Already implemented** in `KeychainManager.swift`.

2. **Bind to Secure Enclave operations:** Similar to Android CryptoObject, create a
   Secure Enclave key that requires biometric auth to use:

```swift
/// Create a Secure Enclave key that requires biometric authentication.
/// The private key never leaves the Secure Enclave.
func createBiometricBoundKey() throws -> SecKey {
    let access = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .biometryCurrentSet],
        nil
    )!

    let attributes: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs as String: [
            kSecAttrIsPermanent as String: true,
            kSecAttrApplicationTag as String: "com.finance.biometric-bound",
            kSecAttrAccessControl as String: access,
        ],
    ]

    var error: Unmanaged<CFError>?
    guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        throw error!.takeRetainedValue() as Error
    }
    return privateKey
}
```

3. **LAContext.biometryType validation:** Verify the device supports Face ID
   (not just Touch ID) before allowing face-based authentication for high-value
   operations:

```swift
func requiresFaceID(for operation: HighValueOperation) -> Bool {
    let context = LAContext()
    return context.biometryType == .faceID // 3D liveness inherent
}
```

### 3. Windows Liveness Detection

Windows Hello supports face recognition with IR cameras on supported devices:

- **Surface devices:** IR + depth camera (good liveness detection)
- **External webcams:** RGB only (poor liveness detection)
- **Fingerprint readers:** Varies (capacitive sensors have basic liveness)

**Recommendation:** Accept Windows Hello results as-is. The Finance app on Windows
is lower-risk (desktop usage pattern) and Windows Hello enforces its own PAD.

---

## Cryptographic Biometric Binding

The most important liveness improvement is **not** additional liveness detection but
**cryptographic binding** of the biometric event to a security operation.

### Current Gap

The current implementation calls `BiometricPrompt.authenticate()` without a
`CryptoObject`. The `onAuthenticationSucceeded()` callback returns a boolean success
result. An attacker who hooks the callback can forge success without actual biometric
authentication.

### Recommended Architecture

```
Biometric Auth Request
    │
    ├─► Platform biometric prompt (Face ID / Fingerprint)
    │       │
    │       └─► Hardware verifies biometric (with liveness/PAD)
    │
    ├─► CryptoObject / Secure Enclave operation
    │       │
    │       └─► Hardware performs crypto operation ONLY if biometric passed
    │           (Cannot be hooked — the key is in hardware)
    │
    ├─► Sign a challenge with the biometric-bound key
    │       │
    │       └─► Challenge = server-generated nonce + timestamp + operation
    │
    └─► Server verifies signature with stored public key
            │
            └─► Proof that: (1) user authenticated biometrically
                            (2) on this specific device
                            (3) for this specific operation
                            (4) at this specific time
```

This architecture provides:

- **Anti-hook protection:** Even if the app is hooked, the attacker cannot use the
  Keystore/Secure Enclave key without passing biometric auth
- **Anti-replay protection:** Server nonce ensures each auth is fresh
- **Non-repudiation:** Server has cryptographic proof of biometric auth
- **Device binding:** The key is in the device's secure hardware, non-exportable

---

## Findings

### BIO-1: No CryptoObject Binding on Android — Severity: HIGH

**File:** `apps/android/src/main/kotlin/com/finance/android/security/BiometricAuthManager.kt`, line 84

**Description:** `biometricPrompt.authenticate(promptInfo)` is called without a
`CryptoObject`. The biometric result is a callback-only boolean with no cryptographic
proof. A Frida hook on `onAuthenticationSucceeded()` can forge biometric success.

**Recommendation:** Add `CryptoObject` binding using a Keystore key that requires
`setUserAuthenticationRequired(true)` with `setUserAuthenticationParameters(0, BIOMETRIC_STRONG)`.

### BIO-2: iOS Biometric Not Bound to Secure Enclave Operation — Severity: MEDIUM

**File:** `apps/ios/Finance/Security/BiometricAuthManager.swift`, line 174

**Description:** `evaluatePolicy(.deviceOwnerAuthentication)` returns a boolean success
result. While Face ID's 3D depth sensing is strong, the result can be hooked via
method swizzling on jailbroken devices. Binding to a Secure Enclave key operation
(`.biometryCurrentSet` access control) would make bypass require Secure Enclave exploit.

**Recommendation:** Create a biometric-bound Secure Enclave key and require a signing
operation as proof of biometric authentication.

### BIO-3: No Attention Detection Requirement — Severity: MEDIUM

**Description:** Neither platform enforces attention detection (eyes open, looking at
device). This allows an attacker to authenticate using a sleeping person's face.

**Recommendation:**

- iOS: Face ID attention awareness is enabled by default. Verify `LAContext.isInteractionNotAllowed`
  is not being set. Document that `requiresAttention` is the default.
- Android: For face-based biometrics, consider adding ML Kit face detection as a
  pre-check to verify eyes are open.

### BIO-4: Biometric Lock Preference in UserDefaults — Severity: LOW

**File:** `apps/ios/Finance/Security/BiometricAuthManager.swift`, line 112

**Description:** The `appLockEnabledKey` (`biometricAuthEnabled`) is stored in
`UserDefaults`. This is a non-sensitive boolean preference (not a secret), but
an attacker with file system access could disable biometric lock by modifying
UserDefaults. Consider storing this flag in the Keychain as well.

---

## Recommendations Summary

| Priority | Finding                                     | Action                                                               | Effort   |
| -------- | ------------------------------------------- | -------------------------------------------------------------------- | -------- |
| **P0**   | BIO-1: Add CryptoObject binding (Android)   | Use BiometricPrompt with Keystore CryptoObject                       | 3-4 days |
| **P1**   | BIO-2: Bind iOS biometric to Secure Enclave | Create biometric-bound SE key for signing                            | 2-3 days |
| **P2**   | BIO-3: Verify attention detection           | Document Face ID attention defaults; add ML Kit pre-check on Android | 1-2 days |
| **P3**   | BIO-4: Move biometric pref to Keychain      | Store lock flag in Keychain instead of UserDefaults                  | 0.5 days |

---

## References

- OWASP MASVS v2: MASVS-AUTH-3 (Biometric Authentication)
- ISO/IEC 30107-3: Biometric presentation attack detection (PAD) testing
- Android BiometricPrompt CryptoObject: https://developer.android.com/reference/android/hardware/biometrics/BiometricPrompt.CryptoObject
- Apple Face ID Security: https://support.apple.com/en-us/102381
- NIST SP 800-76-2: Biometric Specifications for PIV
- [Implementation Specification](./biometric-liveness-implementation.md)
