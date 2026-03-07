package com.finance.sync.queue

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.SyncConfig
import com.finance.sync.SyncStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class QueueProcessorTest {

    private fun mutation(
        id: String = "m-1",
        rowId: String = "row-1",
        table: String = "accounts",
    ): SyncMutation = SyncMutation(
        id = id,
        tableName = table,
        operation = MutationOperation.INSERT,
        rowData = mapOf("id" to rowId, "name" to "Test"),
        timestamp = Instant.parse("2024-01-01T00:00:00Z"),
    )

    private class FakeSyncProvider(
        private val pushBehavior: (List<SyncMutation>) -> Result<Unit> = { Result.success(Unit) },
    ) : SyncProvider {
        override suspend fun initialize(config: SyncConfig) {}
        override suspend fun push(mutations: List<SyncMutation>): Result<Unit> = pushBehavior(mutations)
        override fun pull(): Flow<List<SyncChange>> = emptyFlow()
        override fun getStatus(): Flow<SyncStatus> = emptyFlow()
    }

    @Test
    fun emptyQueueEmitsIdleThenCompleted() = runTest {
        val statuses = QueueProcessor(InMemoryMutationQueue(), FakeSyncProvider()).process().toList()
        assertEquals(2, statuses.size)
        assertIs<QueueProcessorStatus.Idle>(statuses[0])
        assertIs<QueueProcessorStatus.Completed>(statuses[1])
    }

    @Test
    fun singleMutationPushedSuccessfully() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())
        val statuses = QueueProcessor(queue, FakeSyncProvider()).process().toList()
        assertIs<QueueProcessorStatus.Idle>(statuses.first())
        assertIs<QueueProcessorStatus.Completed>(statuses.last())
        assertEquals(0, queue.pendingCount())
    }

    @Test
    fun multipleMutationsProcessedInOrder() = runTest {
        val pushOrder = mutableListOf<String>()
        val provider = FakeSyncProvider { pushOrder.add(it.first().id); Result.success(Unit) }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-3", rowId = "row-3"))
        val statuses = QueueProcessor(queue, provider).process().toList()
        assertIs<QueueProcessorStatus.Idle>(statuses.first())
        assertIs<QueueProcessorStatus.Completed>(statuses.last())
        val processing = statuses.filterIsInstance<QueueProcessorStatus.Processing>()
        assertEquals(2, processing.size)
        assertEquals(2, processing[0].remaining)
        assertEquals(1, processing[1].remaining)
        assertEquals(listOf("m-1", "m-2", "m-3"), pushOrder)
    }

    @Test
    fun failedMutationEmitsFailedStatus() = runTest {
        val provider = FakeSyncProvider { Result.failure(RuntimeException("Network error")) }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())
        val statuses = QueueProcessor(queue, provider, maxRetries = 1, initialBackoffMs = 1L).process().toList()
        assertIs<QueueProcessorStatus.Idle>(statuses.first())
        val failed = statuses.filterIsInstance<QueueProcessorStatus.Failed>()
        assertEquals(1, failed.size)
        assertEquals("m-1", failed[0].mutationId)
        assertIs<QueueProcessorStatus.Completed>(statuses.last())
    }

    @Test
    fun retrySucceedsOnSecondAttempt() = runTest {
        var callCount = 0
        val provider = FakeSyncProvider {
            callCount++
            if (callCount == 1) Result.failure(RuntimeException("Temp")) else Result.success(Unit)
        }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())
        val statuses = QueueProcessor(queue, provider, maxRetries = 3, initialBackoffMs = 1L).process().toList()
        assertIs<QueueProcessorStatus.Idle>(statuses.first())
        assertIs<QueueProcessorStatus.Completed>(statuses.last())
        assertTrue(statuses.none { it is QueueProcessorStatus.Failed })
        assertEquals(2, callCount)
    }

    @Test
    fun backoffComputation() {
        val p = QueueProcessor(InMemoryMutationQueue(), FakeSyncProvider(), initialBackoffMs = 1_000L, maxBackoffMs = 300_000L, backoffFactor = 2.0)
        assertEquals(1_000L, p.computeBackoff(1))
        assertEquals(2_000L, p.computeBackoff(2))
        assertEquals(4_000L, p.computeBackoff(3))
        assertEquals(8_000L, p.computeBackoff(4))
        assertEquals(16_000L, p.computeBackoff(5))
    }

    @Test
    fun backoffIsCappedAtMax() {
        val p = QueueProcessor(InMemoryMutationQueue(), FakeSyncProvider(), initialBackoffMs = 1_000L, maxBackoffMs = 10_000L, backoffFactor = 2.0)
        assertEquals(10_000L, p.computeBackoff(5))
        assertEquals(10_000L, p.computeBackoff(10))
    }

    @Test
    fun maxRetriesExhaustedRemovesMutation() = runTest {
        val provider = FakeSyncProvider { Result.failure(RuntimeException("Permanent")) }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())
        val statuses = QueueProcessor(queue, provider, maxRetries = 3, initialBackoffMs = 1L).process().toList()
        assertIs<QueueProcessorStatus.Idle>(statuses.first())
        assertEquals(1, statuses.filterIsInstance<QueueProcessorStatus.Failed>().size)
        assertIs<QueueProcessorStatus.Completed>(statuses.last())
        assertEquals(0, queue.pendingCount())
    }
}