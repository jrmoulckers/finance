// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import kotlinx.datetime.Instant

/**
 * Represents an authenticated user session (#68, #70).
 *
 * Contains the tokens needed to make authenticated requests to
 * Supabase and the metadata needed for token lifecycle management.
 *
 * **Security note:** [accessToken] and [refreshToken] are sensitive.
 * They must be stored in platform-specific secure storage (Keychain,
 * EncryptedSharedPreferences, etc.) via [TokenManager], and MUST
 * NOT be logged, serialized to disk in plaintext, or transmitted
 * to any third-party service.
 *
 * @property accessToken  JWT access token for Supabase API calls.
 * @property refreshToken Opaque refresh token for obtaining new access tokens.
 * @property expiresAt    Instant at which [accessToken] expires.
 * @property userId       The authenticated user's UUID (from the JWT `sub` claim).
 */
data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Instant,
    val userId: String,
) {
    override fun toString(): String =
        "AuthSession(userId=$userId, accessToken=*****, refreshToken=*****, expiresAt=$expiresAt)"

    /**
     * Check whether this session's access token is still valid.
     *
     * @param now The current instant (injectable for testing).
     * @return `true` if the access token has not yet expired.
     */
    fun isValid(now: Instant): Boolean = now < expiresAt

    /**
     * Check whether this session's access token is close enough to
     * expiry that a proactive refresh should be triggered.
     *
     * The default threshold is 2 minutes before expiry, matching
     * [TokenManager.REFRESH_THRESHOLD_SECONDS].
     *
     * @param now                The current instant.
     * @param thresholdSeconds   Seconds before expiry to consider "needs refresh".
     * @return `true` if a refresh should be initiated.
     */
    fun needsRefresh(now: Instant, thresholdSeconds: Long = 120): Boolean {
        val thresholdInstant = Instant.fromEpochMilliseconds(
            expiresAt.toEpochMilliseconds() - (thresholdSeconds * 1000),
        )
        return now >= thresholdInstant
    }
}
