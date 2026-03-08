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
}
