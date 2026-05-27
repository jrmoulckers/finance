// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.repository

import com.finance.core.mood.MoodTagPrivacyFilters
import com.finance.sync.ChangeOperation
import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import com.finance.sync.SyncMutation
import com.finance.sync.queue.MutationQueue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.datetime.Clock

/**
 * Bridges the repository layer to the sync engine.
 *
 * Responsibilities:
 * 1. **Outbound**: Collects unsynced records → [SyncMutation]s → [MutationQueue]
 * 2. **Inbound**: Applies incoming [SyncChange]s to the correct repository
 * 3. **Health**: Exposes combined unsynced count across all repositories
 */
class RepositorySyncBridge(
    private val repositories: Map<String, SyncableRepository<*>>,
    private val mutationQueue: MutationQueue,
    private val clock: Clock = Clock.System,
    private val moodTagSyncEnabled: () -> Boolean = { false },
) {

    @Suppress("UNCHECKED_CAST")
    suspend fun collectUnsyncedMutations(): Int {
        var count = 0
        for ((tableName, repo) in repositories) {
            val unsynced = (repo as SyncableRepository<Any>).getUnsynced()
            for (entity in unsynced) {
                val rowData = filterOutboundRow(tableName, repo.toRowData(entity))
                val id = rowData["id"] ?: continue
                val mutation = SyncMutation(
                    id = "${tableName}_${id}_${clock.now().toEpochMilliseconds()}",
                    tableName = tableName,
                    operation = MutationOperation.UPDATE,
                    rowData = rowData,
                    timestamp = clock.now(),
                    recordId = id,
                    householdId = rowData["household_id"] ?: "",
                )
                mutationQueue.enqueue(mutation)
                count++
            }
        }
        return count
    }

    private fun filterOutboundRow(tableName: String, rowData: Map<String, String?>): Map<String, String?> =
        if (tableName == "transactions" || tableName == "transaction") {
            MoodTagPrivacyFilters.filterForSync(rowData, moodTagSyncEnabled())
        } else {
            rowData
        }

    suspend fun applyIncomingChanges(changes: List<SyncChange>): Int {
        var applied = 0
        for (change in changes) {
            val repo = repositories[change.tableName] ?: continue
            val isDelete = change.changeOperation == ChangeOperation.DELETE
            repo.applySyncChange(change.rowData, isDelete, change.syncVersion)
            applied++
        }
        return applied
    }

    suspend fun acknowledgeSyncedMutations(mutations: List<SyncMutation>) {
        @Suppress("LoopWithTooManyJumpStatements")
        for (mutation in mutations) {
            val repo = repositories[mutation.tableName] ?: continue
            val recordId = if (mutation.recordId.isNotBlank()) {
                mutation.recordId
            } else {
                mutation.rowData["id"] ?: continue
            }
            val syncVersion = mutation.rowData["sync_version"]?.toLongOrNull() ?: 0L
            repo.markSynced(recordId, syncVersion)
        }
    }

    fun observeTotalUnsyncedCount(): Flow<Int> {
        val flows = repositories.values.map { it.observeUnsyncedCount() }
        if (flows.isEmpty()) return flowOf(0)
        return combine(flows) { counts -> counts.sum() }
    }
}
