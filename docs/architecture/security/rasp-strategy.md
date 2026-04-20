<!-- SPDX-License-Identifier: BUSL-1.1 -->

# Runtime Application Self-Protection (RASP) Strategy — Finance App

**Issue:** #330
**Date:** 2025-07-27
**Author:** Security & Privacy Reviewer
**Status:** Assessment Complete — Implementation Specification
**MASVS Control:** MASVS-RESILIENCE-1 through MASVS-RESILIENCE-5

---

## Executive Summary

Runtime Application Self-Protection (RASP) provides defence against attacks that occur
at runtime on the user's device — including jailbreak/root exploitation, debugger
attachment, code injection (Frida, Substrate), and binary tampering. For a financial
application handling transaction data and cryptographic keys, RASP controls are
**essential** to protect the client-side security boundary.

### Current State (from MASVS-RESILIENCE Audit)

| Control                | Android        | iOS              | Web            | Windows        |
| ---------------------- | -------------- | ---------------- | -------------- | -------------- |
| Root/Jailbreak detect  | ✅ Implemented | ✅ Implemented   | N/A            | N/A            |
| Debugger detection     | ⚠️ Partial     | ✅ Implemented   | ⚠️ Partial     | ❌ Not impl    |
| Code obfuscation       | ✅ R8 enabled  | ✅ Bitcode/strip | ✅ No src maps | ✅ MSIX signed |
| Integrity verification | ✅ Implemented | ❌ Not impl      | ✅ SRI/hashes  | ✅ MSIX signed |
| Anti-instrumentation   | ❌ Not impl    | ❌ Not impl      | N/A            | N/A            |

**Risk Assessment:** On rooted/jailbroken devices, an attacker can:

- Extract OAuth tokens from secure storage (bypass Keychain/Keystore protections)
- Intercept HTTPS traffic via custom CA injection
- Hook biometric authentication to bypass identity verification
- Read the SQLCipher database key from memory
- Modify transaction data before it's synced to the server

**Critical Backstop:** Server-side RLS policies remain the ultimate security boundary.
Even with full client compromise, an attacker can only access the compromised user's
household data. RASP reduces the attack surface but does not replace server-side security.

---

## Threat Model

### Threat Actors

| Actor                                     | Motivation                            | Capability  | Risk   |
| ----------------------------------------- | ------------------------------------- | ----------- | ------ |
| Opportunistic attacker with rooted device | Access own financial data outside app | Low-Medium  | MEDIUM |
| Sophisticated attacker with Frida         | Extract tokens, modify transactions   | High        | HIGH   |
| Malware on compromised device             | Steal credentials, financial data     | Medium-High | HIGH   |
| Corporate espionage / insider threat      | Access financial data of target       | High        | HIGH   |
| Automated attack tool (MagiskHide)        | Bypass root detection at scale        | Medium      | MEDIUM |

### Attack Tree

```
Goal: Extract financial data from client device
├── 1. Root/Jailbreak device
│   ├── 1a. Extract tokens from Keystore/Keychain
│   ├── 1b. Read SQLCipher DB key from memory
│   ├── 1c. Install custom CA for MITM
│   └── 1d. Hook biometric auth to bypass
├── 2. Attach debugger
│   ├── 2a. Set breakpoints in crypto functions
│   ├── 2b. Dump decrypted data from memory
│   └── 2c. Modify transaction amounts in-flight
├── 3. Inject code (Frida/Substrate)
│   ├── 3a. Hook TokenManager.getAccessToken()
│   ├── 3b. Hook EncryptionService.decrypt()
│   ├── 3c. Hook BiometricAuthManager.authenticate()
│   └── 3d. Bypass certificate pinning hooks
└── 4. Tamper with binary
    ├── 4a. Repackage APK with modifications
    ├── 4b. Patch binary to disable security checks
    └── 4c. Replace libraries with instrumented versions
```

---

## RASP Implementation Strategy

### Design Principles

1. **Defence in Depth:** Multiple overlapping detection mechanisms — no single check
   to bypass.
2. **Graceful Degradation:** Detection triggers a security response proportional to
   the threat — not an immediate crash (which reveals detection to attacker).
3. **Server-Side Validation:** Client-side detections inform server-side policy
   (e.g., reduced session lifetime, additional verification required).
4. **Privacy Preservation:** RASP telemetry must NOT include device identifiers,
   user PII, or financial data. Only detection flags and anonymized metrics.
5. **No False Positives in Production:** Custom ROMs, accessibility services, and
   developer devices must not be falsely flagged.

