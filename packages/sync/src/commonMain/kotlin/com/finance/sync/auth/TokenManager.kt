// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Manages secure storage and lifecycle of authentication tokens (#70).
 *
 * This class wraps a platform-specific [TokenStorage] (expect/actual)
 * and provides token expiry detection plus auto-refresh scheduling logic.
 *
 * **Security:** Tokens are stored in platform-secure storage:
 * - iOS: App-managed Keychain Services (temporary in-memory KMP fallback until Swift Export wiring lands)
 * - Android: EncryptedSharedPreferences (AndroidX Security)
 * - JVM/Desktop: OS-specific credential store
 * - Web: HttpOnly cookies or in-memory (never localStorage)
 *
 * @property storage  Platform-specific secure token storage.
 * @property clock    Time source (injectable for deterministic testing).
 */
class TokenManager(
    private val storage: TokenStorage,
    private val clock: Clock = Clock.System,
) {

    companion object {
        /**
         * Seconds before token expiry at which a proactive refresh
         * should be triggered. Defaults to 120 seconds (2 minutes).
         */
        const val REFRESH_THRESHOLD_SECONDS: Long = 120
    }

    /**
     * Persist an [AuthSession]'s tokens to secure storage.
     *
     * @param session The session whose tokens should be stored.
     */
    fun storeTokens(session: AuthSession) {
        storage.save(
            accessToken = session.accessToken,
            refreshToken = session.refreshToken,
            expiresAt = session.expiresAt.toEpochMilliseconds(),
            userId = session.userId,
        )
    }

    /**
     * Retrieve a previously stored session from secure storage.
     *
     * @return The reconstructed [AuthSession], or `null` if no tokens
     *         are stored or storage is corrupted.
     */
    fun retrieveTokens(): AuthSession? {
        val data = storage.load() ?: return null
        return AuthSession(
            accessToken = data.accessToken,
            refreshToken = data.refreshToken,
            expiresAt = Instant.fromEpochMilliseconds(data.expiresAtMillis),
            userId = data.userId,
        )
    }

    /**
     * Remove all stored tokens from secure storage.
     *
     * Called on sign-out or when tokens are irrecoverably invalid.
     */
    fun clearTokens() {
        storage.clear()
    }

    /**
     * Check whether the given [session]'s access token has expired.
     *
     * @param session The session to check.
     * @return `true` if the token's expiry instant is in the past.
     */
    fun isTokenExpired(session: AuthSession): Boolean {
        return clock.now() >= session.expiresAt
    }

    /**
     * Check whether the given [session]'s access token should be
     * proactively refreshed (within [REFRESH_THRESHOLD_SECONDS] of expiry).
     *
     * This enables seamless token refresh before the user experiences
     * a 401 error.
     *
     * @param session The session to check.
     * @return `true` if a refresh should be initiated now.
     */
    fun shouldRefresh(session: AuthSession): Boolean {
        val now = clock.now()
        val refreshAt = Instant.fromEpochMilliseconds(
            session.expiresAt.toEpochMilliseconds() - (REFRESH_THRESHOLD_SECONDS * 1000),
        )
        return now >= refreshAt
    }

    /**
     * Calculate the delay (in milliseconds) until the next auto-refresh
     * should fire for the given [session].
     *
     * Returns 0 if the token already needs refreshing.
     *
     * @param session The session to calculate refresh delay for.
     * @return Milliseconds until refresh should occur, or 0 if immediate.
     */
    fun millisUntilRefresh(session: AuthSession): Long {
        val refreshAtMillis =
            session.expiresAt.toEpochMilliseconds() - (REFRESH_THRESHOLD_SECONDS * 1000)
        val nowMillis = clock.now().toEpochMilliseconds()
        return maxOf(0L, refreshAtMillis - nowMillis)
    }
}

/**
 * Platform-specific secure token storage (expect/actual pattern).
 *
 * Each platform must provide an `actual` implementation backed by
 * its native secure storage mechanism.
 */
expect open class TokenStorage() {

    /**
     * Persist token data to secure storage.
     */
    open fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    )

    /**
     * Load token data from secure storage.
     *
     * @return The stored data, or `null` if nothing is stored.
     */
    open fun load(): StoredTokenData?

    /**
     * Remove all token data from secure storage.
     */
    open fun clear()
}

/**
 * Data class holding raw token values as loaded from storage.
 */
data class StoredTokenData(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val userId: String,
)
