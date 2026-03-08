// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.SyncChange

/**
 * Last-Write-Wins conflict resolver.
 *
 * Compares the `updated_at` field in each change's [SyncChange.rowData].
 * If both timestamps are identical, the server timestamp ([SyncChange.serverTimestamp])
 * is used as a tiebreaker — the server-authoritative change wins because the
 * server timestamp is assigned after the client timestamp.
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
}