### Response Hierarchy

| Detection Level        | Response                 | Example                                                         |
| ---------------------- | ------------------------ | --------------------------------------------------------------- |
| Level 0: Clean         | Normal operation         | —                                                               |
| Level 1: Suspicious    | Log + monitor            | Emulator detected, debug build sideloaded                       |
| Level 2: Compromised   | Degrade security posture | Root detected → disable biometric auth, require re-auth         |
| Level 3: Active Attack | Restrict functionality   | Frida detected → clear tokens, lock app, require server re-auth |
| Level 4: Tampered      | Refuse to operate        | APK signature mismatch → show error, refuse to start            |

---

## Platform-Specific Implementation

### 1. Android RASP

#### 1.1 Root Detection

**Multi-vector approach** (no single check is sufficient):

```kotlin
/**
 * Detect whether the device is rooted using multiple heuristics.
 *
 * Each check returns a risk signal. The combined result determines
 * the security response level.
 */
object RootDetector {

    data class RootCheckResult(
        val isRooted: Boolean,
        val signals: List<String>, // Generic signal names, no device-specific data
        val confidence: Float,     // 0.0-1.0
    )

    fun check(context: Context): RootCheckResult {
        val signals = mutableListOf<String>()

        // Check 1: su binary presence
        if (checkSuBinary()) signals.add("su_binary")

        // Check 2: Root management apps (Magisk, SuperSU, etc.)
        if (checkRootManagementApps(context)) signals.add("root_app")

        // Check 3: Dangerous system properties
        if (checkDangerousProps()) signals.add("dangerous_props")

        // Check 4: Read/write access to system partition
        if (checkRWSystem()) signals.add("rw_system")

        // Check 5: SELinux status
        if (checkSELinuxPermissive()) signals.add("selinux_permissive")

        // Check 6: Test key signing
        if (checkTestKeys()) signals.add("test_keys")

        // Check 7: Magisk-specific artifacts
        if (checkMagiskArtifacts()) signals.add("magisk")

        // Check 8: Native check via JNI (harder to hook)
        if (nativeRootCheck()) signals.add("native_check")

        val confidence = signals.size.toFloat() / 8f
        return RootCheckResult(
            isRooted = signals.isNotEmpty(),
            signals = signals,
            confidence = confidence,
        )
    }

    private external fun nativeRootCheck(): Boolean
}
```

**Recommended library:** Consider `rootbeer` (open source) for baseline checks,
supplemented with custom native checks that are harder to hook.

#### 1.2 Debugger Detection

```kotlin
object DebugDetector {
    fun isDebuggerAttached(): Boolean {
        // Check 1: Android Debug.isDebuggerConnected()
        if (android.os.Debug.isDebuggerConnected()) return true

        // Check 2: TracerPid in /proc/self/status
        if (checkTracerPid()) return true

        // Check 3: Debug.waitingForDebugger()
        if (android.os.Debug.waitingForDebugger()) return true

        return false
    }

    private fun checkTracerPid(): Boolean {
        return try {
            val status = File("/proc/self/status").readText()
            val tracerPid = status.lineSequence()
                .find { it.startsWith("TracerPid:") }
                ?.substringAfter("TracerPid:")?.trim()?.toIntOrNull()
            tracerPid != null && tracerPid != 0
        } catch (_: Exception) {
            false
        }
    }
}
```

#### 1.3 Frida Detection

```kotlin
object FridaDetector {
    fun isFridaPresent(): Boolean {
        // Check 1: Frida default port (27042)
        if (checkFridaPort()) return true

        // Check 2: Frida libraries in /proc/self/maps
        if (checkFridaLibraries()) return true

        // Check 3: Frida named pipes
        if (checkFridaNamedPipes()) return true

        // Check 4: Frida-specific strings in memory (native)
        if (nativeFridaCheck()) return true

        return false
    }

    private fun checkFridaPort(): Boolean {
        return try {
            java.net.Socket("127.0.0.1", 27042).close()
            true // Port is open — Frida server likely running
        } catch (_: Exception) {
            false
        }
    }

    private fun checkFridaLibraries(): Boolean {
        return try {
            File("/proc/self/maps").readText().let { maps ->
                maps.contains("frida") || maps.contains("gadget")
            }
        } catch (_: Exception) {
            false
        }
    }

    private external fun nativeFridaCheck(): Boolean
}
```

#### 1.4 APK Integrity Verification

