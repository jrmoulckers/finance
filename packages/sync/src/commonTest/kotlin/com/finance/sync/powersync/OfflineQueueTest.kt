// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.powersync

import com.finance.sync.MutationOperation
import com.finance.sync.SyncMutation
import com.finance.sync.queue.InMemoryMutationQueue
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Offline queue tests covering enqueue, FIFO ordering, persistence simulation,
 * replay on reconnection, deduplication, and queue size limits.
 *
 * Validates that the [InMemoryMutationQueue] correctly manages pending
 * mutations for offline-first sync behaviour.
 *
 * Addresses #1388.
 */
class OfflineQueueTest {

    private lateinit var queue: InMemoryMutationQueue

    @BeforeTest
    fun setUp() {
        queue = InMemoryMutationQueue()
    }

    // ── Helper ──────────────────────────────────────────────────

    private fun mutation(
        id: String = "m-1",
        table: String = "transactions",
        rowId: String = "row-1",
        op: MutationOperation = MutationOperation.INSERT,
        data: Map<String, String?> = mapOf("id" to rowId, "name" to "Test"),
        ts: Instant = Instant.parse("2024-06-01T00:00:00Z"),
    ): SyncMutation = SyncMutation(
        id = id,
        tableName = table,
        operation = op,
        rowData = data,
        timestamp = ts,
    )

    // ── Enqueue operations while offline ────────────────────────

    @Test
    fun test_enqueue_operations_while_offline() = runTest {
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-3", rowId = "row-3"))

        assertEquals(3, queue.pendingCount(), "Should have 3 pending mutations")
        assertTrue(queue.hasPendingMutations.first(), "Should report pending mutations")
    }

    @Test
    fun test_enqueue_preserves_mutation_data() = runTest {
        val m = mutation(
            id = "m-data",
            table = "accounts",
            rowId = "acc-1",
            data = mapOf("id" to "acc-1", "name" to "Checking", "balance_cents" to "500000"),
        )
        queue.enqueue(m)

        val peeked = queue.peek()
        assertNotNull(peeked)
        assertEquals("m-data", peeked.id)
        assertEquals("accounts", peeked.tableName)
        assertEquals("Checking", peeked.rowData["name"])
        assertEquals("500000", peeked.rowData["balance_cents"])
    }

    // ── Queue ordering (FIFO) ───────────────────────────────────

    @Test
    fun test_queue_ordering_fifo() = runTest {
        val m1 = mutation(id = "m-1", rowId = "row-1")
        val m2 = mutation(id = "m-2", rowId = "row-2")
        val m3 = mutation(id = "m-3", rowId = "row-3")
        val m4 = mutation(id = "m-4", rowId = "row-4")

        queue.enqueue(m1)
        queue.enqueue(m2)
        queue.enqueue(m3)
        queue.enqueue(m4)

        val all = queue.allPending()
        assertEquals(4, all.size)
        assertEquals("m-1", all[0].id, "First enqueued should be first in list")
        assertEquals("m-2", all[1].id)
        assertEquals("m-3", all[2].id)
        assertEquals("m-4", all[3].id, "Last enqueued should be last in list")
    }

