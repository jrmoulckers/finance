package com.finance.desktop.security

import java.util.logging.Level
import java.util.logging.Logger

/**
 * Windows Hello biometric / PIN authentication manager.
 *
 * Windows Hello provides passwordless authentication using the device's biometric
 * sensors (fingerprint, facial recognition, iris) or a device-specific PIN. This
 * manager abstracts the platform APIs behind a simple `canAuthenticate` / `authenticate`
 * contract.
 *
 * ## Implementation Strategy
 *
 * Full Windows Hello integration requires WinRT interop to access
 * `Windows.Security.Credentials.UI.UserConsentVerifier`. This implementation
 * delegates to PowerShell's WinRT projection to invoke `UserConsentVerifier`
 * without requiring a native WinRT/JNA bridge in the JVM process.
 *
 * For production deployments requiring tighter integration (e.g. credential
 * guard, WebAuthn/FIDO2 key attestation), swap in a JNA/JNI provider that
 * calls the Win32 `UserConsentVerifier` COM APIs directly.
 *
 * @see WindowsHelloProvider for the pluggable authentication backend
 */
class WindowsHelloManager private constructor(
    private val provider: WindowsHelloProvider,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(WindowsHelloManager::class.java.name)

        /**
         * Creates a [WindowsHelloManager] using the default PowerShell-based provider.
         * Works on Windows 10 1607+ with Windows Hello configured.
         */
        fun create(): WindowsHelloManager = WindowsHelloManager(PowerShellWindowsHelloProvider())

        /**
         * Creates a [WindowsHelloManager] with a custom [WindowsHelloProvider].
         * Use this to inject a WinRT/JNA provider or a test double.
         */
        fun create(provider: WindowsHelloProvider): WindowsHelloManager =
            WindowsHelloManager(provider)
    }

    /**
     * Checks whether Windows Hello authentication is available on this device.
     *
     * Returns `true` if the device has at least one Windows Hello authenticator
     * configured (biometric sensor or PIN). Returns `false` if Windows Hello is
     * not set up, the OS version is too old, or the check fails.
     */
    fun canAuthenticate(): Boolean {
        return try {
            provider.checkAvailability()
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Windows Hello availability check failed", e)
            false
        }
    }

    /**
     * Prompts the user for Windows Hello authentication.
     *
     * This displays the system Windows Hello dialog, which may request a
     * fingerprint, face scan, iris scan, or PIN depending on the user's
     * configured authenticators. The system handles fallback ordering
     * automatically — if biometrics fail or are unavailable, the user is
     * prompted for their PIN.
     *
     * @param reason a human-readable string explaining why authentication is
     *        needed, displayed in the Windows Hello prompt
     * @return `true` if the user successfully authenticated, `false` if
     *         they cancelled or authentication failed
     */
    fun authenticate(reason: String = "Finance needs to verify your identity"): Boolean {
        if (!canAuthenticate()) {
            logger.warning("Windows Hello is not available on this device")
            return false
        }

        return try {
            provider.requestVerification(reason)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Windows Hello authentication failed", e)
            false
        }
    }
}

/**
 * Abstraction over the Windows Hello `UserConsentVerifier` API.
 *
 * Implementations:
 * - [PowerShellWindowsHelloProvider] — ships by default; uses PowerShell WinRT projection.
 * - A future JNA/JNI provider can invoke WinRT COM interfaces directly for lower latency.
 */
interface WindowsHelloProvider {
    /**
     * Checks whether a Windows Hello authenticator is configured.
     *
     * Maps to `UserConsentVerifier.CheckAvailabilityAsync()`.
     *
     * @return `true` if at least one authenticator (biometric or PIN) is available
     */
    fun checkAvailability(): Boolean

    /**
     * Requests user consent via Windows Hello.
     *
     * Maps to `UserConsentVerifier.RequestVerificationAsync(message)`.
     * The system automatically handles biometric → PIN fallback.
     *
     * @param message the reason string shown in the consent dialog
     * @return `true` if the user verified successfully
     */
    fun requestVerification(message: String): Boolean
}

