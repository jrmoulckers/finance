// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.delta

import com.finance.sync.MutationOperation
import com.finance.sync.PullResult
import com.finance.sync.PushResult
import com.finance.sync.SyncChange
import com.finance.sync.SyncConfig
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.SyncStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A stub [SyncProvider] for unit-testing [DeltaSyncManager] without
 * network I/O. Allows tests to configure responses for pull and push.
 */
private class StubSyncProvider : SyncProvider {

    /** Responses to return from successive [pullChanges] calls. */
    val pullResponses = ArrayDeque<PullResult>()

    /** Accumulates mutations received via [pushMutations]. */
    val pushedMutations = mutableListOf<SyncMutation>()

    /** Response to return from [pushMutations]. */
    var pushResponse: PushResult = PushResult(succeeded = emptyList(), failed = emptyList())

    override suspend fun initialize(config: SyncConfig) {}
    override suspend fun push(mutations: List<SyncMutation>): Result<Unit> = Result.success(Unit)
    override fun pull(): Flow<List<SyncChange>> = emptyFlow()
    override fun getStatus(): Flow<SyncStatus> = emptyFlow()

    override suspend fun pullChanges(since: Map<String, Long>): PullResult {
        return pullResponses.removeFirstOrNull()
            ?: PullResult(changes = emptyList(), newVersions = since, hasMore = false)
    }

    override suspend fun pushMutations(mutations: List<SyncMutation>): PushResult {
        pushedMutations.addAll(mutations)
        return pushResponse.copy(
            succeeded = if (pushResponse.succeeded.isEmpty()) {
                mutations.map { it.id }
            } else {
                pushResponse.succeeded
            },
        )
    }
}

/** Default [SyncConfig] for tests. */
private val TEST_CONFIG = SyncConfig(
    endpoint = "https://test.powersync.dev",
    databaseName = "test.db",
    batchSize = 2,
)

class DeltaSyncManagerTest {

