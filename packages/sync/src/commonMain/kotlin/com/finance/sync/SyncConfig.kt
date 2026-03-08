// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.serialization.Serializable

/**
 * Configuration for initialising a [SyncProvider].
 *
 * @property endpoint The base URL of the sync backend (e.g. PowerSync service).
 * @property databaseName Local database file name used by the sync provider.
 * @property syncRulesRef An opaque reference to the active sync-rules version on the backend.
 *   May be `null` when the provider discovers rules automatically.
 */
@Serializable
data class SyncConfig(
    val endpoint: String,
    val databaseName: String,
    val syncRulesRef: String? = null,
) {
    init {
        require(endpoint.isNotBlank()) { "Sync endpoint cannot be blank" }
        require(databaseName.isNotBlank()) { "Database name cannot be blank" }
    }
}
