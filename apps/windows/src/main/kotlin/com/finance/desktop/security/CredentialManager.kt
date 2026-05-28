// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.security

import java.util.logging.Level
import java.util.logging.Logger

/**
 * High-level credential manager that coordinates Windows Hello authentication
 * with DPAPI-backed secure storage.
 *
 * This class provides the primary API for the authentication flow:
 *
 * 1. **Store credentials** — After successful login, encrypt and persist
 *    tokens using DPAPI via [SecureTokenStorage].
 * 2. **Retrieve credentials** — Authenticate via Windows Hello, then decrypt
 *    and return stored tokens.
 * 3. **Clear credentials** — On sign-out, securely delete all stored tokens.
 *
 * ## Security Contract
 *
 * - Credentials are NEVER stored in plaintext on disk
 * - Credentials are NEVER returned without prior Windows Hello authentication
 *   (when Windows Hello is available and auth is required)
 * - DPAPI binds ciphertext to the current Windows user account
 * - Token files reside in `%LOCALAPPDATA%\FinanceUserData\security\`
 *
 * @param windowsHelloManager Windows Hello biometric/PIN authentication
 * @param secureTokenStorage DPAPI-encrypted token persistence
 */
class CredentialManager(
    private val windowsHelloManager: WindowsHelloManager,
    private val secureTokenStorage: SecureTokenStorage,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(CredentialManager::class.java.name)
    }

    /**
     * Stores authentication tokens securely using DPAPI encryption.
     *
     * Call after successful OAuth/login flow to persist credentials for
     * future app launches. Each token is encrypted independently.
     *
     * @param accessToken OAuth access token
     * @param refreshToken OAuth refresh token (nullable — not all flows provide one)
     * @param idToken OpenID Connect ID token (nullable)
     * @throws DpapiException if encryption fails
     */
    fun storeCredentials(
        accessToken: String,
        refreshToken: String? = null,
        idToken: String? = null,
    ) {
        logger.info("Storing credentials via DPAPI")

        secureTokenStorage.saveToken(SecureTokenStorage.KEY_ACCESS_TOKEN, accessToken)

        if (refreshToken != null) {
            secureTokenStorage.saveToken(SecureTokenStorage.KEY_REFRESH_TOKEN, refreshToken)
        }

        if (idToken != null) {
            secureTokenStorage.saveToken(SecureTokenStorage.KEY_ID_TOKEN, idToken)
        }

        logger.info("Credentials stored successfully")
    }

    /**
     * Retrieves stored credentials after authenticating via Windows Hello.
     *
     * If Windows Hello is available, the user must authenticate before
     * credentials are returned. If Windows Hello is not available, credentials
     * are returned directly (the DPAPI user-scope binding provides the
     * security guarantee in this case).
     *
     * @param requireAuth Whether to require Windows Hello authentication.
     *   Set to `false` for background token refresh operations.
     * @return [StoredCredentials] if authentication succeeds and credentials
     *   exist, or `null` if authentication fails or no credentials are stored.
     */
    @Suppress("ReturnCount") // Credential validation with early returns
    fun retrieveCredentials(requireAuth: Boolean = true): StoredCredentials? {
        if (requireAuth && windowsHelloManager.canAuthenticate()) {
            val authenticated = windowsHelloManager.authenticate(
                "Finance needs to verify your identity to access stored credentials",
            )
            if (!authenticated) {
                logger.warning("Windows Hello authentication failed — credentials not released")
                return null
            }
        }

        return try {
            val accessToken = secureTokenStorage.loadToken(SecureTokenStorage.KEY_ACCESS_TOKEN)
                ?: return null

            StoredCredentials(
                accessToken = accessToken,
                refreshToken = secureTokenStorage.loadToken(SecureTokenStorage.KEY_REFRESH_TOKEN),
                idToken = secureTokenStorage.loadToken(SecureTokenStorage.KEY_ID_TOKEN),
            )
        } catch (e: DpapiException) {
            logger.log(Level.SEVERE, "Failed to retrieve credentials from DPAPI storage", e)
            null
        }
    }

    /**
     * Clears all stored credentials and tokens.
     *
     * Call on sign-out to ensure no sensitive data remains on disk.
     *
     * @return The number of token files removed.
     */
    fun clearCredentials(): Int {
        logger.info("Clearing all stored credentials")
        return secureTokenStorage.clearAllTokens()
    }

    /**
     * Checks whether stored credentials exist.
     *
     * Does NOT decrypt or validate the credentials — only checks file existence.
     */
    fun hasStoredCredentials(): Boolean {
        return secureTokenStorage.hasToken(SecureTokenStorage.KEY_ACCESS_TOKEN)
    }
}

/**
 * Container for decrypted credentials retrieved from DPAPI storage.
 *
 * @property accessToken OAuth access token (always present).
 * @property refreshToken OAuth refresh token (optional).
 * @property idToken OpenID Connect ID token (optional).
 */
data class StoredCredentials(
    val accessToken: String,
    val refreshToken: String? = null,
    val idToken: String? = null,
)
