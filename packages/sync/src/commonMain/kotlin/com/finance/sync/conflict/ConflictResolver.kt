// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange

/**
 * Resolves conflicts between a local change and a remote change targeting
 * the same entity (same table + row ID).
 *
 * Implementations decide which version wins, or produce a merged result.
 *
 * This interface exposes two resolution APIs:
 * - [resolve]: the low-level API that works directly with [SyncChange] pairs.
 * - [resolveConflict]: the high-level API that works with a [SyncConflict]
 *   descriptor and returns a [ConflictResolution] sealed result.
 *
 * All implementations must be **deterministic** — given the same inputs they
 * must always produce the same output regardless of call order — and
 * **stateless** so they are safe to invoke from any coroutine.
 */
interface ConflictResolver {

    /**
     * Given two conflicting changes for the same row, produce the winning change.
     *
     * @param local  The locally-originated change.
     * @param remote The server-originated change.
     * @return The resolved [SyncChange] to apply.
     */
    fun resolve(local: SyncChange, remote: SyncChange): SyncChange

    /**
     * Resolve a conflict described by a [SyncConflict] descriptor.
     *
     * The default implementation bridges to [resolve] by constructing
     * temporary [SyncChange] instances. Subclasses may override to provide
     * richer resolution logic that leverages the additional metadata in
     * [SyncConflict] (e.g., sync versions).
     *
     * @param conflict The detected conflict with both local and server data.
     * @return The [ConflictResolution] decision.
     */
    fun resolveConflict(conflict: SyncConflict): ConflictResolution {
        val local = SyncChange(
            tableName = conflict.tableName,
            operation = conflict.localOperation,
            rowData = conflict.localData ?: emptyMap(),
            serverTimestamp = conflict.localTimestamp,
            sequenceNumber = conflict.localVersion,
        )
        val remote = SyncChange(
            tableName = conflict.tableName,
            operation = conflict.serverOperation,
            rowData = conflict.serverData ?: emptyMap(),
            serverTimestamp = conflict.serverTimestamp,
            sequenceNumber = conflict.serverVersion,
        )
        val winner = resolve(local, remote)
        return when {
            winner.operation == MutationOperation.DELETE -> ConflictResolution.Delete
            winner === remote -> ConflictResolution.AcceptServer(winner.rowData)
            winner === local -> ConflictResolution.AcceptLocal(winner.rowData)
            else -> ConflictResolution.Merged(winner.rowData)
        }
    }

    /**
     * Resolve a batch of conflicts, pairing each [SyncConflict] with its
     * [ConflictResolution].
     *
     * The default implementation resolves each conflict individually via
     * [resolveConflict]. Implementations may override to apply cross-record
     * logic (e.g., ensuring referential integrity across related records).
     *
     * @param conflicts The list of detected conflicts.
     * @return A list of pairs mapping each conflict to its resolution.
     */
    fun resolveAll(
        conflicts: List<SyncConflict>,
    ): List<Pair<SyncConflict, ConflictResolution>> =
        conflicts.map { it to resolveConflict(it) }
}
