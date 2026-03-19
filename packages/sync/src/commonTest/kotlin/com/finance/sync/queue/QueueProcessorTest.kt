// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.queue

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import com.finance.sync.SyncConfig
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.SyncStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
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

    // ── Helpers ─────────────────────────────────────────────────────────

    private class FakeSyncProvider(
        private val pushBehavior: (List<SyncMutation>) -> Result<Unit> = { Result.success(Unit) },
    ) : SyncProvider {
        override suspend fun initialize(config: SyncConfig) {}
        override suspend fun push(mutations: List<SyncMutation>): Result<Unit> = pushBehavior(mutations)
        override fun pull(): Flow<List<SyncChange>> = emptyFlow()
        override fun getStatus(): Flow<SyncStatus> = emptyFlow()
    }

    /**
     * Create a pushFn that always succeeds (acknowledges every mutation).
     */
    private fun alwaysSucceedPushFn(): suspend (List<SyncMutation>) -> PushResult = { mutations ->
        PushResult(succeeded = mutations.map { it.id }, failed = emptyList())
    }

    /**
     * Create a pushFn that always fails all mutations.
     */
    private fun alwaysFailPushFn(
        error: String = "Server error",
        retryable: Boolean = true,
    ): suspend (List<SyncMutation>) -> PushResult = { mutations ->
        PushResult(
            succeeded = emptyList(),
            failed = mutations.map { PushFailure(it.id, error, retryable) },
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // Legacy API tests (process() flow with SyncProvider)
    // ═══════════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════════
    // New batch API tests (processNextBatch / processAll with pushFn)
    // ═══════════════════════════════════════════════════════════════════

    // ── processNextBatch ────────────────────────────────────────────────

    @Test
    fun processNextBatch_emptyQueue_returnsZeroResult() = runTest {
        val processor = QueueProcessor(
            queue = InMemoryMutationQueue(),
            pushFn = alwaysSucceedPushFn(),
        )
        val result = processor.processNextBatch()
        assertEquals(0, result.succeeded)
        assertEquals(0, result.failed)
        assertEquals(0, result.retryable)
        assertEquals(0, result.deadLettered)
        assertIs<ProcessingState.Idle>(processor.state.first())
    }

    @Test
    fun processNextBatch_allSucceed() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysSucceedPushFn(),
            batchSize = 10,
        )
        val result = processor.processNextBatch()
        assertEquals(2, result.succeeded)
        assertEquals(0, result.failed)
        assertEquals(0, queue.pendingCount())
    }

    @Test
    fun processNextBatch_respectsBatchSize() = runTest {
        val queue = InMemoryMutationQueue()
        for (i in 1..5) queue.enqueue(mutation(id = "m-$i", rowId = "row-$i"))

        val pushed = mutableListOf<String>()
        val processor = QueueProcessor(
            queue = queue,
            pushFn = { mutations ->
                pushed.addAll(mutations.map { it.id })
                PushResult(succeeded = mutations.map { it.id }, failed = emptyList())
            },
            batchSize = 2,
        )
        processor.processNextBatch()
        assertEquals(listOf("m-1", "m-2"), pushed, "Should process only batchSize mutations")
        assertEquals(3, queue.pendingCount())
    }

    @Test
    fun processNextBatch_partialFailure() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = { _ ->
                PushResult(
                    succeeded = listOf("m-1"),
                    failed = listOf(PushFailure("m-2", "Conflict", retryable = true)),
                )
            },
            batchSize = 10,
            maxRetries = 5,
        )
        val result = processor.processNextBatch()
        assertEquals(1, result.succeeded)
        assertEquals(1, result.retryable)
        assertEquals(0, result.failed)
        // m-1 removed, m-2 still in queue.
        assertEquals(1, queue.pendingCount())
        assertEquals(1, queue.getRetryCount("m-2"))
    }

    @Test
    fun processNextBatch_nonRetryableFailure_removedFromQueue() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = { _ ->
                PushResult(
                    succeeded = emptyList(),
                    failed = listOf(PushFailure("m-1", "Validation error", retryable = false)),
                )
            },
        )
        val result = processor.processNextBatch()
        assertEquals(0, result.succeeded)
        assertEquals(1, result.failed)
        assertEquals(0, queue.pendingCount(), "Non-retryable failures should be removed")
    }

    @Test
    fun processNextBatch_deadLetter_whenRetryCountExceedsMax() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        // Pre-set retry count to maxRetries - 1.
        repeat(4) { queue.markFailed(listOf("m-1")) }
        assertEquals(4, queue.getRetryCount("m-1"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = { _ ->
                PushResult(
                    succeeded = emptyList(),
                    failed = listOf(PushFailure("m-1", "Timeout", retryable = true)),
                )
            },
            maxRetries = 5,
        )
        val result = processor.processNextBatch()
        assertEquals(0, result.succeeded)
        assertEquals(1, result.deadLettered)
        // Mutation is still in queue for inspection but marked as dead-lettered.
        assertEquals(1, queue.pendingCount())
        assertEquals(5, queue.getRetryCount("m-1"))
    }

    @Test
    fun processNextBatch_updatesState() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysSucceedPushFn(),
        )
        assertIs<ProcessingState.Idle>(processor.state.value)
        processor.processNextBatch()
        // After successful processing, state returns to Idle.
        assertIs<ProcessingState.Idle>(processor.state.value)
    }

    @Test
    fun processNextBatch_failedState_onNonRetryable() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysFailPushFn(error = "Bad data", retryable = false),
        )
        processor.processNextBatch()
        assertIs<ProcessingState.Failed>(processor.state.value)
    }

    @Test
    fun processNextBatch_waitingForRetryState_onRetryable() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysFailPushFn(error = "Timeout", retryable = true),
            maxRetries = 5,
        )
        processor.processNextBatch()
        assertIs<ProcessingState.WaitingForRetry>(processor.state.value)
    }

    // ── processAll ──────────────────────────────────────────────────────

    @Test
    fun processAll_emptyQueue_returnsZeroResult() = runTest {
        val processor = QueueProcessor(
            queue = InMemoryMutationQueue(),
            pushFn = alwaysSucceedPushFn(),
        )
        val result = processor.processAll()
        assertEquals(0, result.succeeded)
        assertEquals(0, result.failed)
    }

    @Test
    fun processAll_drainsEntireQueue() = runTest {
        val queue = InMemoryMutationQueue()
        for (i in 1..7) queue.enqueue(mutation(id = "m-$i", rowId = "row-$i"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysSucceedPushFn(),
            batchSize = 3,
        )
        val result = processor.processAll()
        assertEquals(7, result.succeeded)
        assertEquals(0, result.failed)
        assertEquals(0, queue.pendingCount())
    }

    @Test
    fun processAll_stopsOnAllNonRetryableFailures() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysFailPushFn(error = "Permanent", retryable = false),
            batchSize = 10,
        )
        val result = processor.processAll()
        assertEquals(0, result.succeeded)
        assertEquals(2, result.failed)
        assertEquals(0, queue.pendingCount(), "Non-retryable failures removed")
    }

    @Test
    fun processAll_partialSuccessAndContinues() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-3", rowId = "row-3"))

        var callCount = 0
        val processor = QueueProcessor(
            queue = queue,
            pushFn = { mutations ->
                callCount++
                if (callCount == 1) {
                    // First batch: m-1 succeeds, m-2 fails retryably.
                    PushResult(
                        succeeded = listOf("m-1"),
                        failed = listOf(PushFailure("m-2", "Timeout", retryable = true)),
                    )
                } else {
                    // Subsequent batches: all succeed.
                    PushResult(succeeded = mutations.map { it.id }, failed = emptyList())
                }
            },
            batchSize = 2,
            maxRetries = 5,
            baseBackoffMs = 1L, // Minimal backoff for testing.
            maxBackoffMs = 1L,
        )
        val result = processor.processAll()
        assertEquals(3, result.succeeded) // m-1 + m-2 + m-3
    }

    @Test
    fun processAll_stopsWhenOnlyDeadLetterRemain() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        // Exhaust retries for m-1.
        repeat(5) { queue.markFailed(listOf("m-1")) }

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysSucceedPushFn(),
            maxRetries = 5,
        )
        val result = processor.processAll()
        assertEquals(0, result.succeeded)
        assertTrue(result.deadLettered > 0)
        // m-1 stays in queue for inspection.
        assertEquals(1, queue.pendingCount())
    }

    @Test
    fun processAll_stateIsIdleWhenDone() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))

        val processor = QueueProcessor(
            queue = queue,
            pushFn = alwaysSucceedPushFn(),
        )
        processor.processAll()
        assertIs<ProcessingState.Idle>(processor.state.value)
    }

    // ── calculateBackoff ────────────────────────────────────────────────

    @Test
    fun calculateBackoff_hasJitter() {
        val processor = QueueProcessor(
            queue = InMemoryMutationQueue(),
            pushFn = alwaysSucceedPushFn(),
            baseBackoffMs = 1_000L,
            maxBackoffMs = 60_000L,
        )
        // With jitter factor (0.5-1.0), backoff for attempt 1 should be in [500, 1000].
        val backoff = processor.calculateBackoff(1)
        assertTrue(backoff in 500..1_000, "Backoff $backoff should be in [500, 1000]")
    }

    @Test
    fun calculateBackoff_exponentialGrowth() {
        val processor = QueueProcessor(
            queue = InMemoryMutationQueue(),
            pushFn = alwaysSucceedPushFn(),
            baseBackoffMs = 1_000L,
            maxBackoffMs = 60_000L,
        )
        // Attempt 3: base * 2^2 = 4000, with jitter → [2000, 4000].
        val backoff = processor.calculateBackoff(3)
        assertTrue(backoff in 2_000..4_000, "Backoff $backoff should be in [2000, 4000]")
    }

    @Test
    fun calculateBackoff_cappedAtMax() {
        val processor = QueueProcessor(
            queue = InMemoryMutationQueue(),
            pushFn = alwaysSucceedPushFn(),
            baseBackoffMs = 1_000L,
            maxBackoffMs = 5_000L,
        )
        // Attempt 10: 1000 * 2^9 = 512000, capped to 5000, jitter → [2500, 5000].
        val backoff = processor.calculateBackoff(10)
        assertTrue(backoff in 2_500..5_000, "Backoff $backoff should be in [2500, 5000]")
    }
}