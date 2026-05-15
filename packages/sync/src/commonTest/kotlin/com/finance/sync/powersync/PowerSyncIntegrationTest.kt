// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.powersync

import com.finance.sync.MutationOperation
import com.finance.sync.SyncConfig
import com.finance.sync.SyncError
import com.finance.sync.SyncPhase
import com.finance.sync.SyncProgress
import com.finance.sync.SyncStatus
import com.finance.sync.integration.InMemoryDatabase
import com.finance.sync.integration.MockSyncServer
import com.finance.sync.integration.MutationOperation as IntegrationMutationOp
import com.finance.sync.integration.NetworkSimulator
import com.finance.sync.integration.SyncIntegrationTestHarness
import com.finance.sync.integration.TestClock
import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * PowerSync integration coverage tests for the sync engine.
 *
 * Exercises sync manager initialization, full/incremental sync, offline queue,
 * conflict resolution, status reporting, reconnection, large batch sync,
 * filtering, error recovery, bidirectional sync, and version tracking.
 *
 * Uses the [SyncIntegrationTestHarness] with in-memory database and mock server
 * to validate sync behaviour across all KMP targets without native dependencies.
 *
 * Addresses #1388.
 */
class PowerSyncIntegrationTest {

    private lateinit var harness: SyncIntegrationTestHarness
    private lateinit var testClock: TestClock

    @BeforeTest
    fun setUp() = runTest {
        testClock = TestClock()
        harness = SyncIntegrationTestHarness(clock = testClock)
        harness.reset()
    }

    // ── Sync manager initialization & configuration ─────────────

    @Test
    fun test_sync_config_initializes_with_valid_defaults() {
        val config = SyncConfig(
            endpoint = "https://powersync.example.com",
            databaseName = "finance.db",
        )
        assertEquals(30_000L, config.syncIntervalMs)
        assertEquals(5, config.maxRetryAttempts)
        assertEquals(100, config.batchSize)
        assertTrue(config.enableCompression)
    }

    @Test
    fun test_sync_config_custom_values_are_respected() {
        val config = SyncConfig(
            endpoint = "https://powersync.example.com",
            databaseName = "finance.db",
            syncIntervalMs = 10_000L,
            maxRetryAttempts = 3,
            batchSize = 50,
            enableCompression = false,
        )
        assertEquals(10_000L, config.syncIntervalMs)
        assertEquals(3, config.maxRetryAttempts)
        assertEquals(50, config.batchSize)
        assertEquals(false, config.enableCompression)
    }

    @Test
    fun test_sync_status_starts_as_idle() {
        val status: SyncStatus = SyncStatus.Idle
        assertIs<SyncStatus.Idle>(status)
    }

    // ── Initial full sync simulation ────────────────────────────

    @Test
    fun test_initial_full_sync_receives_all_server_data() = runTest {
        // Server has multiple records across tables
        harness.deviceA.put(
            entityType = "account",
            entityId = "acc-001",
            payload = """{"name":"Checking","balance_cents":1000000}""",
        )
        harness.deviceA.put(
            entityType = "account",
            entityId = "acc-002",
            payload = """{"name":"Savings","balance_cents":5000000}""",
        )
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-001",
            payload = """{"amount_cents":4200,"payee":"Coffee"}""",
        )
        harness.deviceA.put(
            entityType = "category",
            entityId = "cat-001",
            payload = """{"name":"Food","icon":"fork"}""",
        )

        // Device B performs initial sync — should receive all 4 records
        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(4, applied.size, "Initial full sync should receive all server records")

        val accounts = harness.deviceB.database.getAll("account")
        assertEquals(2, accounts.size, "Should have 2 accounts after full sync")

        val transactions = harness.deviceB.database.getAll("transaction")
        assertEquals(1, transactions.size, "Should have 1 transaction after full sync")

