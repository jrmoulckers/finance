# Export Compliance — Finance iOS App

## Summary

Finance does **not** use non-exempt encryption. The app relies exclusively on
Apple's built-in platform encryption and does not include, link, or call any
custom cryptographic implementations.

## Encryption Usage

| Component                  | Encryption Used         | Exempt? |
| -------------------------- | ----------------------- | ------- |
| Apple Keychain Services    | AES-256 (system)        | Yes     |
| HTTPS (App Transport Sec.) | TLS 1.2/1.3 (system)    | Yes     |
| LocalAuthentication        | Secure Enclave (system) | Yes     |
| SQLite (on-device)         | None (plaintext)        | N/A     |
| Supabase Sync (optional)   | TLS via URLSession      | Yes     |

## Classification

The app qualifies for the **TSU exception (License Exception Technology and
Software — Unrestricted)** under U.S. Bureau of Industry and Security (BIS)
Export Administration Regulations (EAR) §740.13(e), because:

1. **No custom cryptography** — The app does not implement, contain, or
   distribute any proprietary or third-party cryptographic algorithms.
2. **Platform-only encryption** — All encryption is provided by Apple's
   operating system frameworks (Security.framework, Network.framework,
   CommonCrypto), which are pre-classified by Apple.
3. **Mass-market software** — The app is a consumer personal finance tracker
   available to the general public via the App Store.
4. **No government/military use** — The app is not designed for restricted
   end-users or controlled end-uses.

## Info.plist Declaration

The `ITSAppUsesNonExemptEncryption` key is set to `false` in the app's
`Info.plist`, which tells App Store Connect that no annual self-classification
report is required.

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

## If This Changes

If a future version introduces custom encryption (e.g., SQLCipher for encrypted
local storage, or a custom E2E encryption layer for sync), the following steps
are required:

1. Set `ITSAppUsesNonExemptEncryption` to `true` in `Info.plist`
2. File an annual self-classification report with BIS (due by February 1)
3. Update this document with the specific algorithms and key lengths used
4. Include CCATS (Commodity Classification Automated Tracking System) number
   if applicable

## References

- [Apple: Complying with Encryption Export Regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)
- [BIS — EAR §740.13(e) TSU Exception](https://www.bis.doc.gov/index.php/policy-guidance/encryption)
- [App Store Connect: Export Compliance](https://developer.apple.com/help/app-store-connect/reference/export-compliance-documentation)
