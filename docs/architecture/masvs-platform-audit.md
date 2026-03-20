<!-- SPDX-License-Identifier: BUSL-1.1 -->

# MASVS-PLATFORM - Platform Security Audit

> **Audit date:** 2025-01-27
> **Scope:** Platform-specific code in apps/android/, apps/ios/, apps/web/, apps/windows/
> **Standard:** OWASP MASVS v2 - MASVS-PLATFORM
> **Issue:** #366

---

## Executive Summary

The Finance app demonstrates **mature platform security** across all four targets. Android uses App Links with autoVerify, iOS uses Keychain with kSecAttrAccessibleWhenUnlockedThisDeviceOnly, the web app has CSP and same-origin service worker, and Windows uses MSIX sandboxing. Key findings: CSP permits unsafe-inline for scripts, missing filterTouchesWhenObscured on Android, absent explicit ATS on iOS.

**Overall MASVS-PLATFORM compliance: PASS (with MEDIUM improvements noted)**

---

## 1. Android

| Severity   | Finding                                                                          | File                         | Remediation                                 |
| ---------- | -------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| PASS       | Only MainActivity exported (LAUNCHER)                                            | AndroidManifest.xml:17       | N/A                                         |
| PASS       | No exported providers, receivers, or services                                    | AndroidManifest.xml          | N/A                                         |
| PASS       | allowBackup=false                                                                | AndroidManifest.xml:12       | N/A                                         |
| PASS       | Minimal permissions: INTERNET, ACCESS_NETWORK_STATE, POST_NOTIFICATIONS, VIBRATE | AndroidManifest.xml:4-7      | N/A                                         |
| PASS       | App Links use autoVerify=true for finance.app                                    | AndroidManifest.xml:27,37,47 | N/A                                         |
| PASS       | Intent filters: https only, finance.app host, specific paths                     | AndroidManifest.xml:32-54    | N/A                                         |
| **MEDIUM** | filterTouchesWhenObscured not set. Tapjacking risk.                              | AndroidManifest.xml:17       | Add android:filterTouchesWhenObscured=true. |
| PASS       | Tokens in EncryptedSharedPreferences (AES-256-GCM, Keystore)                     | SecureTokenStorage.kt        | N/A                                         |
| PASS       | KeystoreManager: AES-256-GCM, StrongBox preferred, TEE fallback                  | KeystoreManager.kt           | N/A                                         |
| PASS       | BiometricAuthManager: BIOMETRIC_STRONG + DEVICE_CREDENTIAL                       | BiometricAuthManager.kt      | N/A                                         |
| PASS       | PKCE verifier in-memory only                                                     | SupabaseAuthManager.kt:67    | N/A                                         |
| PASS       | Deep links validated via NavController.handleDeepLink()                          | MainActivity.kt:143-146      | N/A                                         |

## 2. iOS

| Severity | Finding                                                                         | File                          | Remediation                  |
| -------- | ------------------------------------------------------------------------------- | ----------------------------- | ---------------------------- |
| PASS     | MinimumOSVersion 17.0                                                           | Info.plist:66                 | N/A                          |
| PASS     | NSFaceIDUsageDescription present                                                | Info.plist:55                 | N/A                          |
| PASS     | BGTask identifiers scoped to Finance sync                                       | Info.plist:58-62              | N/A                          |
| **LOW**  | No explicit NSAppTransportSecurity. Defaults secure but should document intent. | Info.plist                    | Add explicit empty ATS dict. |
| **LOW**  | No NSFileProtectionKey. Financial app should use NSFileProtectionComplete.      | Info.plist                    | Set in entitlements.         |
| PASS     | Keychain: kSecAttrAccessibleWhenUnlockedThisDeviceOnly                          | KeychainManager.swift:102     | N/A                          |
| PASS     | Background: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly                    | KeychainManager.swift:221     | N/A                          |
| PASS     | Secure Enclave with biometryCurrentSet                                          | KeychainManager.swift:178-194 | N/A                          |
| PASS     | Actor-based thread-safe Keychain                                                | KeychainManager.swift:59      | N/A                          |
| PASS     | UniversalLinkHandler validates paths; unknown = DeepLink.unknown                | UniversalLinkHandler.swift    | N/A                          |
| PASS     | Biometric: .deviceOwnerAuthentication, fresh LAContext                          | BiometricAuthManager.swift    | N/A                          |
| PASS     | Apple Sign-In: cryptographic nonce, SHA-256, concurrent rejection               | AppleSignInManager.swift      | N/A                          |