/**
 * Windows Hello provider that delegates to PowerShell WinRT projections.
 *
 * Uses `Windows.Security.Credentials.UI.UserConsentVerifier` through PowerShell's
 * WinRT type accelerator.
 *
 * **Availability result mapping:**
 * - `Available` (0) → `true`
 * - `DeviceNotPresent` (1) → `false`
 * - `NotConfiguredForUser` (2) → `false`
 * - `DisabledByPolicy` (3) → `false`
 * - `DeviceBusy` (4) → `false`
 *
 * **Verification result mapping:**
 * - `Verified` (0) → `true`
 * - `DeviceNotPresent` (1) → `false`
 * - `NotConfiguredForUser` (2) → `false`
 * - `DisabledByPolicy` (3) → `false`
 * - `DeviceBusy` (4) → `false`
 * - `RetriesExhausted` (5) → `false`
 * - `Canceled` (6) → `false`
 */
internal class PowerShellWindowsHelloProvider : WindowsHelloProvider {

    companion object {
        private val logger: Logger = Logger.getLogger(PowerShellWindowsHelloProvider::class.java.name)
    }

    override fun checkAvailability(): Boolean {
        // Use the WinRT UserConsentVerifier to check if Windows Hello is configured.
        // The async result is awaited synchronously via .GetAwaiter().GetResult().
        val script = buildString {
            append("[Windows.Security.Credentials.UI.UserConsentVerifier,")
            append("Windows.Security.Credentials.UI,")
            append("ContentType=WindowsRuntime] | Out-Null; ")
            append("\$result = [Windows.Security.Credentials.UI.UserConsentVerifier]")
            append("::CheckAvailabilityAsync().GetAwaiter().GetResult(); ")
            append("if (\$result -eq 'Available') { Write-Output 'true' } ")
            append("else { Write-Output 'false' }")
        }

        return try {
            val output = executePowerShell(script)
            output.trim().equals("true", ignoreCase = true)
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Failed to check Windows Hello availability", e)
            false
        }
    }

    override fun requestVerification(message: String): Boolean {
        // Sanitize the message to prevent PowerShell injection
        val sanitizedMessage = message
            .replace("'", "''")
            .replace("\n", " ")
            .replace("\r", "")
            .take(256)

        val script = buildString {
            append("[Windows.Security.Credentials.UI.UserConsentVerifier,")
            append("Windows.Security.Credentials.UI,")
            append("ContentType=WindowsRuntime] | Out-Null; ")
            append("\$result = [Windows.Security.Credentials.UI.UserConsentVerifier]")
            append("::RequestVerificationAsync('$sanitizedMessage').GetAwaiter().GetResult(); ")
            append("if (\$result -eq 'Verified') { Write-Output 'true' } ")
            append("else { Write-Output 'false' }")
        }

        return try {
            val output = executePowerShell(script)
            output.trim().equals("true", ignoreCase = true)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Windows Hello verification request failed", e)
            false
        }
    }

    /**
     * Executes a PowerShell script and returns its stdout.
     *
     * @throws WindowsHelloException if the process exits with a non-zero code
     */
    private fun executePowerShell(script: String): String {
        val process = ProcessBuilder(
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            script,
        )
            .redirectErrorStream(false)
            .start()

        val stdout = process.inputStream.bufferedReader().readText()
        val stderr = process.errorStream.bufferedReader().readText()
        val exitCode = process.waitFor()

        if (exitCode != 0) {
            logger.log(Level.SEVERE, "PowerShell Windows Hello command failed (exit=$exitCode): $stderr")
            throw WindowsHelloException(
                "Windows Hello operation failed with exit code $exitCode: ${stderr.take(200)}"
            )
        }

        return stdout
    }
}

/**
 * Exception thrown when a Windows Hello operation fails unexpectedly.
 */
class WindowsHelloException(message: String, cause: Throwable? = null) : Exception(message, cause)
