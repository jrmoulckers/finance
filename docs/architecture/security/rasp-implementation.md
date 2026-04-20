<!-- SPDX-License-Identifier: BUSL-1.1 -->

# RASP — Implementation Specification

**Issue:** #330
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Implementation Specification
**MASVS Control:** MASVS-RESILIENCE-1 through MASVS-RESILIENCE-5

---

## Overview

Runtime Application Self-Protection (RASP) detects and responds to runtime
attacks on the user's device. This spec covers the concrete implementation of
jailbreak/root detection, debugger detection, instrumentation detection, and
integrity verification across all platforms.

Extends [RASP Strategy](./rasp-strategy.md) with code locations and interfaces.

## Architecture

### KMP Common Interface

`RuntimeIntegrityChecker` in commonMain defines the cross-platform contract.
Each platform provides detection appropriate to its capabilities.

### Detection Hierarchy

| Level | Detection     | Response                           |
| ----- | ------------- | ---------------------------------- |
| 0     | Clean         | Normal operation                   |
| 1     | Suspicious    | Log + monitor                      |
| 2     | Compromised   | Disable biometric, require re-auth |
| 3     | Active Attack | Clear tokens, lock app             |
| 4     | Tampered      | Refuse to operate                  |

## Implementation Files

| File                                                          | Purpose                      |
| ------------------------------------------------------------- | ---------------------------- |
| `packages/core/src/commonMain/.../RuntimeIntegrityChecker.kt` | Common interface + types     |
| `apps/android/src/main/kotlin/.../RootDetector.kt`            | Android root detection       |
| `apps/android/src/main/kotlin/.../IntegrityVerifier.kt`       | APK signature verification   |
| `apps/ios/Finance/Security/JailbreakDetector.swift`           | iOS jailbreak detection      |
| `apps/ios/Finance/Security/IOSDebugDetector.swift`            | iOS debugger detection       |
| `apps/windows/src/main/kotlin/.../WindowsIntegrityChecker.kt` | Windows integrity checks     |
| `packages/core/src/commonMain/.../BiometricCryptoBinding.kt`  | Biometric crypto common API  |
| `apps/android/src/main/kotlin/.../BiometricCryptoManager.kt`  | Android CryptoObject binding |
| `apps/ios/Finance/Security/BiometricCryptoManager.swift`      | iOS Secure Enclave binding   |

## Privacy Safeguards

- Detection results contain only generic signal names
- No device identifiers, user PII, or financial data in reports
- Consent-gated via existing MonitoringFacade consent provider
- Signal names: `root_detected`, `debugger_attached`, `frida_detected`, etc.

## References

- [RASP Strategy](./rasp-strategy.md)
- OWASP MASVS v2: MASVS-RESILIENCE
