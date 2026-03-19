// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange

/**
 * Server-always-wins conflict resolver.
 *
 * Unconditionally accepts the server's version of a record when a conflict is
 * detected. This is the safest strategy when the server is the authoritative
 * source of truth and local offline edits should be discarded on conflict.
 *
 * Use cases:
 * - System-managed tables where server-side business rules are canonical
 *   (e.g., household membership, user roles).
 * - Initial sync bootstrapping where the server snapshot is guaranteed correct.
 */
class ServerWinsResolver : ConflictResolver {

    /**
     * Always returns the [remote] (server-originated) change.
     */
    override fun resolve(local: SyncChange, remote: SyncChange): SyncChange = remote

    /**
     * Always accepts the server's data.
     *
     * - Server DELETE → [ConflictResolution.Delete].
     * - Server non-DELETE → [ConflictResolution.AcceptServer] with the server data.
     */
    override fun resolveConflict(conflict: SyncConflict): ConflictResolution =
        if (conflict.serverOperation == MutationOperation.DELETE) {
            ConflictResolution.Delete
        } else {
            ConflictResolution.AcceptServer(conflict.serverData)
        }
}
