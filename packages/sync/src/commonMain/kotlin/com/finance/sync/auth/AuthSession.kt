// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import com.finance.sync.SyncCredentials
import kotlinx.datetime.Clock
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
 * @property createdAt    Instant at which this session was created.
 */
data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Instant,
    val userId: String,
    val createdAt: Instant = Clock.System.now(),
) {
    override fun toString(): String =
        "AuthSession(userId=$userId, accessToken=*****, refreshToken=*****, expiresAt=$expiresAt)"

    /**
     * Check whether this session's access token is still valid.
     *
     * @param now The current instant (injectable for testing).
     * @return `true` if the access token has not yet expired.
     */
    fun isValid(now: Instant = Clock.System.now()): Boolean = now < expiresAt

    /**
     * Check whether this session's access token is close enough to
     * expiry that a proactive refresh should be triggered.
     *
     * The default threshold is 5 minutes before expiry, providing
     * a comfortable window for the refresh round-trip.
     *
     * @param bufferMs      Milliseconds before expiry to consider "needs refresh".
     *   Defaults to 300 000 (5 minutes).
     * @param now           The current instant.
     * @return `true` if a refresh should be initiated.
     */
    fun needsRefresh(
        bufferMs: Long = 300_000L,
        now: Instant = Clock.System.now(),
    ): Boolean {
        val thresholdInstant = Instant.fromEpochMilliseconds(
            expiresAt.toEpochMilliseconds() - bufferMs,
        )
        return now >= thresholdInstant
    }

    /**
     * Convert this auth session to [SyncCredentials] for use with the
     * sync engine. The endpoint URL is not included — it should come
     * from [com.finance.sync.SyncConfig.endpoint].
     *
     * @return A [SyncCredentials] instance populated from this session.
     */
    fun toSyncCredentials(): SyncCredentials = SyncCredentials(
        authToken = accessToken,
        userId = userId,
        refreshToken = refreshToken,
        expiresAt = expiresAt,
    )
}
