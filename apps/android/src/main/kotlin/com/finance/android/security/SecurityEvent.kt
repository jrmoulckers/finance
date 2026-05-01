// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

/**
 * Sealed class representing security events detected at runtime.
 *
 * Each event carries a [severity] level and a human-readable [message]
 * describing the detection. Events are consumed by [SecurityChecker]
 * and logged via Timber — **never** including device identifiers,
 * file paths, or process names to protect user privacy.
 */
sealed class SecurityEvent(
    /** Human-readable description of the security event. */
    open val message: String,
    /** Severity level of the event. */
    open val severity: Severity,
) {

    /** Severity levels for security events. */
    enum class Severity {
        /** Informational — logged but no action taken. */
        INFO,

        /** Warning — logged with elevated priority. */
        WARNING,

        /** Critical — may trigger app restrictions. */
        CRITICAL,
    }

    /** Root access detected on the device. */
    data class RootDetected(
        val confidence: Float,
        val signals: List<String>,
    ) : SecurityEvent(
        message = "Root access detected (confidence: ${(confidence * 100).toInt()}%)",
        severity = if (confidence > 0.5f) Severity.CRITICAL else Severity.WARNING,
    )

    /** An active debugger is attached to the process. */
    data object DebuggerAttached : SecurityEvent(
        message = "Debugger attached to process",
        severity = Severity.CRITICAL,
    )

    /** The app is running on an emulator rather than physical hardware. */
    data object EmulatorDetected : SecurityEvent(
        message = "Emulator environment detected",
        severity = Severity.WARNING,
    )

    /** APK signature does not match the expected release certificate. */
    data object TamperDetected : SecurityEvent(
        message = "APK signature verification failed",
        severity = Severity.CRITICAL,
    )

    /** The app is running in a cloned or work-profile container. */
    data object AppCloningDetected : SecurityEvent(
        message = "App cloning or dual-space detected",
        severity = Severity.WARNING,
    )

    /** Accessibility service with potential overlay capability detected. */
    data object SuspiciousAccessibilityService : SecurityEvent(
        message = "Suspicious accessibility service detected",
        severity = Severity.WARNING,
    )
}