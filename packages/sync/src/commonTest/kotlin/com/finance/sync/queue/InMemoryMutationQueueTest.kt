package com.finance.sync.queue

import com.finance.sync.MutationOperation
import com.finance.sync.SyncMutation
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class InMemoryMutationQueueTest {

    private fun mutation(
        id: String = "m-1",
        table: String = "accounts",
        rowId: String = "row-1",
        op: MutationOperation = MutationOperation.INSERT,
    ): SyncMutation = SyncMutation(
        id = id,
        tableName = table,
        operation = op,
        rowData = mapOf("id" to rowId, "name" to "Test"),
        timestamp = Instant.parse("2024-01-01T00:00:00Z"),
    )

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
    fun deduplication_sameEntityKeyReplacesOlder() = runTest {
        val queue = InMemoryMutationQueue()
        val older = mutation(id = "m-1", rowId = "row-1", op = MutationOperation.INSERT)
        val newer = mutation(id = "m-2", rowId = "row-1", op = MutationOperation.UPDATE)
        queue.enqueue(older); queue.enqueue(newer)
        assertEquals(1, queue.pendingCount())
        assertEquals(newer, queue.peek())
    }

    @Test
    fun deduplication_differentTablesAreNotDeduplicated() = runTest {
        val queue = InMemoryMutationQueue()
        queue.enqueue(mutation(id = "m-1", table = "accounts", rowId = "row-1"))
        queue.enqueue(mutation(id = "m-2", table = "transactions", rowId = "row-1"))
        assertEquals(2, queue.pendingCount())
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

    @Test
    fun deduplicationPreservesFifoOfRemainingItems() = runTest {
        val queue = InMemoryMutationQueue()
        val m1 = mutation(id = "m-1", rowId = "row-1")
        val m2 = mutation(id = "m-2", rowId = "row-2")
        val m3 = mutation(id = "m-3", rowId = "row-1", op = MutationOperation.UPDATE)
        queue.enqueue(m1); queue.enqueue(m2); queue.enqueue(m3)
        val all = queue.allPending()
        assertEquals(2, all.size)
        assertEquals(m2, all[0])
        assertEquals(m3, all[1])
    }
}