```kotlin
object IntegrityVerifier {
    /** Expected signing certificate SHA-256 fingerprint. */
    private const val EXPECTED_SIGNING_CERT_HASH = "PLACEHOLDER_RELEASE_CERT_HASH"

    fun verifyApkSignature(context: Context): Boolean {
        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNING_CERTIFICATES
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNATURES
            )
        }

        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.signingInfo?.apkContentsSigners
        } else {
            @Suppress("DEPRECATION")
            packageInfo.signatures
        }

        return signatures?.any { sig ->
            val hash = MessageDigest.getInstance("SHA-256")
                .digest(sig.toByteArray())
            Base64.encodeToString(hash, Base64.NO_WRAP) == EXPECTED_SIGNING_CERT_HASH
        } ?: false
    }
}
```

### 2. iOS RASP

#### 2.1 Jailbreak Detection

```swift
/// Multi-vector jailbreak detection for iOS.
///
/// Uses file system checks, URL scheme checks, sandbox integrity,
/// and dynamic library inspection. No single check is authoritative.
enum JailbreakDetector {

    struct JailbreakResult: Sendable {
        let isJailbroken: Bool
        let signals: [String]
        let confidence: Double
    }

    static func check() -> JailbreakResult {
        var signals: [String] = []

        // Check 1: Cydia/Sileo URL schemes
        if canOpenJailbreakApps() { signals.append("jailbreak_app") }

        // Check 2: Suspicious file paths
        if checkSuspiciousPaths() { signals.append("suspicious_paths") }

        // Check 3: Writable system directories
        if checkWritableSystemPaths() { signals.append("writable_system") }

        // Check 4: Symbolic link manipulation
        if checkSymlinks() { signals.append("symlinks") }

        // Check 5: Fork ability (sandbox escape)
        if checkForkability() { signals.append("fork_available") }

        // Check 6: dylib injection
        if checkDyldInjection() { signals.append("dyld_injection") }

        let confidence = Double(signals.count) / 6.0
        return JailbreakResult(
            isJailbroken: !signals.isEmpty,
            signals: signals,
            confidence: confidence
        )
    }

    private static func canOpenJailbreakApps() -> Bool {
        let schemes = ["cydia://", "sileo://", "zbra://", "filza://"]
        return schemes.contains { scheme in
            UIApplication.shared.canOpenURL(URL(string: scheme)!)
        }
    }

    private static func checkSuspiciousPaths() -> Bool {
        let paths = [
            "/Applications/Cydia.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash", "/usr/sbin/sshd", "/etc/apt",
            "/private/var/lib/apt/", "/usr/bin/ssh",
        ]
        return paths.contains { FileManager.default.fileExists(atPath: $0) }
    }

    private static func checkWritableSystemPaths() -> Bool {
        let testPath = "/private/jailbreak_test_\(UUID().uuidString)"
        do {
            try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
            try FileManager.default.removeItem(atPath: testPath)
            return true // Should NOT be writable on non-jailbroken device
        } catch {
            return false
        }
    }

    private static func checkForkability() -> Bool {
        let pid = fork()
        if pid >= 0 {
            // Fork succeeded — sandbox is broken
            if pid > 0 { kill(pid, SIGTERM) } // Kill child
            return true
        }
        return false
    }

    private static func checkDyldInjection() -> Bool {
        let env = ProcessInfo.processInfo.environment
        return env["DYLD_INSERT_LIBRARIES"] != nil
    }

    private static func checkSymlinks() -> Bool {
        let paths = ["/Applications", "/Library/Ringtones", "/Library/Wallpaper"]
        return paths.contains { path in
            var isSymlink: ObjCBool = false
            let attrs = try? FileManager.default.attributesOfItem(atPath: path)
            return attrs?[.type] as? FileAttributeType == .typeSymbolicLink
        }
    }
}
```

#### 2.2 iOS Debugger Detection

```swift
enum DebugDetector {
    static func isDebuggerAttached() -> Bool {
        // Check 1: sysctl P_TRACED flag
        var info = kinfo_proc()
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        var size = MemoryLayout<kinfo_proc>.stride
        let result = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
        if result == 0 {
            return (info.kp_proc.p_flag & P_TRACED) != 0
        }
        return false
    }
}
```

### 3. Web RASP

Web RASP capabilities are inherently limited but should include:

```typescript
// Extension/tampering detection heuristics
function checkWebIntegrity(): { suspicious: boolean; signals: string[] } {
  const signals: string[] = [];

  // Check 1: DevTools open detection (debugger timing)
  const start = performance.now();
  debugger; // This statement pauses execution when DevTools is open
  if (performance.now() - start > 100) signals.push('devtools_open');

  // Check 2: Console override detection
  if (console.log.toString().length !== /* expected native length */) {
    signals.push('console_override');
  }

  // Check 3: Verify CSP is active
  if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    signals.push('csp_missing');
  }

  return { suspicious: signals.length > 0, signals };
}
```

