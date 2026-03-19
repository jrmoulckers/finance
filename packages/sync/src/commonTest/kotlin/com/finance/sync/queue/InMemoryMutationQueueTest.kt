// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.queue

import com.finance.sync.MutationOperation
import com.finance.sync.SyncMutation
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class InMemoryMutationQueueTest {

    private fun mutation(
        id: String = "m-1",
        table: String = "accounts",
        rowId: String = "row-1",
        op: MutationOperation = MutationOperation.INSERT,
        data: Map<String, String?> = mapOf("id" to rowId, "name" to "Test"),
        ts: Instant = Instant.parse("2024-01-01T00:00:00Z"),
    ): SyncMutation = SyncMutation(
        id = id,
        tableName = table,
        operation = op,
        rowData = data,
        timestamp = ts,
    )

    // ── Basic operations ────────────────────────────────────────────────

    @Test
    fun enqueueAndPeekReturnsSameItem() = runTest {
        val queue = InMemoryMutationQueue()
        val m = mutation()
        queue.enqueue(m)
        assertEquals(m, queue.peek())
        assertEquals(1, queue.pendingCount())
    }

    @Test
    fun peekReturnsNullWhenEmpty() = runTest {
        assertNull(InMemoryMutationQueue().peek())
    }

    @Test
    fun dequeueRemovesItem() = runTest {
        val queue = InMemoryMutationQueue()
        val m = mutation()
        queue.enqueue(m)
        queue.dequeue(m.id)
        assertNull(queue.peek())
        assertEquals(0, queue.pendingCount())
    }

    @Test
    fun dequeueNonExistentIdIsNoOp() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation())
        queue.dequeue("non-existent")
        assertEquals(1, queue.pendingCount())
    }

    @Test
    fun fifoOrdering() = runTest {
        val queue = InMemoryMutationQueue()
        val m1 = mutation(id = "m-1", rowId = "row-1")
        val m2 = mutation(id = "m-2", rowId = "row-2")
        val m3 = mutation(id = "m-3", rowId = "row-3")
        queue.enqueue(m1); queue.enqueue(m2); queue.enqueue(m3)
        assertEquals(listOf(m1, m2, m3), queue.allPending())
        assertEquals(m1, queue.peek())
    }

    @Test
    fun allPendingReturnsEmptyListWhenEmpty() = runTest {
        assertTrue(InMemoryMutationQueue().allPending().isEmpty())
    }

    @Test
    fun pendingCountReflectsCurrentState() = runTest {
        val queue = InMemoryMutationQueue()
        assertEquals(0, queue.pendingCount())
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        assertEquals(1, queue.pendingCount())
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        assertEquals(2, queue.pendingCount())
        queue.dequeue("m-1")
        assertEquals(1, queue.pendingCount())
    }

    // ── Deduplication / coalescing ──────────────────────────────────────

    @Test
    fun deduplication_differentTablesAreNotDeduplicated() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", table = "accounts", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", table = "transactions", rowId = "row-1"))
        assertEquals(2, queue.pendingCount())
    }

    @Test
    fun coalesce_insertPlusUpdate_becomesInsertWithMergedData() = runTest {
        val queue = InMemoryMutationQueue()
        val insert = mutation(
            id = "m-1", rowId = "row-1", op = MutationOperation.INSERT,
            data = mapOf("id" to "row-1", "name" to "Original", "amount" to "100"),
        )
        val update = mutation(
            id = "m-2", rowId = "row-1", op = MutationOperation.UPDATE,
            data = mapOf("id" to "row-1", "name" to "Updated"),
            ts = Instant.parse("2024-01-02T00:00:00Z"),
        )
        queue.enqueue(insert)
        queue.enqueue(update)

        assertEquals(1, queue.pendingCount())
        val result = queue.peek()!!
        assertEquals("m-2", result.id)
        assertEquals(MutationOperation.INSERT, result.operation, "Should stay INSERT")
        assertEquals("Updated", result.rowData["name"], "name should be merged from UPDATE")
        assertEquals("100", result.rowData["amount"], "amount should be preserved from INSERT")
        assertEquals(Instant.parse("2024-01-02T00:00:00Z"), result.timestamp)
    }

    @Test
    fun coalesce_insertPlusDelete_removedFromQueue() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1", op = MutationOperation.INSERT))
        queue.enqueue(mutation(id = "m-2", rowId = "row-1", op = MutationOperation.DELETE))
        assertEquals(0, queue.pendingCount(), "INSERT + DELETE should cancel out")
        assertNull(queue.peek())
    }

    @Test
    fun coalesce_updatePlusUpdate_latestWins() = runTest {
        val queue = InMemoryMutationQueue()
        val u1 = mutation(id = "m-1", rowId = "row-1", op = MutationOperation.UPDATE)
        val u2 = mutation(id = "m-2", rowId = "row-1", op = MutationOperation.UPDATE,
            data = mapOf("id" to "row-1", "name" to "Latest"))
        queue.enqueue(u1)
        queue.enqueue(u2)
        assertEquals(1, queue.pendingCount())
        assertEquals(u2, queue.peek())
    }

    @Test
    fun coalesce_updatePlusDelete_becomesDelete() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1", op = MutationOperation.UPDATE))
        val del = mutation(id = "m-2", rowId = "row-1", op = MutationOperation.DELETE)
        queue.enqueue(del)
        assertEquals(1, queue.pendingCount())
        assertEquals(del, queue.peek())
    }

    @Test
    fun coalesce_deletePlusInsert_becomesInsert() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1", op = MutationOperation.DELETE))
        val ins = mutation(id = "m-2", rowId = "row-1", op = MutationOperation.INSERT)
        queue.enqueue(ins)
        assertEquals(1, queue.pendingCount())
        assertEquals(ins, queue.peek())
    }

    @Test
    fun coalescingPreservesFifoOfRemainingItems() = runTest {
        val queue = InMemoryMutationQueue()
        val m1 = mutation(id = "m-1", rowId = "row-1", op = MutationOperation.INSERT)
        val m2 = mutation(id = "m-2", rowId = "row-2", op = MutationOperation.INSERT)
        val m3 = mutation(id = "m-3", rowId = "row-1", op = MutationOperation.UPDATE)
        queue.enqueue(m1); queue.enqueue(m2); queue.enqueue(m3)

        val all = queue.allPending()
        assertEquals(2, all.size)
        // m2 keeps its original position; the coalesced m1+m3 moves to the tail.
        assertEquals(m2, all[0])
        // Coalesced result keeps INSERT operation and uses m3's ID.
        assertEquals("m-3", all[1].id)
        assertEquals(MutationOperation.INSERT, all[1].operation)
    }

    // ── enqueueAll ──────────────────────────────────────────────────────

    @Test
    fun enqueueAll_addsMultipleMutationsAtomically() = runTest {
        val queue = InMemoryMutationQueue()
        val mutations = listOf(
            mutation(id = "m-1", rowId = "row-1"),
            mutation(id = "m-2", rowId = "row-2"),
            mutation(id = "m-3", rowId = "row-3"),
        )
        queue.enqueueAll(mutations)
        assertEquals(3, queue.pendingCount())
        assertEquals(mutations, queue.allPending())
    }

    @Test
    fun enqueueAll_coalescesWithExistingQueue() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1", op = MutationOperation.INSERT))
        queue.enqueueAll(listOf(
            mutation(id = "m-2", rowId = "row-2", op = MutationOperation.INSERT),
            mutation(id = "m-3", rowId = "row-1", op = MutationOperation.DELETE), // cancels m-1
        ))
        assertEquals(1, queue.pendingCount())
        assertEquals("m-2", queue.peek()!!.id)
    }

    @Test
    fun enqueueAll_coalescesWithinBatch() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueueAll(listOf(
            mutation(id = "m-1", rowId = "row-1", op = MutationOperation.INSERT),
            mutation(id = "m-2", rowId = "row-1", op = MutationOperation.UPDATE,
                data = mapOf("id" to "row-1", "name" to "Updated")),
        ))
        assertEquals(1, queue.pendingCount())
        val result = queue.peek()!!
        assertEquals(MutationOperation.INSERT, result.operation)
        assertEquals("Updated", result.rowData["name"])
    }

    // ── peekBatch ───────────────────────────────────────────────────────

    @Test
    fun peekBatch_returnsUpToLimitItems() = runTest {
        val queue = InMemoryMutationQueue()
        for (i in 1..5) {
            queue.enqueue(mutation(id = "m-$i", rowId = "row-$i"))
        }
        val batch = queue.peekBatch(3)
        assertEquals(3, batch.size)
        assertEquals("m-1", batch[0].id)
        assertEquals("m-2", batch[1].id)
        assertEquals("m-3", batch[2].id)
        // Queue is unchanged.
        assertEquals(5, queue.pendingCount())
    }

    @Test
    fun peekBatch_returnsAllWhenLessThanLimit() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        val batch = queue.peekBatch(100)
        assertEquals(1, batch.size)
    }

    @Test
    fun peekBatch_returnsEmptyListWhenEmpty() = runTest {
        assertEquals(emptyList(), InMemoryMutationQueue().peekBatch(10))
    }

    // ── acknowledge ─────────────────────────────────────────────────────

    @Test
    fun acknowledge_removesMultipleMutations() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-3", rowId = "row-3"))
        queue.acknowledge(listOf("m-1", "m-3"))
        assertEquals(1, queue.pendingCount())
        assertEquals("m-2", queue.peek()!!.id)
    }

    @Test
    fun acknowledge_ignoresUnknownIds() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.acknowledge(listOf("m-1", "non-existent"))
        assertEquals(0, queue.pendingCount())
    }

    @Test
    fun acknowledge_clearsRetryCount() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.markFailed(listOf("m-1"))
        assertEquals(1, queue.getRetryCount("m-1"))
        queue.acknowledge(listOf("m-1"))
        assertEquals(0, queue.getRetryCount("m-1"))
    }

    // ── Retry / dead-letter tracking ────────────────────────────────────

    @Test
    fun markFailed_incrementsRetryCount() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        assertEquals(0, queue.getRetryCount("m-1"))
        queue.markFailed(listOf("m-1"))
        assertEquals(1, queue.getRetryCount("m-1"))
        queue.markFailed(listOf("m-1"))
        assertEquals(2, queue.getRetryCount("m-1"))
    }

    @Test
    fun markFailed_ignoresUnknownIds() = runTest {
        val queue = InMemoryMutationQueue()
        queue.markFailed(listOf("non-existent")) // Should not throw.
        assertEquals(0, queue.getRetryCount("non-existent"))
    }

    @Test
    fun getDeadLetterMutations_returnsOnlyExceeded() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        // m-1 fails 3 times, m-2 fails once.
        repeat(3) { queue.markFailed(listOf("m-1")) }
        queue.markFailed(listOf("m-2"))

        val dead = queue.getDeadLetterMutations(maxRetries = 3)
        assertEquals(1, dead.size)
        assertEquals("m-1", dead[0].id)
    }

    @Test
    fun getRetryCount_returnsZeroForUnknownMutation() = runTest {
        assertEquals(0, InMemoryMutationQueue().getRetryCount("unknown"))
    }

    // ── getMutationsForRecord ───────────────────────────────────────────

    @Test
    fun getMutationsForRecord_findsMatchingMutations() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", table = "accounts", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", table = "accounts", rowId = "row-2"))
        queue.enqueue(mutation(id = "m-3", table = "transactions", rowId = "row-1"))

        val results = queue.getMutationsForRecord("accounts", "row-1")
        assertEquals(1, results.size)
        assertEquals("m-1", results[0].id)
    }

    @Test
    fun getMutationsForRecord_returnsEmptyWhenNoMatch() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", table = "accounts", rowId = "row-1"))
        assertTrue(queue.getMutationsForRecord("budgets", "row-1").isEmpty())
    }

    // ── clear ───────────────────────────────────────────────────────────

    @Test
    fun clear_removesAllMutationsAndRetryState() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.markFailed(listOf("m-1"))
        queue.clear()
        assertEquals(0, queue.pendingCount())
        assertNull(queue.peek())
        assertTrue(queue.allPending().isEmpty())
        assertEquals(0, queue.getRetryCount("m-1"))
    }

    // ── Reactive flows ──────────────────────────────────────────────────

    @Test
    fun pendingCountFlow_emitsCurrentCount() = runTest {
        val queue = InMemoryMutationQueue()
        assertEquals(0, queue.pendingCountFlow.first())
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        assertEquals(1, queue.pendingCountFlow.first())
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        assertEquals(2, queue.pendingCountFlow.first())
        queue.dequeue("m-1")
        assertEquals(1, queue.pendingCountFlow.first())
    }

    @Test
    fun hasPendingMutations_reflectsQueueState() = runTest {
        val queue = InMemoryMutationQueue()
        assertFalse(queue.hasPendingMutations.first())
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        assertTrue(queue.hasPendingMutations.first())
        queue.dequeue("m-1")
        assertFalse(queue.hasPendingMutations.first())
    }

    @Test
    fun pendingCountFlow_updatesOnClear() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        assertEquals(2, queue.pendingCountFlow.first())
        queue.clear()
        assertEquals(0, queue.pendingCountFlow.first())
    }

    @Test
    fun pendingCountFlow_updatesOnAcknowledge() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", rowId = "row-2"))
        queue.acknowledge(listOf("m-1"))
        assertEquals(1, queue.pendingCountFlow.first())
    }

    // ── Edge cases ──────────────────────────────────────────────────────

    @Test
    fun coalesce_insertDeleteInsert_resultsInInsert() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1", op = MutationOperation.INSERT))
        queue.enqueue(mutation(id = "m-2", rowId = "row-1", op = MutationOperation.DELETE))
        // Queue is now empty (INSERT + DELETE = no-op).
        assertEquals(0, queue.pendingCount())
        // Now re-insert.
        val reInsert = mutation(id = "m-3", rowId = "row-1", op = MutationOperation.INSERT)
        queue.enqueue(reInsert)
        assertEquals(1, queue.pendingCount())
        assertEquals(reInsert, queue.peek())
    }

    @Test
    fun dequeue_clearsRetryCount() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1"))
        queue.markFailed(listOf("m-1"))
        assertEquals(1, queue.getRetryCount("m-1"))
        queue.dequeue("m-1")
        assertEquals(0, queue.getRetryCount("m-1"))
    }

    @Test
    fun coalesce_resetsRetryCountOfOldMutation() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", rowId = "row-1", op = MutationOperation.UPDATE))
        queue.markFailed(listOf("m-1"))
        assertEquals(1, queue.getRetryCount("m-1"))
        // Coalescing replaces m-1 with m-2.
        queue.enqueue(mutation(id = "m-2", rowId = "row-1", op = MutationOperation.UPDATE))
        assertEquals(0, queue.getRetryCount("m-1"), "Old retry count should be cleared")
        assertEquals(0, queue.getRetryCount("m-2"), "New mutation starts fresh")
    }
}