    private fun change(
        table: String = "accounts",
        seq: Long,
        rowId: String = "row-1",
        checksum: Long? = null,
        syncVersion: Long = 0L,
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
            syncVersion = syncVersion,
        )
    }

    private fun mutation(
        id: String = "mut-1",
        table: String = "accounts",
        recordId: String = "row-1",
        operation: MutationOperation = MutationOperation.UPDATE,
    ): SyncMutation = SyncMutation(
        id = id,
        tableName = table,
        operation = operation,
        rowData = mapOf("id" to recordId, "name" to "Local"),
        timestamp = Instant.parse("2024-01-01T00:00:00Z"),
        recordId = recordId,
    )

    private fun createManager(
        tracker: SequenceTracker = InMemorySequenceTracker(),
        provider: SyncProvider = StubSyncProvider(),
    ): DeltaSyncManager = DeltaSyncManager(provider, tracker, TEST_CONFIG)

    // ── Sequence validation tests (processChanges) ──────────────

    @Test
    fun firstSyncAcceptsAnyStartingSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = createManager(tracker)
        val result = manager.processChanges(listOf(
            change(seq = 1), change(seq = 2, rowId = "r2"), change(seq = 3, rowId = "r3"),
        ))
        val r = result["accounts"]
        assertIs<ChangeValidationResult.Success>(r)
        assertEquals(3, r.appliedCount)
        assertEquals(3L, tracker.getLastSequence("accounts"))
    }

    @Test
    fun subsequentSyncContinuesFromLastSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 5)
        val manager = createManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 6, rowId = "r6"), change(seq = 7, rowId = "r7")))
        assertIs<ChangeValidationResult.Success>(result["accounts"])
        assertEquals(7L, tracker.getLastSequence("accounts"))
    }

    @Test
    fun sequenceGapDetectedBetweenBatches() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 5)
        val manager = createManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 8, rowId = "r8")))
        val r = result["accounts"]
        assertIs<ChangeValidationResult.SequenceGap>(r)
        assertEquals(6L, r.expectedSequence)
        assertEquals(8L, r.actualSequence)
        assertNull(tracker.getLastSequence("accounts"))
    }

    @Test
    fun sequenceGapDetectedWithinBatch() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = createManager(tracker)
        val result = manager.processChanges(listOf(
            change(seq = 1, rowId = "r1"), change(seq = 2, rowId = "r2"), change(seq = 4, rowId = "r4"),
        ))
        val r = result["accounts"]
        assertIs<ChangeValidationResult.SequenceGap>(r)
        assertEquals(3L, r.expectedSequence)
        assertEquals(4L, r.actualSequence)
    }

    @Test
    fun multipleTablesProcessedIndependently() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = createManager(tracker)
        val result = manager.processChanges(listOf(
            change(table = "accounts", seq = 1, rowId = "a1"),
            change(table = "accounts", seq = 2, rowId = "a2"),
            change(table = "transactions", seq = 1, rowId = "t1"),
        ))
        assertIs<ChangeValidationResult.Success>(result["accounts"])
        assertIs<ChangeValidationResult.Success>(result["transactions"])
        assertEquals(2L, tracker.getLastSequence("accounts"))
        assertEquals(1L, tracker.getLastSequence("transactions"))
    }

    @Test
    fun validChecksumPasses() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = createManager(tracker)
        val rowData = mapOf("id" to "row-1", "name" to "Test")
        val checksum = SyncChecksum.computeRowChecksum(rowData)
        val result = manager.processChanges(listOf(change(seq = 1, checksum = checksum)))
        assertIs<ChangeValidationResult.Success>(result["accounts"])
    }

    @Test
    fun invalidChecksumDetected() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = createManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 1, checksum = 999999L)))
        val r = result["accounts"]
        assertIs<ChangeValidationResult.ChecksumMismatch>(r)
        assertTrue(r.failedRowIds.contains("row-1"))
    }

    @Test
    fun changesWithoutChecksumFieldAreNotValidated() = runTest {
        val tracker = InMemorySequenceTracker()
        val manager = createManager(tracker)
        val result = manager.processChanges(listOf(change(seq = 1)))
        assertIs<ChangeValidationResult.Success>(result["accounts"])
    }

    @Test
    fun requestFullResyncClearsTableSequence() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 10)
        val manager = createManager(tracker)
        manager.requestFullResync("accounts")
        assertNull(tracker.getLastSequence("accounts"))
    }

    @Test
    fun requestFullResyncAllClearsAllSequences() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 10)
        tracker.setLastSequence("transactions", 20)
        val manager = createManager(tracker)
        manager.requestFullResyncAll()
        assertNull(tracker.getLastSequence("accounts"))
        assertNull(tracker.getLastSequence("transactions"))
    }

    @Test
    fun emptyChangesListReturnsEmptyMap() = runTest {
        val result = createManager().processChanges(emptyList())
        assertTrue(result.isEmpty())
    }

    @Test
    fun getLastSequenceReturnsTrackedValue() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 42)
        val manager = createManager(tracker)
        assertEquals(42L, manager.getLastSequence("accounts"))
        assertNull(manager.getLastSequence("transactions"))
    }

    // ── SyncChecksum tests ──────────────────────────────────────

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

    // ── Hex checksum API ────────────────────────────────────────

    @Test
    fun computeForRecordReturnsHexString() {
        val data = mapOf("id" to "1", "name" to "Test")
        val hex = SyncChecksum.computeForRecord(data)
        assertEquals(8, hex.length, "Hex checksum should be 8 characters")
        assertTrue(hex.all { it in '0'..'9' || it in 'a'..'f' }, "Should be lowercase hex")
    }

    @Test
    fun computeForChangesIsDeterministic() {
        val changes = listOf(
            change(seq = 1, rowId = "r1"),
            change(seq = 2, rowId = "r2"),
        )
        assertEquals(
            SyncChecksum.computeForChanges(changes),
            SyncChecksum.computeForChanges(changes),
        )
    }

    @Test
    fun computeForChangesIsOrderIndependent() {
        val c1 = change(seq = 1, rowId = "r1")
        val c2 = change(seq = 2, rowId = "r2")
        // Reverse order should produce the same checksum (sorted internally)
        assertEquals(
            SyncChecksum.computeForChanges(listOf(c1, c2)),
            SyncChecksum.computeForChanges(listOf(c2, c1)),
        )
    }

    @Test
    fun verifyMatchingChecksum() {
        val changes = listOf(change(seq = 1, rowId = "r1"))
        val checksum = SyncChecksum.computeForChanges(changes)
        assertTrue(SyncChecksum.verify(changes, checksum))
    }

    @Test
    fun verifyMismatchedChecksum() {
        val changes = listOf(change(seq = 1, rowId = "r1"))
        assertTrue(!SyncChecksum.verify(changes, "deadbeef"))
    }

    // ── pullChanges tests ───────────────────────────────────────

    @Test
    fun pullChangesFetchesFromProvider() = runTest {
        val provider = StubSyncProvider()
        val changes = listOf(change(seq = 1, rowId = "r1", syncVersion = 5))
        provider.pullResponses.addLast(
            PullResult(changes = changes, newVersions = mapOf("accounts" to 5L), hasMore = false),
        )
        val manager = DeltaSyncManager(provider, InMemorySequenceTracker(), TEST_CONFIG)

        val result = manager.pullChanges()
        assertEquals(1, result.size)
        assertEquals("r1", result[0].effectiveRecordId)
    }

    @Test
    fun pullChangesHandlesPagination() = runTest {
        val provider = StubSyncProvider()
        provider.pullResponses.addLast(
            PullResult(
                changes = listOf(change(seq = 1, rowId = "r1")),
                newVersions = mapOf("accounts" to 1L),
                hasMore = true,
            ),
        )
        provider.pullResponses.addLast(
            PullResult(
                changes = listOf(change(seq = 2, rowId = "r2")),
                newVersions = mapOf("accounts" to 2L),
                hasMore = false,
            ),
        )
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(provider, tracker, TEST_CONFIG)

        val result = manager.pullChanges()
        assertEquals(2, result.size)
        assertEquals(2L, tracker.getLastSequence("accounts"))
    }

    @Test
    fun pullChangesUpdatesSequenceTracker() = runTest {
        val provider = StubSyncProvider()
        provider.pullResponses.addLast(
            PullResult(
                changes = listOf(change(seq = 1)),
                newVersions = mapOf("accounts" to 10L),
                hasMore = false,
            ),
        )
        val tracker = InMemorySequenceTracker()
        val manager = DeltaSyncManager(provider, tracker, TEST_CONFIG)

        manager.pullChanges()
        assertEquals(10L, tracker.getVersion("accounts"))
    }

    // ── pushMutations tests ─────────────────────────────────────

    @Test
    fun pushMutationsReturnsEmptyForEmptyList() = runTest {
        val manager = createManager()
        val result = manager.pushMutations(emptyList())
        assertTrue(result.succeeded.isEmpty())
        assertTrue(result.failed.isEmpty())
    }

    @Test
    fun pushMutationsBatchesByConfig() = runTest {
        // batchSize = 2 in TEST_CONFIG
        val provider = StubSyncProvider()
        val manager = DeltaSyncManager(provider, InMemorySequenceTracker(), TEST_CONFIG)

        val mutations = listOf(
            mutation(id = "m1", recordId = "r1"),
            mutation(id = "m2", recordId = "r2"),
            mutation(id = "m3", recordId = "r3"),
        )
        val result = manager.pushMutations(mutations)

        // Provider should have received all 3 mutations across 2 batches
        assertEquals(3, provider.pushedMutations.size)
        assertEquals(3, result.succeeded.size)
    }

    // ── detectConflicts tests ───────────────────────────────────

    @Test
    fun detectConflictsReturnsEmptyWhenNoOverlap() {
        val manager = createManager()
        val serverChanges = listOf(change(seq = 1, rowId = "r1"))
        val localMutations = listOf(mutation(recordId = "r2"))
        val conflicts = manager.detectConflicts(serverChanges, localMutations)
        assertTrue(conflicts.isEmpty())
    }

    @Test
    fun detectConflictsFindsOverlappingRecords() {
        val manager = createManager()
        val serverChanges = listOf(
            change(seq = 1, rowId = "r1", syncVersion = 5),
        )
        val localMutations = listOf(
            mutation(id = "m1", recordId = "r1"),
        )
        val conflicts = manager.detectConflicts(serverChanges, localMutations)

        assertEquals(1, conflicts.size)
        assertEquals("accounts", conflicts[0].tableName)
        assertEquals("r1", conflicts[0].recordId)
        assertEquals(5L, conflicts[0].serverVersion)
        assertEquals(0L, conflicts[0].localVersion)
    }

    @Test
    fun detectConflictsIgnoresNonOverlappingTables() {
        val manager = createManager()
        val serverChanges = listOf(change(table = "accounts", seq = 1, rowId = "r1"))
        val localMutations = listOf(mutation(table = "transactions", recordId = "r1"))
        val conflicts = manager.detectConflicts(serverChanges, localMutations)
        assertTrue(conflicts.isEmpty())
    }

    @Test
    fun detectConflictsReturnsEmptyForEmptyInputs() {
        val manager = createManager()
        assertTrue(manager.detectConflicts(emptyList(), emptyList()).isEmpty())
        assertTrue(manager.detectConflicts(listOf(change(seq = 1)), emptyList()).isEmpty())
        assertTrue(manager.detectConflicts(emptyList(), listOf(mutation())).isEmpty())
    }

    // ── executePullCycle tests ──────────────────────────────────

    @Test
    fun executePullCycleReturnsChangesAndConflicts() = runTest {
        val provider = StubSyncProvider()
        provider.pullResponses.addLast(
            PullResult(
                changes = listOf(change(seq = 1, rowId = "r1", syncVersion = 3)),
                newVersions = mapOf("accounts" to 3L),
                hasMore = false,
            ),
        )
        val manager = DeltaSyncManager(provider, InMemorySequenceTracker(), TEST_CONFIG)

        val pendingMutations = listOf(mutation(id = "m1", recordId = "r1"))
        val result = manager.executePullCycle(pendingMutations)

        assertEquals(1, result.changes.size)
        assertEquals(1, result.conflicts.size)
        assertEquals(3L, result.newVersions["accounts"])
        assertNotNull(result.checksum)
    }

    @Test
    fun executePullCycleWithNoChangesReturnsNullChecksum() = runTest {
        val provider = StubSyncProvider()
        provider.pullResponses.addLast(
            PullResult(changes = emptyList(), newVersions = emptyMap(), hasMore = false),
        )
        val manager = DeltaSyncManager(provider, InMemorySequenceTracker(), TEST_CONFIG)

        val result = manager.executePullCycle(emptyList())
        assertTrue(result.changes.isEmpty())
        assertTrue(result.conflicts.isEmpty())
        assertNull(result.checksum)
    }

    @Test
    fun executePullCycleWithNoConflicts() = runTest {
        val provider = StubSyncProvider()
        provider.pullResponses.addLast(
            PullResult(
                changes = listOf(change(seq = 1, rowId = "r1")),
                newVersions = mapOf("accounts" to 1L),
                hasMore = false,
            ),
        )
        val manager = DeltaSyncManager(provider, InMemorySequenceTracker(), TEST_CONFIG)

        // Pending mutations for a different record
        val pendingMutations = listOf(mutation(id = "m1", recordId = "r2"))
        val result = manager.executePullCycle(pendingMutations)

        assertEquals(1, result.changes.size)
        assertTrue(result.conflicts.isEmpty())
        assertNotNull(result.checksum)
    }

    // ── resetSync tests ─────────────────────────────────────────

    @Test
    fun resetSyncClearsAllVersions() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 10)
        tracker.setLastSequence("transactions", 20)
        val manager = createManager(tracker)

        manager.resetSync()

        assertNull(tracker.getLastSequence("accounts"))
        assertNull(tracker.getLastSequence("transactions"))
    }

    // ── SequenceTracker extended API tests ───────────────────────

    @Test
    fun trackerGetVersionReturnsZeroForUnknownTable() = runTest {
        val tracker = InMemorySequenceTracker()
        assertEquals(0L, tracker.getVersion("unknown"))
    }

    @Test
    fun trackerGetAllVersionsReturnsSnapshot() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 5)
        tracker.setLastSequence("transactions", 10)
        val versions = tracker.getAllVersions()
        assertEquals(mapOf("accounts" to 5L, "transactions" to 10L), versions)
    }

    @Test
    fun trackerUpdateVersionOnlyAdvances() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.updateVersion("accounts", 10)
        assertEquals(10L, tracker.getVersion("accounts"))

        // Trying to set a lower version should be a no-op
        tracker.updateVersion("accounts", 5)
        assertEquals(10L, tracker.getVersion("accounts"))

        // Higher version should advance
        tracker.updateVersion("accounts", 15)
        assertEquals(15L, tracker.getVersion("accounts"))
    }

    @Test
    fun trackerHasEverSynced() = runTest {
        val tracker = InMemorySequenceTracker()
        assertTrue(!tracker.hasEverSynced())

        tracker.setLastSequence("accounts", 1)
        assertTrue(tracker.hasEverSynced())
    }

    @Test
    fun trackerTrackedTables() = runTest {
        val tracker = InMemorySequenceTracker()
        assertTrue(tracker.trackedTables().isEmpty())

        tracker.setLastSequence("accounts", 1)
        tracker.setLastSequence("transactions", 2)
        assertEquals(setOf("accounts", "transactions"), tracker.trackedTables())
    }

    @Test
    fun trackerResetAllClearsEverything() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.setLastSequence("accounts", 1)
        tracker.setLastSequence("transactions", 2)

        tracker.resetAll()

        assertTrue(!tracker.hasEverSynced())
        assertEquals(0L, tracker.getVersion("accounts"))
    }

    @Test
    fun trackerUpdateVersionsBatch() = runTest {
        val tracker = InMemorySequenceTracker()
        tracker.updateVersions(mapOf("accounts" to 5L, "transactions" to 10L))
        assertEquals(5L, tracker.getVersion("accounts"))
        assertEquals(10L, tracker.getVersion("transactions"))
    }
}