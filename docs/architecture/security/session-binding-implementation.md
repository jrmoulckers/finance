<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Session Binding — Implementation Specification

**Issue:** #334
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Implementation Specification
**MASVS Control:** MASVS-AUTH-2, MASVS-NETWORK-3

---

## Overview

Session binding ties authentication tokens to a specific device context,
preventing stolen tokens from being used on different devices. Combined with
a privacy-preserving device fingerprint, it detects session hijacking.

Extends [Session Binding Strategy](./session-binding-strategy.md).

## Key Finding Addressed

**SB-1 (HIGH):** Current JWT access tokens and refresh tokens are pure bearer
tokens with no device binding. Any party possessing a token can use it from
any device. This implementation adds device fingerprint binding via JWT custom
claims and server-side verification.

## Architecture

### Device Fingerprint

A privacy-preserving fingerprint using only categorical attributes:

- Platform (android/ios/web/windows)
- Platform version (major only)
- App version
- Locale
- Timezone offset
- Screen category (phone/tablet/desktop)
- Biometric capability

The fingerprint is SHA-256 hashed before transmission — the server never
sees raw attributes. Many devices share the same fingerprint (not unique).

### Enforcement Phases

| Phase   | Mode                | Response to Mismatch                 | Duration  |
| ------- | ------------------- | ------------------------------------ | --------- |
| Phase 1 | Monitor             | Log anomaly, allow                   | 4-6 weeks |
| Phase 2 | Warn                | Log + notify user                    | 2-4 weeks |
| Phase 3 | Enforce (sensitive) | Require re-auth for exports/deletion | Ongoing   |
| Phase 4 | Enforce (all)       | Require re-auth on mismatch          | Ongoing   |

## Implementation Files

| File                                                         | Purpose                  |
| ------------------------------------------------------------ | ------------------------ |
| `packages/core/src/commonMain/.../DeviceFingerprint.kt`      | Common fingerprint model |
| `packages/core/src/commonMain/.../SessionBindingManager.kt`  | Session binding logic    |
| `services/api/supabase/functions/_shared/session-binding.ts` | Server-side verification |

## Privacy Safeguards

- No unique device identifiers (IMEI, serial, MAC, advertising ID)
- Fingerprint is hashed (SHA-256) before transmission
- Not a tracking mechanism — many devices share the same hash
- GDPR transparency: documented in privacy policy
- User can view and clear device registrations
- Deleted with account (GDPR Art. 17)

## References

- [Session Binding Strategy](./session-binding-strategy.md)
- OWASP MASVS v2: MASVS-AUTH-2
- RFC 8471: Token Binding Protocol
