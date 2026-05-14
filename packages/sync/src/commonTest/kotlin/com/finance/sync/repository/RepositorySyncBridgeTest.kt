// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.repository

import com.finance.db.repository.BaseRepository
import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import com.finance.sync.SyncMutation
import com.finance.sync.queue.MutationQueue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RepositorySyncBridgeTest {

    data class TestEntity(val id: String, val name: String, val householdId: String = "hh-001",
        val isSynced: Boolean = false, val syncVersion: Long = 0)

    class FakeSyncableRepository(override val tableName: String = "test_entity") : SyncableRepository<TestEntity> {
        val entities = mutableMapOf<String, TestEntity>()
        val syncedIds = mutableSetOf<String>()
        val appliedChanges = mutableListOf<Triple<Map<String, String?>, Boolean, Long>>()

        override fun observeAll(): Flow<List<TestEntity>> = flowOf(entities.values.toList())
        override suspend fun getById(id: String): TestEntity? = entities[id]
        override suspend fun insert(entity: TestEntity) { entities[entity.id] = entity }
        override suspend fun update(entity: TestEntity) { entities[entity.id] = entity }
        override suspend fun softDelete(id: String) { entities.remove(id) }
        override suspend fun getUnsynced(): List<TestEntity> = entities.values.filter { !it.isSynced }
        override suspend fun markSynced(id: String, syncVersion: Long) {
            syncedIds.add(id)
            entities[id]?.let { entities[id] = it.copy(isSynced = true, syncVersion = syncVersion) }
        }
        override suspend fun applySyncChange(rowData: Map<String, String?>, isDelete: Boolean, syncVersion: Long) {
            appliedChanges.add(Triple(rowData, isDelete, syncVersion))
            val id = rowData["id"] ?: return
            if (isDelete) entities.remove(id)
            else entities[id] = TestEntity(id, rowData["name"] ?: "", isSynced = true, syncVersion = syncVersion)
        }
        override suspend fun toRowData(entity: TestEntity): Map<String, String?> = mapOf(
            "id" to entity.id, "name" to entity.name, "household_id" to entity.householdId,
            "sync_version" to entity.syncVersion.toString())
        override fun observeUnsyncedCount(): Flow<Int> = flowOf(entities.values.count { !it.isSynced })
    }

    class FakeMutationQueue : MutationQueue {
        val mutations = mutableListOf<SyncMutation>()
        override val pendingCountFlow: Flow<Int> = flowOf(0)
        override val hasPendingMutations: Flow<Boolean> = flowOf(false)
        override suspend fun enqueue(mutation: SyncMutation) { mutations.add(mutation) }
        override suspend fun enqueueAll(mutations: List<SyncMutation>) { this.mutations.addAll(mutations) }
        override suspend fun peek(): SyncMutation? = mutations.firstOrNull()
        override suspend fun peekBatch(limit: Int) = mutations.take(limit)
        override suspend fun allPending() = mutations.toList()
        override suspend fun getMutationsForRecord(tableName: String, recordId: String) =
            mutations.filter { it.tableName == tableName && it.recordId == recordId }
        override suspend fun dequeue(id: String) { mutations.removeAll { it.id == id } }
        override suspend fun acknowledge(mutationIds: List<String>) { mutations.removeAll { it.id in mutationIds } }
        override suspend fun markFailed(mutationIds: List<String>) { /* no-op in test */ }
        override suspend fun getDeadLetterMutations(maxRetries: Int) = emptyList<SyncMutation>()
        override suspend fun getRetryCount(mutationId: String) = 0
        override suspend fun pendingCount() = mutations.size
        override suspend fun clear() { mutations.clear() }
    }

    @Test fun collectUnsyncedMutations_enqueuesUnsynced() = runTest {
        val repo = FakeSyncableRepository()
        repo.entities["e1"] = TestEntity("e1", "Entity 1", isSynced = false)
        repo.entities["e2"] = TestEntity("e2", "Entity 2", isSynced = true)
        repo.entities["e3"] = TestEntity("e3", "Entity 3", isSynced = false)
        val queue = FakeMutationQueue()
        val bridge = RepositorySyncBridge(mapOf("test_entity" to repo), queue)
        assertEquals(2, bridge.collectUnsyncedMutations())
        assertEquals(2, queue.mutations.size)
    }

    @Test fun collectUnsyncedMutations_zeroWhenAllSynced() = runTest {
        val repo = FakeSyncableRepository()
        repo.entities["e1"] = TestEntity("e1", "Entity 1", isSynced = true)
        val queue = FakeMutationQueue()
        assertEquals(0, RepositorySyncBridge(mapOf("test_entity" to repo), queue).collectUnsyncedMutations())
    }

    @Test fun applyIncomingChanges_appliesUpsert() = runTest {
        val repo = FakeSyncableRepository()
        val bridge = RepositorySyncBridge(mapOf("test_entity" to repo), FakeMutationQueue())
        val changes = listOf(SyncChange("test_entity", MutationOperation.INSERT,
            mapOf("id" to "e1", "name" to "New"), Clock.System.now(), 1L, syncVersion = 1L))
        assertEquals(1, bridge.applyIncomingChanges(changes))
        assertEquals("New", repo.entities["e1"]?.name)
    }

    @Test fun applyIncomingChanges_appliesDelete() = runTest {
        val repo = FakeSyncableRepository()
        repo.entities["e1"] = TestEntity("e1", "To Delete")
        val bridge = RepositorySyncBridge(mapOf("test_entity" to repo), FakeMutationQueue())
        val changes = listOf(SyncChange("test_entity", MutationOperation.DELETE,
            mapOf("id" to "e1"), Clock.System.now(), 2L, syncVersion = 2L))
        assertEquals(1, bridge.applyIncomingChanges(changes))
        assertTrue(repo.appliedChanges[0].second)
    }

    @Test fun applyIncomingChanges_skipsUnknownTable() = runTest {
        val bridge = RepositorySyncBridge(mapOf("test_entity" to FakeSyncableRepository()), FakeMutationQueue())
        assertEquals(0, bridge.applyIncomingChanges(listOf(SyncChange("unknown", MutationOperation.INSERT,
            mapOf("id" to "x"), Clock.System.now(), 1L))))
    }

    @Test fun acknowledgeSyncedMutations_marksSynced() = runTest {
        val repo = FakeSyncableRepository()
        repo.entities["e1"] = TestEntity("e1", "Entity 1", isSynced = false)
        val bridge = RepositorySyncBridge(mapOf("test_entity" to repo), FakeMutationQueue())
        bridge.acknowledgeSyncedMutations(listOf(SyncMutation("mut-1", "test_entity",
            MutationOperation.UPDATE, mapOf("id" to "e1", "sync_version" to "5"),
            Clock.System.now(), recordId = "e1")))
        assertTrue("e1" in repo.syncedIds)
        assertEquals(5L, repo.entities["e1"]?.syncVersion)
    }

    @Test fun multipleRepositories_collectionSpansAll() = runTest {
        val repo1 = FakeSyncableRepository(tableName = "accounts")
        repo1.entities["a1"] = TestEntity("a1", "Account", isSynced = false)
        val repo2 = FakeSyncableRepository(tableName = "transactions")
        repo2.entities["t1"] = TestEntity("t1", "Txn 1", isSynced = false)
        repo2.entities["t2"] = TestEntity("t2", "Txn 2", isSynced = false)
        val queue = FakeMutationQueue()
        assertEquals(3, RepositorySyncBridge(mapOf("accounts" to repo1, "transactions" to repo2), queue).collectUnsyncedMutations())
    }
}
