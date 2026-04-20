<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Certificate Pinning — Implementation Specification

**Issue:** #329
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Implementation Specification
**MASVS Control:** MASVS-NETWORK-5

---

## Overview

This document specifies the concrete implementation plan for certificate pinning
across all Finance app platforms. It extends the
[Certificate Pinning Strategy](./certificate-pinning-strategy.md) with file
locations, API contracts, and integration points.

## Architecture

### KMP Expect/Actual Pattern

| Source Set     | File                                  | Role                                |
| -------------- | ------------------------------------- | ----------------------------------- |
| `commonMain` | `CertificatePinningConfig.kt`       | Expect object + shared pin constants |
| `androidMain`| `CertificatePinningConfig.android.kt`| Validates network_security_config   |
| `iosMain`    | `CertificatePinningConfig.ios.kt`   | Validates NSPinnedDomains           |
| `jvmMain`    | `CertificatePinningConfig.jvm.kt`   | OkHttp CertificatePinner helper     |
| `jsMain`     | `CertificatePinningConfig.js.kt`    | No-op (browser CT enforcement)      |

### Platform-Native Enforcement

| Platform | Mechanism                          | Config Location                    |
| -------- | ---------------------------------- | ---------------------------------- |
| Android  | `network_security_config.xml`    | `apps/android/src/main/res/xml/` |
| iOS      | `NSPinnedDomains` in Info.plist  | `apps/ios/Finance/Info.plist`     |
| Windows  | OkHttp `CertificatePinner`       | `packages/core/src/jvmMain/`     |
| Web      | Certificate Transparency (browser) | `Expect-CT` response header      |

## Pin Configuration

SPKI SHA-256 hashes of intermediate CAs are centralized in `CertificatePins`
in commonMain. Values must be extracted from live certificate chains before
production deployment.

### Pinned Domains

| Domain                           | Service      |
| -------------------------------- | ------------ |
| `*.supabase.co`                | Supabase API |
| `*.powersync.journeyapps.com`  | PowerSync    |

## Failure Handling

Pin validation failures are reported through `SyncHealthMonitor` with a
generic `cert_pin_failure` signal. Reports never include certificate chain
data, network environment details, or user-identifiable information.

## Testing

1. Pin hash format validation (base64-encoded SHA-256)
2. TLS handshake succeeds with correct pins
3. mitmproxy with custom CA is rejected
4. Weekly CI certificate chain monitoring job

## Rollout

1. Ship with feature flag disabled
2. Enable for 5% canary
3. Monitor error rates for 1 week
4. Graduate to 100% if error rate < 0.1%

## References

- [Certificate Pinning Strategy](./certificate-pinning-strategy.md)
- OWASP MASVS v2: MASVS-NETWORK-5