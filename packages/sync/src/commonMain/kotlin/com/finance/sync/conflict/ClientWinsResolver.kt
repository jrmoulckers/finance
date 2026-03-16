// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange

/**
 * Client-always-wins conflict resolver.
 *
 * Unconditionally preserves the local (client) version of a record when a
 * conflict is detected. The server's changes are discarded.
 *
 * Use cases:
 * - Draft / unsaved data that the user is actively editing — the user's
 *   intent should not be silently overwritten by a background sync.
 * - Offline-first scenarios where the user explicitly chose to keep working
 *   despite being disconnected, and expects their changes to "stick".
 *
 * **Caution:** this strategy can cause data loss on the server side if the
 * server change carried important information. Prefer [LastWriteWinsResolver]
 * or [MergeResolver] for shared entities.
 */
class ClientWinsResolver : ConflictResolver {

    /**
     * Always returns the [local] (client-originated) change.
     */
    override fun resolve(local: SyncChange, remote: SyncChange): SyncChange = local

    /**
     * Always accepts the local data.
     *
     * - Local DELETE → [ConflictResolution.Delete].
     * - Local non-DELETE → [ConflictResolution.AcceptLocal] with the local data.
     */
    override fun resolveConflict(conflict: SyncConflict): ConflictResolution =
        if (conflict.localOperation == MutationOperation.DELETE) {
            ConflictResolution.Delete
        } else {
            ConflictResolution.AcceptLocal(conflict.localData)
        }
}
