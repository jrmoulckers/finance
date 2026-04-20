<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Biometric Liveness Detection — Implementation Specification

**Issue:** #333
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Implementation Specification
**MASVS Control:** MASVS-AUTH-3

---

## Overview

This specification implements anti-spoofing measures for biometric authentication
in the Finance app. The primary improvement is cryptographic binding of biometric
events to hardware-backed key operations, making callback hooking attacks useless.

Extends [Biometric Liveness Assessment](./biometric-liveness-assessment.md).

## Key Finding: CryptoObject Binding Gap

The current Android implementation calls `BiometricPrompt.authenticate(promptInfo)`
without a `CryptoObject`. An attacker with Frida can hook
`onAuthenticationSucceeded()` to forge biometric success without any actual
biometric event.

**Fix:** Bind every biometric authentication to a hardware-backed Keystore
operation via `CryptoObject`. The Keystore key is only usable after genuine
biometric verification — hooking the callback is insufficient.

## Architecture

### Cryptographic Biometric Binding Flow

1. App creates a Keystore/Secure Enclave key requiring biometric authentication
2. Biometric prompt includes a CryptoObject referencing the key
3. Hardware performs crypto operation ONLY if biometric succeeds
4. App signs a server challenge with the biometric-bound key
5. Server verifies the signature with the stored public key

### Implementation Files

| File                                                         | Purpose                         |
| ------------------------------------------------------------ | ------------------------------- |
| `packages/core/src/commonMain/.../BiometricCryptoBinding.kt` | Common interface                |
| `apps/android/src/main/kotlin/.../BiometricCryptoManager.kt` | Android Keystore CryptoObject   |
| `apps/ios/Finance/Security/BiometricCryptoManager.swift`     | iOS Secure Enclave binding      |
| `apps/ios/Finance/Security/BiometricAuthManager.swift`       | iOS LAContext biometric auth    |
| `apps/android/src/main/kotlin/.../BiometricAuthManager.kt`   | Android BiometricPrompt manager |

## Platform Details

### Android

- Use `KeyGenParameterSpec` with `setUserAuthenticationRequired(true)`
- Set `setUserAuthenticationParameters(0, BIOMETRIC_STRONG)`
- Pass `BiometricPrompt.CryptoObject(cipher)` to authenticate()
- CryptoObject is single-use, preventing replay

### iOS

- Create EC P-256 key in Secure Enclave with `.biometryCurrentSet`
- Use `SecKeyCreateSignature` which requires LAContext evaluation
- Attention awareness is enabled by default on Face ID

### Windows

- Windows Hello provides its own PAD (Presentation Attack Detection)
- Accept Windows Hello results as-is (lower risk desktop usage pattern)

## Security Properties

| Property           | Mechanism               | Attack Prevented             |
| ------------------ | ----------------------- | ---------------------------- |
| Anti-hook          | CryptoObject / SE key   | Callback hooking (Frida)     |
| Anti-replay        | Single-use CryptoObject | Replayed biometric results   |
| Anti-template-swap | .biometryCurrentSet     | Added biometric after theft  |
| Anti-spoofing      | Hardware PAD (Class 3)  | Photo/mask/synthetic attacks |
| Non-repudiation    | Signed server challenge | Denial of action             |

## References

- [Biometric Liveness Assessment](./biometric-liveness-assessment.md)
- Android BiometricPrompt CryptoObject
- Apple Secure Enclave
- OWASP MASVS v2: MASVS-AUTH-3
