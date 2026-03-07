package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange

/**
 * Field-level merge resolver for complex / shared entities.
 *
 * Strategy:
 * 1. For each field, if only one side changed it (relative to a hypothetical base),
 *    take that side's value — no conflict.
 * 2. If both sides changed the same field to the *same* value, no conflict.
 * 3. If both sides changed the same field to *different* values, flag it with a
 *    `__conflict_<field>` key containing the rejected value so the UI layer
 *    can present it for user resolution.
 * 4. The `updated_at` field is always set to whichever is later.
 *
 * Because we don't have an explicit "base" snapshot in the offline-first model,
 * we approximate: the *remote* row is treated as base for fields the *local*
 * change didn't touch, and vice-versa. Fields present in both are compared
 * directly.
 */
class MergeResolver : ConflictResolver {

    override fun resolve(local: SyncChange, remote: SyncChange): SyncChange {
        // DELETE always wins — if either side deleted, propagate the delete.
        if (local.operation == MutationOperation.DELETE ||
            remote.operation == MutationOperation.DELETE
        ) {
            return if (remote.operation == MutationOperation.DELETE) remote else local
        }

        val merged = mutableMapOf<String, String?>()

        val allKeys = local.rowData.keys + remote.rowData.keys

        for (key in allKeys) {
            val localValue = local.rowData[key]
            val remoteValue = remote.rowData[key]
            val localHas = key in local.rowData
            val remoteHas = key in remote.rowData

            when {
                // Only one side has the field → take it.
                localHas && !remoteHas -> merged[key] = localValue
                remoteHas && !localHas -> merged[key] = remoteValue

                // Both sides have it with the same value → no conflict.
                localValue == remoteValue -> merged[key] = localValue

                // Special handling for updated_at — always pick the later one.
                key == "updated_at" -> {
                    merged[key] = maxOf(localValue ?: "", remoteValue ?: "")
                }

                // True conflict — keep remote value, flag local value for UI.
                else -> {
                    merged[key] = remoteValue
                    merged["__conflict_$key"] = localValue
                }
            }
        }

        // Use the later server timestamp and higher sequence number.
        val resolvedTimestamp = maxOf(local.serverTimestamp, remote.serverTimestamp)
        val resolvedSequence = maxOf(local.sequenceNumber, remote.sequenceNumber)

        return SyncChange(
            tableName = remote.tableName,
            operation = remote.operation,
            rowData = merged,
            serverTimestamp = resolvedTimestamp,
            sequenceNumber = resolvedSequence,
        )
    }
}
