// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Credentials required to establish a connection with the sync backend.
 *
 * Combines the bearer token for authenticating the sync session with
 * optional refresh-token support for proactive token renewal.
 *
 * @property endpointUrl The PowerSync (or compatible) service endpoint URL.
 *   Defaults to an empty string when the URL is supplied via [SyncConfig.endpoint].
 * @property authToken A short-lived JWT or bearer token for authenticating the sync session.
 * @property userId The authenticated user's identifier, used for bucket-level data partitioning.
 * @property refreshToken An opaque refresh token for obtaining new access tokens.
 *   `null` when refresh is not supported or tokens are managed externally.
 * @property expiresAt The instant at which [authToken] expires, or `null` if unknown.
 */
@Serializable
data class SyncCredentials(
    val endpointUrl: String = "",
    val authToken: String,
    val userId: String,
    val refreshToken: String? = null,
    val expiresAt: Instant? = null,
) {
    init {
        require(authToken.isNotBlank()) { "Auth token cannot be blank" }
        require(userId.isNotBlank()) { "User ID cannot be blank" }
    }

    // ── Security (S-8) ──────────────────────────────────────────────
    override fun toString(): String =
        "SyncCredentials(endpointUrl=$endpointUrl, authToken=*****, userId=$userId)"

    // ── Token lifecycle helpers ─────────────────────────────────────

    /**
     * Check whether this credential's auth token has expired.
     *
     * Returns `false` when [expiresAt] is `null` (unknown expiry).
     *
     * @param now The current instant (injectable for testing).
     * @return `true` if the auth token has expired.
     */
    fun isExpired(now: Instant = Clock.System.now()): Boolean {
        return expiresAt != null && now >= expiresAt
    }

    /**
     * Check whether the auth token is close enough to expiry that a
     * proactive refresh should be triggered.
     *
     * Returns `false` when [expiresAt] is `null` (unknown expiry).
     *
     * @param bufferMs Milliseconds before expiry to consider "expiring soon".
     *   Defaults to 60 000 (1 minute).
     * @param now The current instant (injectable for testing).
     * @return `true` if a refresh should be initiated.
     */
    fun isExpiringSoon(bufferMs: Long = 60_000L, now: Instant = Clock.System.now()): Boolean {
        if (expiresAt == null) return false
        val threshold = Instant.fromEpochMilliseconds(
            expiresAt.toEpochMilliseconds() - bufferMs,
        )
        return now >= threshold
    }
}
