// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * A single change received from the sync backend during a pull cycle.
 *
 * @property tableName The database table affected.
 * @property operation The kind of DML operation that was applied server-side.
 * @property rowData Column name → serialised value map. `null` values represent SQL NULLs.
 * @property serverTimestamp The authoritative timestamp assigned by the server.
 * @property sequenceNumber A monotonically increasing number for ordering changes.
 *   Used by [com.finance.sync.delta.SequenceTracker] to implement delta sync.
 */
@Serializable
data class SyncChange(
    val tableName: String,
    val operation: MutationOperation,
    val rowData: Map<String, String?>,
    val serverTimestamp: Instant,
    val sequenceNumber: Long,
) {
    init {
        require(tableName.isNotBlank()) { "Table name cannot be blank" }
        require(sequenceNumber >= 0) { "Sequence number must be non-negative, got $sequenceNumber" }
    }
}
