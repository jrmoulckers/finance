// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * The type of DML operation a [SyncMutation] represents.
 */
@Serializable
enum class MutationOperation {
    INSERT,
    UPDATE,
    DELETE,
}

/**
 * A single pending local mutation that must be pushed to the sync backend.
 *
 * @property id Unique mutation identifier (typically a UUID).
 * @property tableName The database table that was mutated.
 * @property operation The kind of DML operation.
 * @property rowData A map of column name → serialised value. `null` values represent SQL NULLs.
 * @property timestamp When the mutation was created on the client.
 */
@Serializable
data class SyncMutation(
    val id: String,
    val tableName: String,
    val operation: MutationOperation,
    val rowData: Map<String, String?>,
    val timestamp: Instant,
) {
    init {
        require(id.isNotBlank()) { "Mutation id cannot be blank" }
        require(tableName.isNotBlank()) { "Table name cannot be blank" }
    }

    /**
     * A composite key for deduplication: two mutations targeting the same row
     * in the same table are considered duplicates (latest wins).
     */
    val entityKey: String
        get() = "$tableName:${rowData["id"] ?: id}"
}