> **Note:** Web RASP is inherently weak. The primary web security boundary
> should be the CSP, SRI, and server-side controls. Client-side web checks
> are informational only.

### 4. KMP Shared Interface

```kotlin
/**
 * Cross-platform runtime integrity checking interface.
 *
 * Each platform implements detection appropriate to its capabilities.
 * Results are reported to the server via the existing SyncHealthMonitor
 * for security posture tracking.
 *
 * PRIVACY: Detection results MUST only contain generic signal names
 * (e.g., "root_detected"), never device identifiers, user PII, or
 * financial data.
 */
interface RuntimeIntegrityChecker {
    /** Check device integrity and return the result. */
    suspend fun checkIntegrity(): IntegrityResult

    /** The current integrity level based on the last check. */
    val currentLevel: IntegrityLevel
}

enum class IntegrityLevel {
    CLEAN,        // No threats detected
    SUSPICIOUS,   // Minor signals (emulator, debug build)
    COMPROMISED,  // Root/jailbreak or debugger detected
    ACTIVE_ATTACK, // Frida/instrumentation detected
    TAMPERED,     // Binary integrity violated
}

data class IntegrityResult(
    val level: IntegrityLevel,
    val signals: List<String>, // Generic signal names only
    val timestamp: Long,
)
```

---

## Security Response Matrix

| Detection                        | Level             | Client Response                                      | Server Notification          |
| -------------------------------- | ----------------- | ---------------------------------------------------- | ---------------------------- |
| Emulator detected                | 1 - Suspicious    | Log warning                                          | Sync health report flag      |
| Root/jailbreak (low confidence)  | 2 - Compromised   | Show warning dialog                                  | Integrity flag on next sync  |
| Root/jailbreak (high confidence) | 2 - Compromised   | Disable biometric auth, require PIN + server re-auth | Integrity alert              |
| Debugger attached                | 3 - Active Attack | Clear in-memory tokens, require re-auth              | Session invalidation request |
| Frida detected                   | 3 - Active Attack | Clear all tokens, lock app                           | Force session revocation     |
| APK signature mismatch           | 4 - Tampered      | Refuse to start, show error                          | N/A (cannot connect)         |

---

## Privacy Safeguards

RASP telemetry MUST comply with the existing monitoring privacy policy:

1. **No device identifiers** in integrity reports (no IMEI, serial, MAC)
2. **No user PII** in detection signals
3. **Generic signal names only** — never raw file paths or process names
4. **Consent-gated** — integrity reporting uses the same consent provider
   as CrashReporter and MetricsCollector
5. **No financial data** ever included in integrity reports

---

## Implementation Roadmap

| Phase   | Priority | Controls                                 | Effort   | Status           |
| ------- | -------- | ---------------------------------------- | -------- | ---------------- |
| Phase 1 | P0       | Root/jailbreak detection (Android + iOS) | 3-4 days | ✅ Completed     |
| Phase 1 | P0       | APK signature verification (Android)     | 1 day    | ✅ Completed     |
| Phase 1 | P0       | Enable R8 minification (Android)         | 1 hour   | ✅ Completed     |
| Phase 1 | P0       | Disable web source maps (production)     | 1 hour   | ✅ Completed     |
| Phase 2 | P1       | Debugger detection (Android + iOS)       | 2-3 days | Launch +1 sprint |
| Phase 2 | P1       | KMP RuntimeIntegrityChecker interface    | 2 days   | ✅ Completed     |
| Phase 2 | P1       | Security response matrix integration     | 2 days   | Launch +1 sprint |
| Phase 3 | P2       | Frida detection (Android + iOS)          | 3-4 days | Post-launch      |
| Phase 3 | P2       | Emulator detection (Android)             | 1 day    | Post-launch      |
| Phase 3 | P2       | Server-side integrity policy engine      | 3-5 days | Post-launch      |

---

## References

- OWASP MASVS v2: MASVS-RESILIENCE (all controls)
- OWASP Mobile Testing Guide: Testing Resilience Against Reverse Engineering
- MASVS-RESILIENCE Audit (docs/architecture/masvs-resilience-audit.md)
- Android SafetyNet/Play Integrity API documentation
- Apple DeviceCheck / App Attest documentation
- [Implementation Specification](./rasp-implementation.md)