    @Test
    fun test_peek_returns_oldest_item() = runTest {
        queue.enqueue(mutation(id = "m-oldest", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-newest", rowId = "row-2"))

        val head = queue.peek()
        assertNotNull(head)
        assertEquals("m-oldest", head.id, "Peek should return the oldest (first) mutation")
    }

    // ── Queue persistence across app restarts ───────────────────

    @Test
    fun test_queue_persistence_state_survives_operations() = runTest {
        // Simulate pre-restart state: enqueue items
        queue.enqueue(mutation(id = "m-persist-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-persist-2", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-persist-3", rowId = "row-3"))

        // Dequeue one (simulating partial processing before restart)
        queue.dequeue("m-persist-1")

        // Verify remaining state is intact (simulates restart recovery)
        assertEquals(2, queue.pendingCount())

        val remaining = queue.allPending()
        assertEquals("m-persist-2", remaining[0].id)
        assertEquals("m-persist-3", remaining[1].id)
    }

    @Test
    fun test_queue_retry_state_persists_across_failures() = runTest {
        queue.enqueue(mutation(id = "m-retry", rowId = "row-1"))

        // Simulate multiple failures
        queue.markFailed(listOf("m-retry"))
        queue.markFailed(listOf("m-retry"))

        assertEquals(2, queue.getRetryCount("m-retry"), "Retry count should persist")

        // Item should still be in queue
        val item = queue.peek()
        assertNotNull(item)
        assertEquals("m-retry", item.id)
    }

    // ── Queue replay on reconnection ────────────────────────────

    @Test
    fun test_queue_replay_via_peek_batch() = runTest {
        // Queue up mutations while "offline"
        repeat(10) { i ->
            queue.enqueue(mutation(id = "m-replay-$i", rowId = "row-$i"))
        }

        // Simulate reconnection: peek a batch for sending
        val batch = queue.peekBatch(5)
        assertEquals(5, batch.size, "Should return batch of 5")

        // Simulate successful push: acknowledge the batch
        queue.acknowledge(batch.map { it.id })
        assertEquals(5, queue.pendingCount(), "5 mutations should remain")

        // Second batch
        val batch2 = queue.peekBatch(5)
        assertEquals(5, batch2.size)
        queue.acknowledge(batch2.map { it.id })
        assertEquals(0, queue.pendingCount(), "Queue should be fully drained")
    }

    @Test
    fun test_queue_replay_preserves_order_after_partial_ack() = runTest {
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-3", rowId = "row-3"))

        // Acknowledge only the first item
        queue.acknowledge(listOf("m-1"))

        val remaining = queue.allPending()
        assertEquals(2, remaining.size)
        assertEquals("m-2", remaining[0].id, "FIFO order should be maintained after partial ack")
        assertEquals("m-3", remaining[1].id)
    }

    // ── Queue deduplication ─────────────────────────────────────

    @Test
    fun test_queue_deduplication_same_record_edited_multiple_times() = runTest {
        // Insert then update the same record
        queue.enqueue(
            mutation(
                id = "m-1",
                rowId = "row-1",
                op = MutationOperation.INSERT,
                data = mapOf("id" to "row-1", "name" to "Original", "amount_cents" to "1000"),
            ),
        )
        queue.enqueue(
            mutation(
                id = "m-2",
                rowId = "row-1",
                op = MutationOperation.UPDATE,
                data = mapOf("id" to "row-1", "name" to "Updated"),
                ts = Instant.parse("2024-06-02T00:00:00Z"),
            ),
        )

        assertEquals(1, queue.pendingCount(), "Should coalesce INSERT + UPDATE into single mutation")

        val coalesced = queue.peek()
        assertNotNull(coalesced)
        assertEquals(MutationOperation.INSERT, coalesced.operation, "Coalesced op should stay INSERT")
        assertEquals("Updated", coalesced.rowData["name"], "Should have updated name")
        assertEquals("1000", coalesced.rowData["amount_cents"], "Should preserve unmodified fields")
    }

    @Test
    fun test_queue_deduplication_insert_then_delete_cancels_out() = runTest {
        queue.enqueue(mutation(id = "m-1", rowId = "row-1", op = MutationOperation.INSERT))
        queue.enqueue(mutation(id = "m-2", rowId = "row-1", op = MutationOperation.DELETE))

        assertEquals(0, queue.pendingCount(), "INSERT + DELETE should cancel out")
        assertNull(queue.peek(), "Queue should be empty")
    }

    @Test
    fun test_queue_deduplication_update_then_update_keeps_latest() = runTest {
        queue.enqueue(
            mutation(
                id = "m-1",
                rowId = "row-1",
                op = MutationOperation.UPDATE,
                data = mapOf("id" to "row-1", "name" to "First Update"),
            ),
        )
        queue.enqueue(
            mutation(
                id = "m-2",
                rowId = "row-1",
                op = MutationOperation.UPDATE,
                data = mapOf("id" to "row-1", "name" to "Second Update"),
            ),
        )

        assertEquals(1, queue.pendingCount(), "Two UPDATEs to same record should coalesce")
        val result = queue.peek()
        assertNotNull(result)
        assertEquals("Second Update", result.rowData["name"])
    }

    @Test
    fun test_queue_deduplication_different_tables_are_independent() = runTest {
        queue.enqueue(mutation(id = "m-1", table = "accounts", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", table = "transactions", rowId = "row-1"))

        assertEquals(2, queue.pendingCount(), "Same rowId in different tables should NOT coalesce")
    }

    // ── Queue size limits and overflow behavior ─────────────────

    @Test
    fun test_queue_handles_large_number_of_mutations() = runTest {
        val count = 500
        repeat(count) { i ->
            queue.enqueue(mutation(id = "m-$i", rowId = "row-$i"))
        }

        assertEquals(count, queue.pendingCount(), "Queue should hold all $count mutations")

        val all = queue.allPending()
        assertEquals(count, all.size)

        // Verify FIFO order is maintained even with many items
        assertEquals("m-0", all.first().id)
        assertEquals("m-${count - 1}", all.last().id)
    }

    @Test
    fun test_queue_dead_letter_on_max_retries() = runTest {
        queue.enqueue(mutation(id = "m-dead", rowId = "row-1"))

        // Fail the mutation 5 times
        repeat(5) { queue.markFailed(listOf("m-dead")) }

        val deadLetters = queue.getDeadLetterMutations(maxRetries = 5)
        assertEquals(1, deadLetters.size, "Mutation exceeding max retries should be in dead letter")
        assertEquals("m-dead", deadLetters[0].id)
    }

    @Test
    fun test_queue_below_max_retries_not_dead_letter() = runTest {
        queue.enqueue(mutation(id = "m-alive", rowId = "row-1"))

        repeat(2) { queue.markFailed(listOf("m-alive")) }

        val deadLetters = queue.getDeadLetterMutations(maxRetries = 5)
        assertEquals(0, deadLetters.size, "Below-threshold mutation should not be in dead letter")
    }

    // ── Clear ───────────────────────────────────────────────────

    @Test
    fun test_queue_clear_removes_all_state() = runTest {
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.markFailed(listOf("m-1"))

        queue.clear()

        assertEquals(0, queue.pendingCount())
        assertNull(queue.peek())
        assertFalse(queue.hasPendingMutations.first())
        assertEquals(0, queue.getRetryCount("m-1"), "Retry state should be cleared")
    }

    // ── Reactive flows ──────────────────────────────────────────

    @Test
    fun test_pending_count_flow_updates_on_mutations() = runTest {
        assertEquals(0, queue.pendingCountFlow.first())

        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        assertEquals(1, queue.pendingCountFlow.first())

        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        assertEquals(2, queue.pendingCountFlow.first())

        queue.dequeue("m-1")
        assertEquals(1, queue.pendingCountFlow.first())

        queue.clear()
        assertEquals(0, queue.pendingCountFlow.first())
    }

    // ── enqueueAll batch operations ─────────────────────────────

    @Test
    fun test_enqueue_all_batch_with_coalescing() = runTest {
        queue.enqueue(mutation(id = "m-existing", rowId = "row-1", op = MutationOperation.INSERT))

        queue.enqueueAll(
            listOf(
                mutation(id = "m-new-1", rowId = "row-2", op = MutationOperation.INSERT),
                mutation(id = "m-update-1", rowId = "row-1", op = MutationOperation.DELETE),
            ),
        )

        // INSERT + DELETE for row-1 should cancel out
        assertEquals(1, queue.pendingCount(), "Batch enqueue should coalesce with existing")
        assertEquals("m-new-1", queue.peek()!!.id)
    }
}
