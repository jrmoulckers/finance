<!-- SPDX-License-Identifier: BUSL-1.1 -->
# Export Control Notice

## Classification

This software contains cryptographic functionality and is classified under:

- **ECCN:** 5D002 (Information Security — Encryption Software)
- **License Exception:** TSU (15 C.F.R. § 740.13(e)) — Technology and Software Unrestricted

This classification applies to publicly available encryption source code
distributed free of charge via a public repository.

## Cryptographic Components

| Component | Algorithm | Purpose |
|-----------|-----------|---------|
| Local database encryption | AES-256-CBC + HMAC-SHA512 | Encrypting financial data at rest (via SQLCipher) |
| Envelope encryption | AES-256-GCM | Field-level encryption of sensitive records |
| Authentication | WebAuthn/FIDO2 (ECDSA P-256) | Passkey-based user authentication |
| OAuth security | SHA-256 (PKCE, RFC 7636) | Proof Key for Code Exchange |
| Key storage | Platform keystores | Android Keystore, iOS Keychain, Windows DPAPI |
| Network transport | TLS 1.2+ | Encrypted communications (via platform APIs) |
| Planned | Argon2id | Password-based key derivation |
| Planned | X25519 | Household key exchange |

## BIS Notification

A notification will be submitted to the U.S. Bureau of Industry and Security
(BIS) and the ENC Encryption Request Coordinator (NSA) per the requirements
of License Exception TSU (15 C.F.R. § 740.13(e)), prior to or concurrent
with the initial public distribution of this source code.

- **Recipients:** `crypt@bis.doc.gov`, `enc@nsa.gov`
- **Submission type:** TSU notification for publicly available encryption source code
- **Status:** Pending — to be filed before repository is made public

## User Obligations

If you redistribute or modify this software:

1. **U.S. persons** redistributing this software with encryption must comply
   with EAR requirements, which may include filing their own TSU notification.
2. This software may **not** be exported or re-exported to embargoed countries
   or denied persons/entities per U.S. sanctions lists.
3. Check your local laws — encryption import/use restrictions vary by
   jurisdiction.

## App Store Compliance

- **Apple App Store:** `ITSAppUsesNonExemptEncryption = YES` in Info.plist.
  Encryption use qualifies for the exemption under Category 5, Part 2
  (authentication, digital signature, data integrity).
- **Google Play:** Encryption disclosure required in the Play Console under
  "App content" → "Encryption."

## References

- [EAR Part 740.13(e) — License Exception TSU](https://www.ecfr.gov/current/title-15/subtitle-B/chapter-VII/subchapter-C/part-740/section-740.13)
- [BIS Encryption FAQ](https://www.bis.doc.gov/index.php/policy-guidance/encryption)
- [Commerce Control List — Category 5, Part 2](https://www.bis.doc.gov/index.php/documents/regulations-docs/2382-commerce-control-list-ccl)