## 3. Web

| Severity   | Finding                                                            | File                   | Remediation                     |
| ---------- | ------------------------------------------------------------------ | ---------------------- | ------------------------------- |
| **MEDIUM** | CSP allows unsafe-inline for script-src. Weakens XSS protection.   | vite.config.ts:36      | Nonce-based CSP for production. |
| PASS       | frame-ancestors none, base-uri self, form-action self              | vite.config.ts:42-44   | N/A                             |
| PASS       | X-Frame-Options DENY, nosniff, Referrer-Policy set                 | vite.config.ts:45-47   | N/A                             |
| **LOW**    | CSP connect-src only self + ws://localhost; needs prod API origins | vite.config.ts:40      | Add Supabase/PowerSync origins. |
| **LOW**    | CSP only in dev server; production needs vercel.json headers       | vercel.json            | Add headers block.              |
| PASS       | No dangerouslySetInnerHTML, innerHTML, eval(), new Function()      | All web source         | N/A                             |
| PASS       | Auth uses credentials:include + JSON triggering CORS preflight     | auth-context.tsx:218   | N/A                             |
| PASS       | CORS validates origin against allowlist, no wildcards              | \_shared/cors.ts:15-28 | N/A                             |
| PASS       | SW same-origin only; network-first for API; cache versioning       | service-worker.ts      | N/A                             |
| PASS       | Access tokens in-memory only; refresh via HttpOnly cookies         | token-storage.ts       | N/A                             |
| **LOW**    | SW message listener does not verify event.source                   | service-worker.ts:141  | Validate event.source.          |

## 4. Windows

| Severity | Finding                                             | File                   | Remediation        |
| -------- | --------------------------------------------------- | ---------------------- | ------------------ |
| PASS     | Minimal capabilities: internetClient + runFullTrust | AppxManifest.xml:64-67 | N/A                |
| PASS     | Publisher identity uses CI/CD placeholders          | AppxManifest.xml:20-22 | N/A                |
| **LOW**  | No code signing config in Gradle build              | build.gradle.kts       | Document in CI/CD. |

---

## Compliance Matrix

| Control                                   | Status  | Notes                                                        |
| ----------------------------------------- | ------- | ------------------------------------------------------------ |
| **PLATFORM-1**: Secure IPC                | PASS    | Auto-verified App Links; Universal Links; same-origin SW     |
| **PLATFORM-2**: Platform input validation | PASS    | Deep link handlers validate and reject unknown routes        |
| **PLATFORM-3**: Secure WebView            | N/A     | No WebView; Custom Tabs for OAuth                            |
| **PLATFORM-4**: Correct permissions       | PASS    | Minimal on all platforms                                     |
| **PLATFORM-5**: Data protection           | PARTIAL | Excellent Android/iOS; iOS file protection could be elevated |
| **PLATFORM-6**: Best practices            | PARTIAL | Tapjacking missing; CSP unsafe-inline                        |

---

## Recommendations

1. **Remove unsafe-inline from script-src** (MEDIUM): Nonce-based CSP for production.
2. **Add filterTouchesWhenObscured** (MEDIUM): Tapjacking protection on Android.
3. **Add explicit ATS dictionary** (LOW). 4. **Elevate iOS Data Protection** (LOW).
4. **Configure production CSP in vercel.json** (LOW). 6. **Document Windows code signing** (LOW).
