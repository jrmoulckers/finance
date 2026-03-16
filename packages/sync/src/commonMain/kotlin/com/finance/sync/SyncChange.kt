// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * The type of operation in a server-originated [SyncChange].
 *
 * Distinct from [MutationOperation] because the server collapses
 * INSERT and UPDATE into a single [UPSERT] semantic — the client
 * applies an upsert regardless of whether the row existed locally.
 */
@Serializable
enum class ChangeOperation {
    /** Insert or update a record (server does not distinguish). */
    UPSERT,

    /** Soft-delete a record (sets `deleted_at`, does not physically remove). */
    DELETE,
}

/**
 * A single change received from the sync backend during a pull cycle.
 *
 * @property tableName The database table affected.
 * @property operation The kind of DML operation that was applied server-side.
 *   Uses [MutationOperation] for compatibility with conflict resolvers.
 * @property rowData Column name → serialised value map. `null` values represent SQL NULLs.
 * @property serverTimestamp The authoritative timestamp assigned by the server.
 * @property sequenceNumber A monotonically increasing number for ordering changes.
 *   Used by [com.finance.sync.delta.SequenceTracker] to implement delta sync.
 * @property recordId The ID of the specific record that was changed.
 *   Defaults to [rowData]`["id"]` when not explicitly set.
 * @property syncVersion The sync version of the record after this change was applied.
 * @property householdId The household scope for this change.
 */
@Serializable
data class SyncChange(
    val tableName: String,
    val operation: MutationOperation,
    val rowData: Map<String, String?>,
    val serverTimestamp: Instant,
    val sequenceNumber: Long,
    val recordId: String = "",
    val syncVersion: Long = 0L,
    val householdId: String = "",
) {
    init {
        require(tableName.isNotBlank()) { "Table name cannot be blank" }
        require(sequenceNumber >= 0) { "Sequence number must be non-negative, got $sequenceNumber" }
        require(syncVersion >= 0) { "Sync version must be non-negative, got $syncVersion" }
    }

    /**
     * The effective record ID for this change, falling back to the `id`
     * field in [rowData] if [recordId] was not explicitly set.
     */
    val effectiveRecordId: String
        get() = recordId.ifBlank { rowData["id"] ?: "" }

    /**
     * Map this change's [MutationOperation] to the simpler [ChangeOperation].
     *
     * INSERT and UPDATE both map to [ChangeOperation.UPSERT] because the
     * server-side semantic is always an upsert.
     */
    val changeOperation: ChangeOperation
        get() = when (operation) {
            MutationOperation.INSERT -> ChangeOperation.UPSERT
            MutationOperation.UPDATE -> ChangeOperation.UPSERT
            MutationOperation.DELETE -> ChangeOperation.DELETE
        }
}
