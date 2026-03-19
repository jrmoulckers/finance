// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange

/**
 * Last-Write-Wins conflict resolver.
 *
 * Compares the `updated_at` field in each change's [SyncChange.rowData].
 * If both timestamps are identical, the server timestamp ([SyncChange.serverTimestamp])
 * is used as a tiebreaker — the server-authoritative change wins because the
 * server timestamp is assigned after the client timestamp.
 *
 * ## Delete handling
 *
 * - If the server issued a DELETE, the delete is always honoured (intent to
 *   remove is preserved).
 * - If the local side issued a DELETE but the server did not, the version
 *   comparison decides: a higher server version means the server "revived"
 *   the record, so the server update wins; otherwise the local delete wins.
 * - If both sides deleted, the higher-version delete is used (or the server's
 *   on a tie).
 */
class LastWriteWinsResolver : ConflictResolver {

    override fun resolve(local: SyncChange, remote: SyncChange): SyncChange {
        val localUpdatedAt = local.rowData["updated_at"]
        val remoteUpdatedAt = remote.rowData["updated_at"]

        // If either side is missing updated_at, prefer the remote (server authority).
        if (localUpdatedAt == null || remoteUpdatedAt == null) {
            return remote
        }

        return when {
            // Remote is strictly newer → remote wins.
            remoteUpdatedAt > localUpdatedAt -> remote

            // Local is strictly newer → local wins.
            localUpdatedAt > remoteUpdatedAt -> local

            // Tie-break: server timestamp is authoritative.
            else -> when {
                remote.serverTimestamp > local.serverTimestamp -> remote
                local.serverTimestamp > remote.serverTimestamp -> local
                // Absolute tie (extremely unlikely) → prefer remote (server authority).
                else -> remote
            }
        }
    }

    /**
     * High-level conflict resolution using [SyncConflict] metadata.
     *
     * Resolution order:
     * 1. If the server operation is DELETE → [ConflictResolution.Delete].
     * 2. If the local operation is DELETE and server is not → compare versions.
     *    Higher server version means the server revived the record; otherwise
     *    the local delete intent wins.
     * 3. Compare `syncVersion`: higher version wins.
     * 4. On equal versions the server wins (tie-breaker — server is source of truth).
     */
    override fun resolveConflict(conflict: SyncConflict): ConflictResolution {
        // 1. Server DELETE always wins — honour the intent to remove.
        if (conflict.serverOperation == MutationOperation.DELETE) {
            return ConflictResolution.Delete
        }

        // 2. Local DELETE vs. server non-DELETE.
        if (conflict.localOperation == MutationOperation.DELETE) {
            // If the server has a strictly higher version, the record was
            // "revived" — accept the server's update.
            return if (conflict.serverVersion > conflict.localVersion) {
                ConflictResolution.AcceptServer(conflict.serverData)
            } else {
                ConflictResolution.Delete
            }
        }

        // 3. Both are non-DELETE — compare sync versions.
        return when {
            conflict.serverVersion > conflict.localVersion ->
                ConflictResolution.AcceptServer(conflict.serverData)

            conflict.localVersion > conflict.serverVersion ->
                ConflictResolution.AcceptLocal(conflict.localData)

            // 4. Equal versions — server wins as tie-breaker.
            else -> ConflictResolution.AcceptServer(conflict.serverData)
        }
    }
}
