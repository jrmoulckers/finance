// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.delta

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DeltaSyncManagerTest {

    private fun change(
        table: String = "accounts",
        seq: Long,
        rowId: String = "row-1",
        checksum: Long? = null,
    ): SyncChange {
        val rowData = buildMap {
            put("id", rowId)
            put("name", "Test")
            if (checksum != null) put("__checksum", checksum.toString())
        }
        return SyncChange(
            tableName = table,
            operation = MutationOperation.UPDATE,
            rowData = rowData,
            serverTimestamp = Instant.parse("2024-01-01T00:00:00Z"),
            sequenceNumber = seq,
        )
    }

    @Test
    fun firstSyncAcceptsAnyStartingSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)
        val result = manager.processChanges(listOf(
            change(seq = 1), change(seq = 2, rowId = "r2"), change(seq = 3, rowId = "r3"),
        ))
        val r = result["accounts"]
        assertIs<DeltaSyncResult.Success>(r)
        assertEquals(3, r.appliedCount)
        assertEquals(3L, tracker.getLastSequence("accounts"))
    }

    @Test
    fun subsequentSyncContinuesFromLastSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 5)
        val manager = DeltaSyncManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 6, rowId = "r6"), change(seq = 7, rowId = "r7")))
        assertIs<DeltaSyncResult.Success>(result["accounts"])
        assertEquals(7L, tracker.getLastSequence("accounts"))
    }

    @Test
    fun sequenceGapDetectedBetweenBatches() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 5)
        val manager = DeltaSyncManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 8, rowId = "r8")))
        val r = result["accounts"]
        assertIs<DeltaSyncResult.SequenceGap>(r)
        assertEquals(6L, r.expectedSequence)
        assertEquals(8L, r.actualSequence)
        assertNull(tracker.getLastSequence("accounts"))
    }

    @Test
    fun sequenceGapDetectedWithinBatch() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)
        val result = manager.processChanges(listOf(
            change(seq = 1, rowId = "r1"), change(seq = 2, rowId = "r2"), change(seq = 4, rowId = "r4"),
        ))
        val r = result["accounts"]
        assertIs<DeltaSyncResult.SequenceGap>(r)
        assertEquals(3L, r.expectedSequence)
        assertEquals(4L, r.actualSequence)
    }

    @Test
    fun multipleTablesProcessedIndependently() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)
        val result = manager.processChanges(listOf(
            change(table = "accounts", seq = 1, rowId = "a1"),
            change(table = "accounts", seq = 2, rowId = "a2"),
            change(table = "transactions", seq = 1, rowId = "t1"),
        ))
        assertIs<DeltaSyncResult.Success>(result["accounts"])
        assertIs<DeltaSyncResult.Success>(result["transactions"])
        assertEquals(2L, tracker.getLastSequence("accounts"))
        assertEquals(1L, tracker.getLastSequence("transactions"))
    }

    @Test
    fun validChecksumPasses() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)
        val rowData = mapOf("id" to "row-1", "name" to "Test")
        val checksum = SyncChecksum.computeRowChecksum(rowData)
        val result = manager.processChanges(listOf(change(seq = 1, checksum = checksum)))
        assertIs<DeltaSyncResult.Success>(result["accounts"])
    }

    @Test
    fun invalidChecksumDetected() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 1, checksum = 999999L)))
        val r = result["accounts"]
        assertIs<DeltaSyncResult.ChecksumMismatch>(r)
        assertTrue(r.failedRowIds.contains("row-1"))
    }

    @Test
    fun changesWithoutChecksumFieldAreNotValidated() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 1)))
        assertIs<DeltaSyncResult.Success>(result["accounts"])
    }

    @Test
    fun requestFullResyncClearsTableSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 10)
        val manager = DeltaSyncManager(tracker)
        manager.requestFullResync("accounts")
        assertNull(tracker.getLastSequence("accounts"))
    }

    @Test
    fun requestFullResyncAllClearsAllSequences() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 10)
        tracker.setLastSequence("transactions", 20)
        val manager = DeltaSyncManager(tracker)
        manager.requestFullResyncAll()
        assertNull(tracker.getLastSequence("accounts"))
        assertNull(tracker.getLastSequence("transactions"))
    }

    @Test
    fun emptyChangesListReturnsEmptyMap() = runTest {
        val result = DeltaSyncManager(InMemorySequenceTracker()).processChanges(emptyList())
        assertTrue(result.isEmpty())
    }

    @Test
    fun getLastSequenceReturnsTrackedValue() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 42)
        val manager = DeltaSyncManager(tracker)
        assertEquals(42L, manager.getLastSequence("accounts"))
        assertNull(manager.getLastSequence("transactions"))
    }

    @Test
    fun checksumIsDeterministic() {
        val data = mapOf("id" to "1", "name" to "Test", "amount" to "5000")
        assertEquals(SyncChecksum.computeRowChecksum(data), SyncChecksum.computeRowChecksum(data))
    }

    @Test
    fun checksumIsKeyOrderIndependent() {
        val d1 = mapOf("name" to "Test", "id" to "1", "amount" to "5000")
        val d2 = mapOf("amount" to "5000", "id" to "1", "name" to "Test")
        assertEquals(SyncChecksum.computeRowChecksum(d1), SyncChecksum.computeRowChecksum(d2))
    }

    @Test
    fun checksumDiffersForDifferentData() {
        val d1 = mapOf("id" to "1", "name" to "Alice")
        val d2 = mapOf("id" to "1", "name" to "Bob")
        assertTrue(SyncChecksum.computeRowChecksum(d1) != SyncChecksum.computeRowChecksum(d2))
    }

    @Test
    fun checksumHandlesNullValues() {
        val data = mapOf("id" to "1", "note" to null)
        val checksum = SyncChecksum.computeRowChecksum(data)
        assertTrue(checksum >= 0L)
        assertTrue(SyncChecksum.verifyRowChecksum(data, checksum))
    }
}