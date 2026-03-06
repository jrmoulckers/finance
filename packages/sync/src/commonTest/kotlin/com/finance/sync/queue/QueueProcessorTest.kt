package com.finance.sync.queue

import app.cash.turbine.test
import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.SyncConfig
import com.finance.sync.SyncStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class QueueProcessorTest {

    // -- Helpers --

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

    /**
     * A [SyncProvider] that returns success or failure based on a configurable
     * counter or predicate.
     */
    private class FakeSyncProvider(
        private val pushBehavior: (List<SyncMutation>) -> Result<Unit> = { Result.success(Unit) },
    ) : SyncProvider {
        override suspend fun initialize(config: SyncConfig) {}
        override suspend fun push(mutations: List<SyncMutation>): Result<Unit> =
            pushBehavior(mutations)
        override fun pull(): Flow<List<SyncChange>> = emptyFlow()
        override fun getStatus(): Flow<SyncStatus> = emptyFlow()
    }

    // -- Tests --

    @Test
    fun emptyQueueEmitsIdleThenCompleted() = runTest {
        val queue = InMemoryMutationQueue()
        val processor = QueueProcessor(queue, FakeSyncProvider())

        processor.process().test {
            assertIs<QueueProcessorStatus.Idle>(awaitItem())
            assertIs<QueueProcessorStatus.Completed>(awaitItem())
            awaitComplete()
        }
    }

    @Test
    fun singleMutationPushedSuccessfully() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())
        val processor = QueueProcessor(queue, FakeSyncProvider())

        processor.process().test {
            assertIs<QueueProcessorStatus.Idle>(awaitItem())
            assertIs<QueueProcessorStatus.Completed>(awaitItem())
            awaitComplete()
        }

        assertEquals(0, queue.pendingCount(), "Queue should be empty after successful push")
    }

    @Test
    fun multipleMutationsProcessedInOrder() = runTest {
        val pushOrder = mutableListOf<String>()
        val provider = FakeSyncProvider { mutations ->
            pushOrder.add(mutations.first().id)
            Result.success(Unit)
        }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-3", rowId = "row-3"))

        val processor = QueueProcessor(queue, provider)

        processor.process().test {
            assertIs<QueueProcessorStatus.Idle>(awaitItem())
            // After m-1 succeeds, 2 remain
            val p1 = awaitItem()
            assertIs<QueueProcessorStatus.Processing>(p1)
            assertEquals(2, p1.remaining)
            // After m-2 succeeds, 1 remains
            val p2 = awaitItem()
            assertIs<QueueProcessorStatus.Processing>(p2)
            assertEquals(1, p2.remaining)
            // m-3 is the last one, then Completed
            assertIs<QueueProcessorStatus.Completed>(awaitItem())
            awaitComplete()
        }

        assertEquals(listOf("m-1", "m-2", "m-3"), pushOrder)
    }

    @Test
    fun failedMutationEmitsFailedStatus() = runTest {
        val error = RuntimeException("Network error")
        val provider = FakeSyncProvider { Result.failure(error) }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())

        val processor = QueueProcessor(
            queue = queue,
            provider = provider,
            maxRetries = 1,         // fail immediately
            initialBackoffMs = 1L,  // tiny delay for tests
        )

        processor.process().test {
            assertIs<QueueProcessorStatus.Idle>(awaitItem())
            val failed = awaitItem()
            assertIs<QueueProcessorStatus.Failed>(failed)
            assertEquals("m-1", failed.mutationId)
            assertIs<QueueProcessorStatus.Completed>(awaitItem())
            awaitComplete()
        }
    }

    @Test
    fun retrySucceedsOnSecondAttempt() = runTest {
        var callCount = 0
        val provider = FakeSyncProvider {
            callCount++
            if (callCount == 1) Result.failure(RuntimeException("Temporary error"))
            else Result.success(Unit)
        }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())

        val processor = QueueProcessor(
            queue = queue,
            provider = provider,
            maxRetries = 3,
            initialBackoffMs = 1L,
        )

        processor.process().test {
            assertIs<QueueProcessorStatus.Idle>(awaitItem())
            assertIs<QueueProcessorStatus.Completed>(awaitItem())
            awaitComplete()
        }

        assertEquals(0, queue.pendingCount())
        assertEquals(2, callCount, "Should have retried once")
    }

    @Test
    fun backoffComputation() {
        val processor = QueueProcessor(
            queue = InMemoryMutationQueue(),
            provider = FakeSyncProvider(),
            initialBackoffMs = 1_000L,
            maxBackoffMs = 300_000L,
            backoffFactor = 2.0,
        )

        assertEquals(1_000L, processor.computeBackoff(1))   // 1s
        assertEquals(2_000L, processor.computeBackoff(2))   // 2s
        assertEquals(4_000L, processor.computeBackoff(3))   // 4s
        assertEquals(8_000L, processor.computeBackoff(4))   // 8s
        assertEquals(16_000L, processor.computeBackoff(5))  // 16s
    }

    @Test
    fun backoffIsCappedAtMax() {
        val processor = QueueProcessor(
            queue = InMemoryMutationQueue(),
            provider = FakeSyncProvider(),
            initialBackoffMs = 1_000L,
            maxBackoffMs = 10_000L,
            backoffFactor = 2.0,
        )

        // Attempt 5 → 16_000 but capped at 10_000
        assertEquals(10_000L, processor.computeBackoff(5))
        assertEquals(10_000L, processor.computeBackoff(10))
    }

    @Test
    fun maxRetriesExhaustedRemovesMutation() = runTest {
        val provider = FakeSyncProvider { Result.failure(RuntimeException("Permanent error")) }
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())

        val processor = QueueProcessor(
            queue = queue,
            provider = provider,
            maxRetries = 3,
            initialBackoffMs = 1L,
        )

        processor.process().test {
            assertIs<QueueProcessorStatus.Idle>(awaitItem())
            val failed = awaitItem()
            assertIs<QueueProcessorStatus.Failed>(failed)
            assertIs<QueueProcessorStatus.Completed>(awaitItem())
            awaitComplete()
        }

        assertEquals(0, queue.pendingCount(), "Failed mutation should be dequeued")
    }
}
