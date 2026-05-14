// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

/**
 * Security Architecture — Windows Hello Authentication Flow
 *
 * This file documents the security design decisions for the Finance Windows
 * desktop application's authentication system. It serves as both a reference
 * and an audit trail for security reviews.
 *
 * ## Authentication Flow
 *
 * ```
 * App Launch
 *   │
 *   ├─ Check Windows Hello availability
 *   │   └─ UserConsentVerifier.CheckAvailabilityAsync()
 *   │
 *   ├─ Check stored credentials exist
 *   │   └─ SecureTokenStorage.hasToken(KEY_ACCESS_TOKEN)
 *   │
 *   ├─ If Windows Hello available AND credentials exist:
 *   │   ├─ Show LockScreen
 *   │   ├─ User taps "Unlock with Windows Hello"
 *   │   ├─ UserConsentVerifier.RequestVerificationAsync(reason)
 *   │   │   ├─ Biometric (fingerprint/face/iris) → Verified
 *   │   │   ├─ PIN fallback → Verified
 *   │   │   └─ Cancel/Fail → Show error, allow retry
 *   │   └─ On success → Load tokens from DPAPI storage → Navigate to app
 *   │
 *   ├─ If Windows Hello NOT available:
 *   │   └─ Show "Continue without authentication" → Navigate to app
 *   │
 *   └─ If no stored credentials:
 *       └─ Skip lock screen → Navigate to app (first run)
 * ```
 *
 * ## Credential Storage (DPAPI)
 *
 * All sensitive data is encrypted using Windows Data Protection API (DPAPI)
 * with `CurrentUser` scope:
 *
 * - **Encryption**: `CryptProtectData` via `ProtectedData.Protect()`
 * - **Decryption**: `CryptUnprotectData` via `ProtectedData.Unprotect()`
 * - **Scope**: `CurrentUser` — only the same Windows user can decrypt
 * - **Storage location**: `%LOCALAPPDATA%\Finance\security\`
 * - **File format**: Base64-encoded DPAPI ciphertext, one file per token
 *
 * ### What's Protected
 *
 * | Key               | Contents                    |
 * |-------------------|-----------------------------|
 * | `access_token`    | OAuth access token          |
 * | `refresh_token`   | OAuth refresh token         |
 * | `id_token`        | OpenID Connect ID token     |
 * | `pref_*`          | Security preference flags   |
 *
 * ## Auto-Lock
 *
 * The [AutoLockManager] monitors user activity and triggers a re-authentication
 * prompt after a configurable period of inactivity (default: 5 minutes).
 *
 * - Timer resets on any user interaction
 * - Timer disabled when Windows Hello is not available
 * - Lock state persists across navigation (ViewModel-scoped)
 *
 * ## Threat Model
 *
 * | Threat                          | Mitigation                                |
 * |---------------------------------|-------------------------------------------|
 * | Stolen laptop (powered off)     | DPAPI ciphertext unreadable without user  |
 * | Other user on same PC           | DPAPI CurrentUser scope prevents access   |
 * | Shoulder surfing                | Windows Hello biometric, no visible PWs   |
 * | Process memory dump             | Tokens loaded on-demand, not cached        |
 * | PowerShell injection            | Input sanitization in PS providers         |
 * | Token file theft                | Files are DPAPI-encrypted blobs            |
 * | Unattended unlocked session     | Auto-lock after 5 min inactivity          |
 *
 * ## Limitations
 *
 * 1. **PowerShell subprocess model**: Each DPAPI/Windows Hello operation spawns
 *    a PowerShell process. Acceptable for infrequent auth operations but should
 *    be replaced with JNA for high-frequency use.
 *
 * 2. **No hardware-bound keys**: Current implementation uses DPAPI which is
 *    software-bound to the user profile. For FIDO2/WebAuthn hardware key
 *    attestation, a native WinRT bridge is needed.
 *
 * 3. **No remote attestation**: The current auth flow is local-only. Server-side
 *    verification of Windows Hello credentials requires WebAuthn integration.
 *
 * @see WindowsHelloManager
 * @see DpapiManager
 * @see SecureTokenStorage
 * @see AutoLockManager
 */
object SecurityAudit {
    const val AUDIT_VERSION = "1.0.0"
    const val LAST_REVIEWED = "2025-06-01"
    const val REVIEWER = "Windows Platform Engineer"

    /**
     * Validates that the security configuration meets minimum requirements.
     *
     * Call during startup to verify the security subsystem is properly configured.
     *
     * @return A list of warnings. Empty list means all checks passed.
     */
    fun validateConfiguration(): List<String> {
        val warnings = mutableListOf<String>()

        // Check DPAPI availability (Windows only)
        val os = System.getProperty("os.name", "").lowercase()
        if (!os.contains("windows")) {
            warnings.add("DPAPI is only available on Windows. Current OS: $os")
        }

        // Check storage directory permissions
        val localAppData = System.getenv("LOCALAPPDATA")
        if (localAppData.isNullOrBlank()) {
            warnings.add("LOCALAPPDATA environment variable not set")
        }

        // Check PowerShell availability
        @Suppress("TooGenericExceptionCaught") // Security audit must not crash the app
        try {
            val process = ProcessBuilder("powershell.exe", "-NoProfile", "-Command", "echo ok")
                .redirectErrorStream(true)
                .start()
            val output = process.inputStream.bufferedReader().readText().trim()
            val exitCode = process.waitFor()
            if (exitCode != 0 || output != "ok") {
                warnings.add("PowerShell is not functioning correctly (exit=$exitCode)")
            }
        } catch (e: Exception) {
            warnings.add("PowerShell is not available: ${e.message}")
        }

        return warnings
    }
}
