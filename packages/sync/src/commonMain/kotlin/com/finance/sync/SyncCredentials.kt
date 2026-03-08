// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.serialization.Serializable

/**
 * Credentials required to establish a connection with the sync backend.
 *
 * @property endpointUrl The PowerSync (or compatible) service endpoint URL.
 * @property authToken A short-lived JWT or bearer token for authenticating the sync session.
 * @property userId The authenticated user's identifier, used for bucket-level data partitioning.
 */
@Serializable
data class SyncCredentials(
    val endpointUrl: String,
    val authToken: String,
    val userId: String,
) {
    init {
        require(endpointUrl.isNotBlank()) { "Sync endpoint URL cannot be blank" }
        require(authToken.isNotBlank()) { "Auth token cannot be blank" }
        require(userId.isNotBlank()) { "User ID cannot be blank" }
    }
}