        val categories = harness.deviceB.database.getAll("category")
        assertEquals(1, categories.size, "Should have 1 category after full sync")
    }

    // ── Incremental sync ────────────────────────────────────────

    @Test
    fun test_incremental_sync_only_receives_changed_records() = runTest {
        // Initial data
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-001",
            payload = """{"amount_cents":1000,"payee":"Store A"}""",
        )
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-002",
            payload = """{"amount_cents":2000,"payee":"Store B"}""",
        )

        // Device B does initial sync
        val initialSync = harness.deviceB.pullRemoteChanges()
        assertEquals(2, initialSync.size, "Initial sync should get 2 records")

        testClock.advanceBy(1000)

        // Device A adds one more record
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-003",
            payload = """{"amount_cents":3000,"payee":"Store C"}""",
        )

        // Device B incremental sync — should only get the new record
        val incrementalSync = harness.deviceB.pullRemoteChanges()
        assertEquals(1, incrementalSync.size, "Incremental sync should only get new records")
        assertEquals("txn-003", incrementalSync.first().entityId)
    }

    // ── Offline queue management ────────────────────────────────

    @Test
    fun test_offline_queue_operations_are_queued() = runTest {
        harness.networkA.goOffline()

        repeat(3) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-offline-$i",
                payload = """{"amount_cents":${(i + 1) * 100},"payee":"Offline Vendor $i"}""",
            )
        }

        assertEquals(3, harness.deviceA.offlineQueueSize, "All operations should be queued while offline")

        // Verify local DB still has the records
        val localRecords = harness.deviceA.database.getAll("transaction")
        assertEquals(3, localRecords.size, "Local DB should have all records despite being offline")
    }

    @Test
    fun test_offline_queue_drains_on_reconnect() = runTest {
        harness.networkA.goOffline()

        repeat(5) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-drain-$i",
                payload = """{"amount_cents":${(i + 1) * 500}}""",
            )
        }

        assertEquals(5, harness.deviceA.offlineQueueSize)

        harness.networkA.goOnline()
        val pushed = harness.deviceA.pushPendingMutations()

        assertEquals(5, pushed, "All 5 queued mutations should be pushed")
        assertEquals(0, harness.deviceA.offlineQueueSize, "Queue should be empty after push")
    }

    // ── Conflict resolution (LWW with vector clocks) ────────────

    @Test
    fun test_lww_conflict_resolution_later_timestamp_wins() = runTest {
        harness.networkA.goOffline()
        harness.networkB.goOffline()

        // Device A edits first (earlier timestamp)
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-conflict",
            payload = """{"amount_cents":1000,"payee":"Device A"}""",
            operation = IntegrationMutationOp.UPDATE,
        )

        testClock.advanceBy(2000)

        // Device B edits later (later timestamp → wins)
        harness.deviceB.put(
            entityType = "transaction",
            entityId = "txn-conflict",
            payload = """{"amount_cents":2000,"payee":"Device B"}""",
            operation = IntegrationMutationOp.UPDATE,
        )

        harness.networkA.goOnline()
        harness.networkB.goOnline()

        harness.deviceA.pushPendingMutations()
        harness.deviceB.pushPendingMutations()

        // Device A pulls — Device B's later edit should win
        val appliedOnA = harness.deviceA.pullRemoteChanges()
        assertEquals(1, appliedOnA.size)

        val recordOnA = harness.deviceA.database.get("transaction", "txn-conflict")
        assertNotNull(recordOnA)
        assertTrue(
            recordOnA.payload.contains("Device B"),
            "LWW: Device B's later edit should win on Device A",
        )
    }

    // ── Sync status reporting ───────────────────────────────────

    @Test
    fun test_sync_status_states_are_exhaustive() {
        // Verify all SyncStatus states can be constructed
        val states = listOf(
            SyncStatus.Idle,
            SyncStatus.Connecting,
            SyncStatus.Connected,
            SyncStatus.Disconnected,
            SyncStatus.Syncing(SyncProgress(SyncPhase.PULLING, 0, null)),
            SyncStatus.Syncing(SyncProgress(SyncPhase.PUSHING, 5, 10)),
            SyncStatus.Syncing(SyncProgress(SyncPhase.RESOLVING_CONFLICTS, 0, null)),
            SyncStatus.Error(SyncError.NetworkError("timeout")),
            SyncStatus.Error(SyncError.AuthError("expired")),
            SyncStatus.Error(SyncError.ServerError(500, "Internal error")),
            SyncStatus.Error(SyncError.ConflictError(3)),
            SyncStatus.Error(SyncError.Unknown("unexpected")),
        )

        assertEquals(12, states.size, "All SyncStatus variants should be constructable")
    }

    @Test
    fun test_sync_progress_fraction_calculation() {
        val indeterminate = SyncProgress(SyncPhase.PULLING, 0, null)
        assertEquals(null, indeterminate.fraction, "Indeterminate progress should have null fraction")

        val halfway = SyncProgress(SyncPhase.PUSHING, 5, 10)
        assertEquals(0.5, halfway.fraction, "5/10 should be 0.5")

        val complete = SyncProgress(SyncPhase.PUSHING, 10, 10)
        assertEquals(1.0, complete.fraction, "10/10 should be 1.0")
    }

    // ── Reconnection behavior ───────────────────────────────────

    @Test
    fun test_reconnection_after_network_loss_resumes_sync() = runTest {
        // Create data while online
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-before-drop",
            payload = """{"amount_cents":100}""",
        )

        // Device B goes offline then back online
        harness.networkB.goOffline()
        val offlinePull = harness.deviceB.pullRemoteChanges()
        assertEquals(0, offlinePull.size, "Pull while offline should return empty")

        harness.networkB.goOnline()
        val onlinePull = harness.deviceB.pullRemoteChanges()
        assertEquals(1, onlinePull.size, "Should receive data after reconnection")
    }

    @Test
    fun test_reconnection_preserves_queue_state() = runTest {
        harness.networkA.goOffline()

        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-reconnect",
            payload = """{"amount_cents":999}""",
        )

        assertEquals(1, harness.deviceA.offlineQueueSize)

        // Simulate reconnection attempt failure
        harness.networkA.goOnline()
        harness.server.shouldFailNext = true
        harness.deviceA.pushPendingMutations()

        assertEquals(1, harness.deviceA.offlineQueueSize, "Queue should persist after failed push")

        // Successful retry
        val pushed = harness.deviceA.pushPendingMutations()
        assertEquals(1, pushed, "Should push after server recovery")
        assertEquals(0, harness.deviceA.offlineQueueSize)
    }

    // ── Large batch sync ────────────────────────────────────────

    @Test
    fun test_large_batch_sync_1000_records() = runTest {
        val recordCount = 1000

        // Device A creates 1000 records
        repeat(recordCount) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-batch-$i",
                payload = """{"amount_cents":${i + 1},"index":$i}""",
            )
        }

        // Device B pulls all records
        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(recordCount, applied.size, "Should receive all $recordCount records")

        val records = harness.deviceB.database.getAll("transaction")
        assertEquals(recordCount, records.size, "Local DB should have all $recordCount records")
    }

    @Test
    fun test_large_batch_sync_preserves_ordering() = runTest {
        val recordCount = 1000

        repeat(recordCount) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-order-$i",
                payload = """{"amount_cents":${i + 1}}""",
            )
        }

        val applied = harness.deviceB.pullRemoteChanges()
        val sequences = applied.map { it.sequence }

        assertEquals(
            sequences.sorted(),
            sequences,
            "Large batch should maintain monotonic sequence ordering",
        )
    }

    // ── Sync filtering (user scope) ─────────────────────────────

    @Test
    fun test_sync_filtering_device_only_sees_others_changes() = runTest {
        // Device A creates a record
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-filter-a",
            payload = """{"amount_cents":100,"owner_id":"user-a"}""",
        )

        // Device B creates a record
        harness.deviceB.put(
            entityType = "transaction",
            entityId = "txn-filter-b",
            payload = """{"amount_cents":200,"owner_id":"user-b"}""",
        )

        // Each device pulls — should only get the OTHER device's data
        val appliedOnA = harness.deviceA.pullRemoteChanges()
        assertEquals(1, appliedOnA.size, "Device A should see Device B's record")
        assertEquals("txn-filter-b", appliedOnA.first().entityId)

        val appliedOnB = harness.deviceB.pullRemoteChanges()
        assertEquals(1, appliedOnB.size, "Device B should see Device A's record")
        assertEquals("txn-filter-a", appliedOnB.first().entityId)
    }

    // ── Sync error recovery ─────────────────────────────────────

    @Test
    fun test_sync_error_recovery_partial_failure_retry() = runTest {
        harness.networkA.goOffline()

        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-retry",
            payload = """{"amount_cents":500}""",
        )

        harness.networkA.goOnline()

        // First push fails
        harness.server.shouldFailNext = true
        val pushed1 = harness.deviceA.pushPendingMutations()
        assertEquals(0, pushed1, "Should fail on server error")
        assertTrue(harness.deviceA.backoffCount >= 1, "Backoff should increment")

        // Retry succeeds
        val pushed2 = harness.deviceA.pushPendingMutations()
        assertEquals(1, pushed2, "Should succeed on retry")
        assertEquals(0, harness.deviceA.offlineQueueSize)
    }

    @Test
    fun test_sync_error_recovery_multiple_retries() = runTest {
        harness.networkA.goOffline()

        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-multi-retry",
            payload = """{"amount_cents":1000}""",
        )

        harness.networkA.goOnline()

        // Fail 3 times
        repeat(3) {
            harness.server.shouldFailNext = true
            harness.deviceA.pushPendingMutations()
        }

        assertTrue(harness.deviceA.backoffCount >= 3, "Backoff count should track failures")
        assertEquals(1, harness.deviceA.offlineQueueSize, "Mutation should still be queued")

        // Final successful push
        val pushed = harness.deviceA.pushPendingMutations()
        assertEquals(1, pushed, "Should eventually succeed")
    }

    // ── Bidirectional sync ──────────────────────────────────────

    @Test
    fun test_bidirectional_sync_local_to_server_and_server_to_local() = runTest {
        // Device A pushes local changes to server
        harness.deviceA.put(
            entityType = "account",
            entityId = "acc-bidir-a",
            payload = """{"name":"Device A Account","balance_cents":100000}""",
        )

        // Device B pushes different changes to server
        harness.deviceB.put(
            entityType = "account",
            entityId = "acc-bidir-b",
            payload = """{"name":"Device B Account","balance_cents":200000}""",
        )

        // Both pull to get each other's changes
        harness.deviceA.pullRemoteChanges()
        harness.deviceB.pullRemoteChanges()

        // Verify bidirectional sync
        val aHasB = harness.deviceA.database.get("account", "acc-bidir-b")
        assertNotNull(aHasB, "Device A should have Device B's account")
        assertTrue(aHasB.payload.contains("Device B Account"))

        val bHasA = harness.deviceB.database.get("account", "acc-bidir-a")
        assertNotNull(bHasA, "Device B should have Device A's account")
        assertTrue(bHasA.payload.contains("Device A Account"))
    }

    // ── Sync version tracking ───────────────────────────────────

    @Test
    fun test_sync_version_tracking_monotonic_sequences() = runTest {
        // Create records and verify sequence numbers are monotonically increasing
        repeat(10) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-version-$i",
                payload = """{"amount_cents":${(i + 1) * 100}}""",
            )
        }

        val serverMutations = harness.server.mutations
        val sequences = serverMutations.map { it.sequence }

        // Verify monotonic ordering
        for (i in 1 until sequences.size) {
            assertTrue(
                sequences[i] > sequences[i - 1],
                "Sequence numbers must be strictly monotonic: ${sequences[i - 1]} < ${sequences[i]}",
            )
        }
    }

    @Test
    fun test_sync_version_tracking_across_tables() = runTest {
        harness.deviceA.put(
            entityType = "account",
            entityId = "acc-v1",
            payload = """{"name":"Account 1"}""",
        )
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-v1",
            payload = """{"amount_cents":100}""",
        )
        harness.deviceA.put(
            entityType = "category",
            entityId = "cat-v1",
            payload = """{"name":"Food"}""",
        )

        val serverMutations = harness.server.mutations
        assertEquals(3, serverMutations.size)

        // Sequences should be 1, 2, 3 regardless of table
        assertEquals(1L, serverMutations[0].sequence)
        assertEquals(2L, serverMutations[1].sequence)
        assertEquals(3L, serverMutations[2].sequence)
    }
}
