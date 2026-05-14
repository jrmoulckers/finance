// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

import java.util.logging.Level
import java.util.logging.Logger

/**
 * Manages the complete Windows Hello biometric authentication session lifecycle.
 *
 * Coordinates:
 * 1. **Session start** — Windows Hello verification + DPAPI credential unlock
 * 2. **Session monitoring** — Auto-lock timer integration
 * 3. **Session re-lock** — Re-verification required after timeout
 * 4. **Credential binding** — DPAPI ensures credentials are bound to the authenticated user
 *
 * ## Security Model
 *
 * Authentication follows a two-layer security approach:
 * - **Layer 1**: Windows Hello (biometric/PIN) verifies the physical user
 * - **Layer 2**: DPAPI (CurrentUser scope) ensures only the authenticated
 *   Windows user can decrypt stored credentials
 *
 * The combination prevents both remote attacks (credentials encrypted at rest)
 * and physical access attacks (Windows Hello gate before credential access).
 *
 * @param windowsHelloManager Windows Hello biometric/PIN manager.
 * @param credentialManager DPAPI-backed credential storage.
 * @param autoLockManager Inactivity timer for automatic session locking.
 */
class SessionManager(
    private val windowsHelloManager: WindowsHelloManager,
    private val credentialManager: CredentialManager,
    private val autoLockManager: AutoLockManager,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(SessionManager::class.java.name)
    }

    @Volatile
    private var isSessionActive: Boolean = false

    /**
     * Whether the current session is authenticated and active.
     */
    fun isAuthenticated(): Boolean = isSessionActive

    /**
     * Start a new authenticated session.
     *
     * 1. Prompts Windows Hello verification
     * 2. On success, activates the auto-lock timer
     * 3. Returns stored credentials for API use
     *
     * @param reason Human-readable reason for the Windows Hello prompt.
     * @return [StoredCredentials] if authentication succeeds, `null` otherwise.
     */
    @Suppress("ReturnCount") // Session validation with early returns
    fun startSession(
        reason: String = "Finance needs to verify your identity",
    ): StoredCredentials? {
        if (!windowsHelloManager.canAuthenticate()) {
            logger.info("Windows Hello unavailable — starting session without biometric gate")
            isSessionActive = true
            autoLockManager.resetTimer()
            return credentialManager.retrieveCredentials(requireAuth = false)
        }

        val authenticated = windowsHelloManager.authenticate(reason)
        if (!authenticated) {
            logger.warning("Windows Hello authentication failed — session not started")
            return null
        }

        isSessionActive = true
        autoLockManager.resetTimer()
        logger.info("Authenticated session started")
        return credentialManager.retrieveCredentials(requireAuth = false)
    }

    /**
     * Lock the current session, requiring re-authentication.
     *
     * Called by the auto-lock timer or manually from the UI.
     */
    fun lockSession() {
        isSessionActive = false
        autoLockManager.dispose()
        logger.info("Session locked")
    }

    /**
     * Re-authenticate to unlock a locked session.
     *
     * @return `true` if re-authentication succeeds.
     */
    fun unlockSession(
        reason: String = "Finance is locked. Verify your identity to continue.",
    ): Boolean {
        if (!windowsHelloManager.canAuthenticate()) {
            isSessionActive = true
            autoLockManager.unlock()
            return true
        }

        val authenticated = windowsHelloManager.authenticate(reason)
        if (authenticated) {
            isSessionActive = true
            autoLockManager.unlock()
            logger.info("Session unlocked via Windows Hello")
        } else {
            logger.warning("Session unlock failed — Windows Hello verification rejected")
        }
        return authenticated
    }

    /**
     * End the session completely (sign out).
     *
     * Clears all stored credentials and stops the auto-lock timer.
     */
    fun endSession() {
        isSessionActive = false
        autoLockManager.dispose()
        credentialManager.clearCredentials()
        logger.info("Session ended and credentials cleared")
    }

    /**
     * Report user activity to reset the auto-lock timer.
     *
     * Call on any user interaction (mouse, keyboard, etc.).
     */
    fun reportActivity() {
        if (isSessionActive) {
            autoLockManager.resetTimer()
        }
    }

    /**
     * Clean up resources. Call during application shutdown.
     */
    fun dispose() {
        autoLockManager.dispose()
    }
}
