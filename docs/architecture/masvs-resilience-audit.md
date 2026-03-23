<!-- SPDX-License-Identifier: BUSL-1.1 -->

# MASVS-RESILIENCE - Anti-Tampering and Resilience Audit

> **Audit date:** 2025-01-27
> **Scope:** Anti-tampering, root/jailbreak detection, debug detection, obfuscation, integrity
> **Standard:** OWASP MASVS v2 - MASVS-RESILIENCE
> **Issue:** #370

---

## Executive Summary

MASVS-RESILIENCE addresses defence against reverse engineering, tampering, and compromised devices. The app has a **solid foundation**: R8/ProGuard obfuscation, BuildConfig.DEBUG gating, StrongBox encryption (Android), Secure Enclave and Keychain (iOS). Several controls are **not yet implemented**: root/jailbreak detection, debugger detection, runtime integrity verification. Expected at v0.1.0 but must be addressed before production.

**Overall MASVS-RESILIENCE compliance: PARTIAL (gaps documented below)**

---

## 1. Root/Jailbreak Detection

| Severity   | Finding                                                                                                              | Platform | Remediation                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------- |
| **HIGH**   | **No root detection.** Attackers can bypass Keystore, read EncryptedSharedPreferences, intercept HTTPS, inject code. | Android  | Use rootbeer or Play Integrity API. Degrade gracefully.    |
| **HIGH**   | **No jailbreak detection.** Keychain bypass, Secure Enclave exploit, method swizzling possible.                      | iOS      | Check Cydia/Sileo, suspicious paths, writable system dirs. |
| **MEDIUM** | **No compromised-environment handling.** No malicious extension detection.                                           | Web      | CSP tightening; extension detection heuristics.            |

## 2. Debug Detection

| Severity   | Finding                                                                        | Platform | Remediation                                  |
| ---------- | ------------------------------------------------------------------------------ | -------- | -------------------------------------------- |
| PASS       | BuildConfig.DEBUG gates Timber and Koin logging                                | Android  | N/A                                          |
| PASS       | Web monitoring guards console behind import.meta.env.DEV                       | Web      | N/A                                          |
| **MEDIUM** | **No active debugger detection.** No Debug.isDebuggerConnected() or TracerPid. | Android  | Add checks in FinanceApplication.onCreate(). |
| **MEDIUM** | **No active debugger detection.** No PT_DENY_ATTACH or DYLD_INSERT_LIBRARIES.  | iOS      | Add ptrace via C bridging.                   |
| PASS       | Compose UI tooling is debugImplementation only                                 | Android  | N/A                                          |

## 3. Code Obfuscation

| Severity   | Finding                                                                               | Platform | Remediation                                       |
| ---------- | ------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| PASS       | R8/ProGuard rules present; keep rules scoped                                          | Android  | N/A                                               |
| PASS       | Source file names replaced with SourceFile for crash reports                          | Android  | N/A                                               |
| **MEDIUM** | **R8 not explicitly enabled.** Missing release buildTypes with minifyEnabled.         | Android  | Add isMinifyEnabled=true, isShrinkResources=true. |
| **HIGH**   | **Web source maps in production.** vite.config.ts: sourcemap: true ships full source. | Web      | Set sourcemap: false or hidden.                   |

## 4. Integrity Verification

| Severity   | Finding                                                           | Platform | Remediation                               |
| ---------- | ----------------------------------------------------------------- | -------- | ----------------------------------------- |
| **MEDIUM** | **No APK signature verification.** Cannot detect repackaged APKs. | Android  | PackageManager signing certificate check. |
| **MEDIUM** | **No Play Integrity API.** Missing device integrity verdicts.     | Android  | Integrate Play Integrity API.             |
| **LOW**    | **No iOS App Attest.**                                            | iOS      | Integrate DCAppAttestService.             |
| PASS       | Web uses SRI via content-hashed filenames                         | Web      | N/A                                       |
| PASS       | MSIX provides code-signing integrity                              | Windows  | N/A                                       |

## 5. Anti-Instrumentation

| Severity   | Finding                                                        | Platform     | Remediation             |
| ---------- | -------------------------------------------------------------- | ------------ | ----------------------- |
| **MEDIUM** | **No Frida detection.** Can hook functions and extract tokens. | Android, iOS | Multi-vector detection. |
| **LOW**    | **No emulator detection.**                                     | Android      | Check Build properties. |

---

## Compliance Matrix

| Control                                    | Status  | Notes                                                        |
| ------------------------------------------ | ------- | ------------------------------------------------------------ |
| **RESILIENCE-1**: Root/jailbreak detection | FAIL    | Not implemented                                              |
| **RESILIENCE-2**: Debugger detection       | PARTIAL | BuildConfig.DEBUG correct; no runtime detection              |
| **RESILIENCE-3**: Code obfuscation         | PARTIAL | ProGuard rules exist; R8 may not be enabled; web source maps |
| **RESILIENCE-4**: Integrity verification   | FAIL    | No APK verification, Play Integrity, or App Attest           |
| **RESILIENCE-5**: Tampering detection      | FAIL    | No Frida, hook, or runtime checks                            |

---

## Risk Assessment

### Current Passive Resilience

- Android Keystore hardware-backed encryption
- iOS Keychain ThisDeviceOnly + Secure Enclave
- EncryptedSharedPreferences for Android tokens
- In-memory-only web tokens
- Server-side RLS policies (backstop against client compromise)
- PKCE OAuth

### Risk Without Active Resilience

On rooted/jailbroken devices: token extraction, HTTPS interception via custom CA, biometric hook bypass, SQLite database read, Frida-based app modification.

**Server-side RLS is the critical backstop**: even with full client compromise, attackers only access the compromised user's household data.

---

## Implementation Roadmap

### Phase 1: Pre-Launch

| Priority | Control                   | Effort   |
| -------- | ------------------------- | -------- |
| P0       | Disable web source maps   | 1 hour   |
| P0       | Enable R8 minifyEnabled   | 1 hour   |
| P1       | Root detection (Android)  | 1-2 days |
| P1       | Jailbreak detection (iOS) | 1-2 days |

### Phase 2: Post-Launch

| Priority | Control                    | Effort   |
| -------- | -------------------------- | -------- |
| P2       | Play Integrity API         | 2-3 days |
| P2       | APK signature verification | 0.5 days |
| P2       | Debugger detection         | 1-2 days |
| P2       | App Attest (iOS)           | 2-3 days |

### Phase 3: Hardening

| Priority | Control             | Effort   |
| -------- | ------------------- | -------- |
| P3       | Anti-Frida          | 2-3 days |
| P3       | Emulator detection  | 0.5 days |
| P3       | Certificate pinning | 1-2 days |
| P3       | RASP evaluation     | 1 week   |

---

## Recommendations

### Must Fix Before Production

1. **Enable R8 minification** (HIGH): isMinifyEnabled=true, isShrinkResources=true.
2. **Disable web source maps** (HIGH): sourcemap: false or hidden.
3. **Root/jailbreak detection** (HIGH): Multi-vector on Android and iOS.

### Should Fix This Quarter

4. **Play Integrity API** (MEDIUM). 5. **Debugger detection** (MEDIUM). 6. **APK signature verification** (MEDIUM).

### Future

7. **RASP solution** (LOW). 8. **Certificate pinning** (LOW). 9. **App Attest** (LOW).
