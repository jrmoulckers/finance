// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import android.content.Context
import android.os.Build
import android.os.Debug
import timber.log.Timber

/**
 * Runtime Application Self-Protection (RASP) checker.
 *
 * Performs multiple security checks at app startup and on-demand to detect
 * hostile runtime environments. Each check produces a [SecurityEvent] that
 * is logged via Timber — **never** including device-identifying information.
 *
 * ## Checks Performed
 * 1. **Root detection** — delegates to [RootDetector]
 * 2. **Debugger detection** — checks [Debug.isDebuggerConnected]
 * 3. **Emulator detection** — inspects [Build] fingerprints
 * 4. **Tamper detection** — delegates to [IntegrityVerifier]
 *
 * ## Privacy
 * No device identifiers, user data, or file paths are included in
 * security events or log output.
 *
 * @param context Application [Context] for package manager and system queries.
 */
class SecurityChecker(private val context: Context) {

    /**
     * Aggregated result of all security checks.
     *
     * @property events All detected security events.
     * @property isSecure `true` when no CRITICAL events were detected.
     */
    data class SecurityReport(
        val events: List<SecurityEvent>,
        val isSecure: Boolean,
    )

    /**
     * Runs all security checks and returns a [SecurityReport].
     *
     * This method is safe to call from a background thread and completes
     * synchronously (no I/O beyond local filesystem probes).
     */
    fun performFullCheck(): SecurityReport {
        val events = mutableListOf<SecurityEvent>()

        checkRoot(events)
        checkDebugger(events)
        checkEmulator(events)
        checkTamper(events)

        val isSecure = events.none {
            it.severity == SecurityEvent.Severity.CRITICAL
        }

        if (!isSecure) {
            Timber.w("Security check FAILED — %d event(s) detected", events.size)
        } else {
            Timber.i("Security check passed — %d info/warning event(s)", events.size)
        }

        return SecurityReport(events = events, isSecure = isSecure)
    }

    /**
     * Checks whether the device is rooted.
     */
    private fun checkRoot(events: MutableList<SecurityEvent>) {
        val result = RootDetector.check(context)
        if (result.isRooted) {
            events.add(
                SecurityEvent.RootDetected(
                    confidence = result.confidence,
                    signals = result.signals,
                ),
            )
            Timber.w("Root detection positive — confidence %.0f%%", result.confidence * 100)
        }
    }

    /**
     * Checks whether a debugger is currently attached.
     */
    private fun checkDebugger(events: MutableList<SecurityEvent>) {
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) {
            events.add(SecurityEvent.DebuggerAttached)
            Timber.w("Debugger attachment detected")
        }
    }

    /**
     * Checks whether the app is running on an emulator.
     *
     * Uses multiple heuristics from [Build] properties to detect
     * common emulator fingerprints.
     */
    private fun checkEmulator(events: MutableList<SecurityEvent>) {
        val isEmulator = Build.FINGERPRINT.startsWith("generic") ||
            Build.FINGERPRINT.startsWith("unknown") ||
            Build.MODEL.contains("google_sdk") ||
            Build.MODEL.contains("Emulator") ||
            Build.MODEL.contains("Android SDK built for x86") ||
            Build.MANUFACTURER.contains("Genymotion") ||
            Build.BRAND.startsWith("generic") ||
            Build.DEVICE.startsWith("generic") ||
            Build.PRODUCT == "sdk_gphone64_arm64" ||
            Build.PRODUCT == "sdk_gphone_x86_64" ||
            Build.HARDWARE.contains("goldfish") ||
            Build.HARDWARE.contains("ranchu")

        if (isEmulator) {
            events.add(SecurityEvent.EmulatorDetected)
            Timber.w("Emulator environment detected")
        }
    }

    /**
     * Verifies APK signing certificate integrity.
     */
    private fun checkTamper(events: MutableList<SecurityEvent>) {
        if (!IntegrityVerifier.verifyApkSignature(context)) {
            events.add(SecurityEvent.TamperDetected)
            Timber.w("APK signature verification failed")
        }
    }
}