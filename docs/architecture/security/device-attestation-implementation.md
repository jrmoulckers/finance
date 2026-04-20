<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Device Attestation — Implementation Specification

**Issue:** #331
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Implementation Specification
**MASVS Control:** MASVS-RESILIENCE-4

---

## Overview

Device attestation provides server-verifiable proof that the Finance app is
running on a genuine, uncompromised device. Extends
[Device Attestation Strategy](./device-attestation-strategy.md).

## Platform APIs

| Platform | API                      | Verification             |
| -------- | ------------------------ | ------------------------ |
| Android  | Play Integrity API       | Google servers           |
| iOS      | App Attest (DCAppAttest) | Apple servers            |
| Windows  | TPM 2.0 Attestation      | Custom server validation |
| Web      | N/A                      | N/A                      |

## Privacy Safeguards

- No device identifiers (IMEI, serial, MAC) collected
- Attestation IDs are opaque platform-generated values
- Records deleted with account (GDPR Art. 17)

## Implementation Files

| File                                                                                 | Purpose                       |
| ------------------------------------------------------------------------------------ | ----------------------------- |
| `packages/core/src/commonMain/kotlin/com/finance/core/security/DeviceAttestor.kt`    | Common attestation interface  |
| `apps/android/src/main/kotlin/com/finance/android/security/PlayIntegrityAttestor.kt` | Android Play Integrity client |
| `apps/ios/Finance/Security/AppAttestManager.swift`                                   | iOS App Attest (DCAppAttest)  |
| `apps/windows/src/main/kotlin/com/finance/desktop/security/TpmAttestor.kt`           | Windows TPM 2.0 attestation   |
