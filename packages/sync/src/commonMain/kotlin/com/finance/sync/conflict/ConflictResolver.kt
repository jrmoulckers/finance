package com.finance.sync.conflict

import com.finance.sync.SyncChange

/**
 * Resolves conflicts between a local change and a remote change targeting
 * the same entity (same table + row ID).
 *
 * Implementations decide which version wins, or produce a merged result.
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
}
