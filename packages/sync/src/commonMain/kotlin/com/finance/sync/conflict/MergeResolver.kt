// SPDX-License-Identifier: BUSL-1.1

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
 *
 * @param fallbackResolver Resolver used when field-level merge is impossible
 *   (e.g., both sides delete, or a non-mergeable financial field is modified by
 *   both sides). Defaults to [LastWriteWinsResolver].
 * @param nonMergeableFields Field names that are considered indivisible — if
 *   both sides modify one of these, the entire record is delegated to
 *   [fallbackResolver] instead of doing per-field merge. Typical examples are
 *   monetary fields (`amount`, `currency_code`) and record type discriminators.
 */
class MergeResolver(
    private val fallbackResolver: ConflictResolver = LastWriteWinsResolver(),
    private val nonMergeableFields: Set<String> = setOf("amount", "currency_code", "type"),
) : ConflictResolver {

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

    /**
     * High-level conflict resolution using [SyncConflict] metadata.
     *
     * Resolution logic:
     * 1. If either side is a DELETE → delegate to [fallbackResolver].
     * 2. If both sides are `null` data → [ConflictResolution.Delete].
     * 3. If only one side has data → accept that side.
     * 4. Compute the set of fields changed by each side (fields present in
     *    one side but not the other, or differing values).
     * 5. Partition into non-conflicting (only one side touched) and
     *    conflicting (both sides touched with different values).
     * 6. If any conflicting field is in [nonMergeableFields] → delegate the
     *    entire record to [fallbackResolver].
     * 7. For non-conflicting fields take the changed value; for conflicting
     *    fields use server value and tag `__conflict_<field>` with the
     *    rejected local value.
     * 8. Return [ConflictResolution.Merged].
     */
    override fun resolveConflict(conflict: SyncConflict): ConflictResolution {
        // 1. Deletes cannot be field-merged.
        if (conflict.involvesDelete) {
            return fallbackResolver.resolveConflict(conflict)
        }

        val localData = conflict.localData
        val serverData = conflict.serverData

        // 2. Both sides null — effectively a double-delete / no data.
        if (localData == null && serverData == null) {
            return ConflictResolution.Delete
        }

        // 3. One side null — accept the non-null side.
        if (localData == null) return ConflictResolution.AcceptServer(serverData)
        if (serverData == null) return ConflictResolution.AcceptLocal(localData)

        // 4. Compute per-field diffs.
        val allKeys = localData.keys + serverData.keys

        val merged = mutableMapOf<String, String?>()
        var hasNonMergeableConflict = false

        for (key in allKeys) {
            // Skip conflict-marker keys from previous merges.
            if (key.startsWith("__conflict_")) continue

            val localValue = localData[key]
            val remoteValue = serverData[key]
            val localHas = key in localData
            val remoteHas = key in serverData

            when {
                // Only one side has the field → take the present value.
                localHas && !remoteHas -> merged[key] = localValue
                remoteHas && !localHas -> merged[key] = remoteValue

                // Same value → no conflict.
                localValue == remoteValue -> merged[key] = localValue

                // updated_at — always take the later one.
                key == "updated_at" -> {
                    merged[key] = maxOf(localValue ?: "", remoteValue ?: "")
                }

                // True field conflict.
                else -> {
                    // 6. Non-mergeable field conflict → bail out to fallback.
                    if (key in nonMergeableFields) {
                        hasNonMergeableConflict = true
                        break
                    }
                    // 7. Mergeable field conflict — server wins, flag local.
                    merged[key] = remoteValue
                    merged["__conflict_$key"] = localValue
                }
            }
        }

        if (hasNonMergeableConflict) {
            return fallbackResolver.resolveConflict(conflict)
        }

        return ConflictResolution.Merged(merged)
    }
}
