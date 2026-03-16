// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.integration

import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Integration tests for core sync scenarios.
 *
 * Each test uses a [SyncIntegrationTestHarness] with two simulated devices
 * (A and B) communicating through a [MockSyncServer].
 */
class SyncScenarioTest {

    private lateinit var harness: SyncIntegrationTestHarness

    @BeforeTest
    fun setUp() = runTest {
        harness = SyncIntegrationTestHarness()
        harness.reset()
    }

    // ── Online sync ─────────────────────────────────────────────

    @Test
    fun test_online_sync_propagates_changes() = runTest {
        // Device A creates a transaction while online
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-001",
            payload = """{"amount":4200,"payee":"Coffee Shop"}""",
        )

        // Device B pulls and should see the transaction
        val applied = harness.deviceB.pullRemoteChanges()

        assertEquals(1, applied.size, "Device B should receive exactly one mutation")
        assertEquals("txn-001", applied.first().entityId)

        val record = harness.deviceB.database.get("transaction", "txn-001")
        assertNotNull(record, "Device B should have the transaction in its local DB")
        assertTrue(record.payload.contains("Coffee Shop"), "Payload should contain the payee")
    }

    // ── Offline queue ───────────────────────────────────────────

    @Test
    fun test_offline_queue_replays_on_reconnect() = runTest {
        // Device A goes offline
        harness.networkA.goOffline()

        // Create 5 transactions while offline
        repeat(5) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-offline-$i",
                payload = """{"amount":${(i + 1) * 1000},"payee":"Vendor $i"}""",
            )
        }

        // All 5 should be queued
        assertEquals(5, harness.deviceA.offlineQueueSize, "All 5 mutations should be queued")

        // Device A comes back online and pushes
        harness.networkA.goOnline()
        val pushed = harness.deviceA.pushPendingMutations()

        assertEquals(5, pushed, "All 5 queued mutations should be pushed")
        assertEquals(0, harness.deviceA.offlineQueueSize, "Queue should be empty after push")

        // Device B should see all 5
        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(5, applied.size, "Device B should receive all 5 mutations")
    }

    // ── Concurrent edits (LWW) ──────────────────────────────────

    @Test
    fun test_concurrent_edits_resolve_with_lww() = runTest {
        // Use a controllable clock so LWW ordering is deterministic
        // and does not depend on wall-clock resolution (fixes ChromeHeadless flakes).
        val testClock = TestClock()
        val lwwHarness = SyncIntegrationTestHarness(clock = testClock)

        // Both devices go offline
        lwwHarness.networkA.goOffline()
        lwwHarness.networkB.goOffline()

        // Device A edits the transaction first (earlier timestamp)
        lwwHarness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-conflict",
            payload = """{"amount":1000,"payee":"Device A Edit"}""",
            operation = MutationOperation.UPDATE,
        )

        // Advance the test clock by 1 second to guarantee LWW ordering.
        testClock.advanceBy(1000)

        // Device B edits the same transaction (later timestamp → wins LWW)
        lwwHarness.deviceB.put(
            entityType = "transaction",
            entityId = "txn-conflict",
            payload = """{"amount":2000,"payee":"Device B Edit"}""",
            operation = MutationOperation.UPDATE,
        )

        // Both come online and push
        lwwHarness.networkA.goOnline()
        lwwHarness.networkB.goOnline()

        lwwHarness.deviceA.pushPendingMutations()
        lwwHarness.deviceB.pushPendingMutations()

        // Device A pulls — should get Device B's version (later timestamp)
        val appliedOnA = lwwHarness.deviceA.pullRemoteChanges()
        assertEquals(1, appliedOnA.size, "Device A should receive Device B's mutation")

        val recordOnA = lwwHarness.deviceA.database.get("transaction", "txn-conflict")
        assertNotNull(recordOnA)
        assertTrue(
            recordOnA.payload.contains("Device B Edit"),
            "LWW: Device B's later edit should win on Device A",
        )

        // Device B pulls — Device A's mutation should NOT overwrite (older timestamp)
        val appliedOnB = lwwHarness.deviceB.pullRemoteChanges()
        assertEquals(0, appliedOnB.size, "Device B should ignore Device A's older mutation")

        val recordOnB = lwwHarness.deviceB.database.get("transaction", "txn-conflict")
        assertNotNull(recordOnB)
        assertTrue(
            recordOnB.payload.contains("Device B Edit"),
            "LWW: Device B should retain its own later edit",
        )
    }

    // ── Soft delete ─────────────────────────────────────────────

    @Test
    fun test_delete_syncs_as_soft_delete() = runTest {
        // Use a controllable clock so the delete timestamp is guaranteed
        // to be strictly later than the insert (fixes potential ChromeHeadless flakes).
        val testClock = TestClock()
        val deleteHarness = SyncIntegrationTestHarness(clock = testClock)

        // Device A creates a transaction
        deleteHarness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-delete",
            payload = """{"amount":500,"payee":"To Be Deleted"}""",
        )

        // Device B receives it
        deleteHarness.deviceB.pullRemoteChanges()
        val beforeDelete = deleteHarness.deviceB.database.get("transaction", "txn-delete")
        assertNotNull(beforeDelete, "Device B should have the transaction")

        // Advance clock so the soft-delete timestamp is strictly later than the insert
        testClock.advanceBy(1000)

        // Device A soft-deletes
        deleteHarness.deviceA.softDelete("transaction", "txn-delete")

        // Device B pulls the delete
        val applied = deleteHarness.deviceB.pullRemoteChanges()
        assertEquals(1, applied.size, "Device B should receive the delete mutation")
        assertEquals(MutationOperation.DELETE, applied.first().operation)

        // Verify soft-delete on Device B
        val afterDelete = deleteHarness.deviceB.database.get("transaction", "txn-delete")
        assertNotNull(afterDelete, "Record should still exist (soft delete)")
        assertTrue(afterDelete.isDeleted, "Record should be marked as deleted")
    }

    // ── Sequence gap triggers resync ────────────────────────────

    @Test
    fun test_sequence_gap_triggers_resync() = runTest {
        // Device A creates 3 transactions so the server has sequences 1, 2, 3
        repeat(3) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-seq-$i",
                payload = """{"amount":${(i + 1) * 100}}""",
            )
        }

        // Simulate a gap: server hides sequence 2
        harness.server.addSequenceGap(2)

        // Device B should detect the gap
        val hasGap = harness.deviceB.detectSequenceGap()
        assertTrue(hasGap, "Device B should detect a sequence gap when sequence 2 is missing")
    }

    // ── Multi-table sync ────────────────────────────────────────

    @Test
    fun test_multi_table_sync_transactions_accounts_categories() = runTest {
        // Device A creates entities across three different tables
        harness.deviceA.put(
            entityType = "account",
            entityId = "acc-001",
            payload = """{"name":"Checking","balance_cents":500000}""",
        )
        harness.deviceA.put(
            entityType = "category",
            entityId = "cat-001",
            payload = """{"name":"Groceries","icon":"cart"}""",
        )
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-001",
            payload = """{"amount_cents":4200,"account_id":"acc-001","category_id":"cat-001","payee":"Supermarket"}""",
        )
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-002",
            payload = """{"amount_cents":1500,"account_id":"acc-001","category_id":"cat-001","payee":"Corner Store"}""",
        )

        // Device B pulls all changes across all tables
        val applied = harness.deviceB.pullRemoteChanges()

        assertEquals(4, applied.size, "Device B should receive all 4 mutations across 3 tables")

        // Verify each entity type is present in Device B's local DB
        val accounts = harness.deviceB.database.getAll("account")
        assertEquals(1, accounts.size, "Device B should have 1 account")
        assertTrue(accounts[0].payload.contains("Checking"))

        val categories = harness.deviceB.database.getAll("category")
        assertEquals(1, categories.size, "Device B should have 1 category")
        assertTrue(categories[0].payload.contains("Groceries"))

        val transactions = harness.deviceB.database.getAll("transaction")
        assertEquals(2, transactions.size, "Device B should have 2 transactions")
    }

    // ── Update after initial sync ───────────────────────────────

    @Test
    fun test_update_after_initial_sync_propagates() = runTest {
        val testClock = TestClock()
        val updateHarness = SyncIntegrationTestHarness(clock = testClock)

        // Device A creates a transaction
        updateHarness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-update",
            payload = """{"amount_cents":1000,"payee":"Original Payee"}""",
        )

        // Device B syncs it
        updateHarness.deviceB.pullRemoteChanges()
        val original = updateHarness.deviceB.database.get("transaction", "txn-update")
        assertNotNull(original)
        assertTrue(original.payload.contains("Original Payee"))

        // Advance clock to ensure update has a later timestamp
        testClock.advanceBy(1000)

        // Device A updates the transaction
        updateHarness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-update",
            payload = """{"amount_cents":2000,"payee":"Updated Payee"}""",
            operation = MutationOperation.UPDATE,
        )

        // Device B pulls the update
        val updates = updateHarness.deviceB.pullRemoteChanges()
        assertEquals(1, updates.size, "Device B should receive the update")

        val updated = updateHarness.deviceB.database.get("transaction", "txn-update")
        assertNotNull(updated)
        assertTrue(
            updated.payload.contains("Updated Payee"),
            "Device B should have the updated payee",
        )
    }

    // ── Bi-directional sync ─────────────────────────────────────

    @Test
    fun test_bidirectional_sync_between_devices() = runTest {
        // Device A creates a transaction
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-from-a",
            payload = """{"amount_cents":100,"payee":"From Device A"}""",
        )

        // Device B creates a different transaction
        harness.deviceB.put(
            entityType = "transaction",
            entityId = "txn-from-b",
            payload = """{"amount_cents":200,"payee":"From Device B"}""",
        )

        // Both pull changes
        harness.deviceA.pullRemoteChanges()
        harness.deviceB.pullRemoteChanges()

        // Device A should now have both transactions
        val aRecordFromB = harness.deviceA.database.get("transaction", "txn-from-b")
        assertNotNull(aRecordFromB, "Device A should have Device B's transaction")
        assertTrue(aRecordFromB.payload.contains("From Device B"))

        // Device B should now have both transactions
        val bRecordFromA = harness.deviceB.database.get("transaction", "txn-from-a")
        assertNotNull(bRecordFromA, "Device B should have Device A's transaction")
        assertTrue(bRecordFromA.payload.contains("From Device A"))
    }

    // ── Empty pull returns no changes ───────────────────────────

    @Test
    fun test_empty_pull_returns_no_changes() = runTest {
        val applied = harness.deviceA.pullRemoteChanges()
        assertEquals(0, applied.size, "Pull with no server changes should return empty list")
    }

    // ── Multiple records of same type ───────────────────────────

    @Test
    fun test_multiple_records_same_type_all_sync() = runTest {
        // Device A creates 10 transactions
        repeat(10) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-multi-$i",
                payload = """{"amount_cents":${(i + 1) * 100},"payee":"Vendor $i"}""",
            )
        }

        // Device B pulls all
        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(10, applied.size, "Device B should receive all 10 transactions")

        // Verify each transaction exists in Device B's DB
        repeat(10) { i ->
            val record = harness.deviceB.database.get("transaction", "txn-multi-$i")
            assertNotNull(record, "Transaction txn-multi-$i should exist on Device B")
            assertTrue(record.payload.contains("Vendor $i"))
        }
    }
}
