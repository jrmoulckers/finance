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

    // -- Helpers --

    private fun change(
        table: String = "accounts",
        seq: Long,
        rowId: String = "row-1",
        checksum: Long? = null,
        extraData: Map<String, String?> = emptyMap(),
    ): SyncChange {
        val rowData = buildMap {
            put("id", rowId)
            put("name", "Test")
            putAll(extraData)
            if (checksum != null) {
                put("__checksum", checksum.toString())
            }
        }
        return SyncChange(
            tableName = table,
            operation = MutationOperation.UPDATE,
            rowData = rowData,
            serverTimestamp = Instant.parse("2024-01-01T00:00:00Z"),
            sequenceNumber = seq,
        )
    }

    // -- Sequence tracking tests --

    @Test
    fun firstSyncAcceptsAnyStartingSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)

        val result = manager.processChanges(listOf(
            change(seq = 1),
            change(seq = 2, rowId = "row-2"),
            change(seq = 3, rowId = "row-3"),
        ))

        val accountsResult = result["accounts"]
        assertIs<DeltaSyncResult.Success>(accountsResult)
        assertEquals(3, accountsResult.appliedCount)
        assertEquals(3L, tracker.getLastSequence("accounts"))
    }

    @Test
    fun subsequentSyncContinuesFromLastSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 5)
        val manager = DeltaSyncManager(tracker)

        val result = manager.processChanges(listOf(
            change(seq = 6, rowId = "row-6"),
            change(seq = 7, rowId = "row-7"),
        ))

        val accountsResult = result["accounts"]
        assertIs<DeltaSyncResult.Success>(accountsResult)
        assertEquals(7L, tracker.getLastSequence("accounts"))
    }

    @Test
    fun sequenceGapDetectedBetweenBatches() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 5)
        val manager = DeltaSyncManager(tracker)

        // We expect seq 6, but get seq 8 → gap
        val result = manager.processChanges(listOf(
            change(seq = 8, rowId = "row-8"),
        ))

        val accountsResult = result["accounts"]
        assertIs<DeltaSyncResult.SequenceGap>(accountsResult)
        assertEquals(6L, accountsResult.expectedSequence)
        assertEquals(8L, accountsResult.actualSequence)

        // Tracker should be reset for this table
        assertNull(tracker.getLastSequence("accounts"))
    }

    @Test
    fun sequenceGapDetectedWithinBatch() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)

        // Intra-batch gap: 1, 2, 4 (missing 3)
        val result = manager.processChanges(listOf(
            change(seq = 1, rowId = "row-1"),
            change(seq = 2, rowId = "row-2"),
            change(seq = 4, rowId = "row-4"),
        ))

        val accountsResult = result["accounts"]
        assertIs<DeltaSyncResult.SequenceGap>(accountsResult)
        assertEquals(3L, accountsResult.expectedSequence)
        assertEquals(4L, accountsResult.actualSequence)
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

    // -- Checksum tests --

    @Test
    fun validChecksumPasses() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)

        val rowData = mapOf("id" to "row-1", "name" to "Test")
        val checksum = SyncChecksum.computeRowChecksum(rowData)

        val result = manager.processChanges(listOf(
            change(seq = 1, checksum = checksum),
        ))

        assertIs<DeltaSyncResult.Success>(result["accounts"])
    }

    @Test
    fun invalidChecksumDetected() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)

        val result = manager.processChanges(listOf(
            change(seq = 1, checksum = 999999L), // wrong checksum
        ))

        val accountsResult = result["accounts"]
        assertIs<DeltaSyncResult.ChecksumMismatch>(accountsResult)
        assertTrue(accountsResult.failedRowIds.contains("row-1"))
    }

    @Test
    fun changesWithoutChecksumFieldAreNotValidated() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)

        // No __checksum field → should pass without checksum validation.
        val result = manager.processChanges(listOf(
            change(seq = 1),
        ))

        assertIs<DeltaSyncResult.Success>(result["accounts"])
    }

    // -- Resync tests --

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
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(tracker)

        val result = manager.processChanges(emptyList())

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

    // -- Checksum utility tests --

    @Test
    fun checksumIsDeterministic() {
        val data = mapOf("id" to "1", "name" to "Test", "amount" to "5000")

        val checksum1 = SyncChecksum.computeRowChecksum(data)
        val checksum2 = SyncChecksum.computeRowChecksum(data)

        assertEquals(checksum1, checksum2)
    }

    @Test
    fun checksumIsKeyOrderIndependent() {
        val data1 = mapOf("name" to "Test", "id" to "1", "amount" to "5000")
        val data2 = mapOf("amount" to "5000", "id" to "1", "name" to "Test")

        assertEquals(
            SyncChecksum.computeRowChecksum(data1),
            SyncChecksum.computeRowChecksum(data2),
            "Checksum should be independent of key insertion order",
        )
    }

    @Test
    fun checksumDiffersForDifferentData() {
        val data1 = mapOf("id" to "1", "name" to "Alice")
        val data2 = mapOf("id" to "1", "name" to "Bob")

        assertTrue(
            SyncChecksum.computeRowChecksum(data1) != SyncChecksum.computeRowChecksum(data2),
            "Different data should produce different checksums",
        )
    }

    @Test
    fun checksumHandlesNullValues() {
        val data = mapOf("id" to "1", "note" to null)
        val checksum = SyncChecksum.computeRowChecksum(data)
        assertTrue(checksum > 0 || checksum == 0L, "Checksum should be a valid non-negative long")
        assertTrue(SyncChecksum.verifyRowChecksum(data, checksum))
    }
}
