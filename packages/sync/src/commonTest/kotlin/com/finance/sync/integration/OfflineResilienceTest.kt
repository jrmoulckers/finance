package com.finance.sync.integration

import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Edge-case tests for offline resilience and error handling.
 *
 * These tests exercise the sync infrastructure under adverse conditions:
 * rapid connectivity changes, large offline queues, and server failures.
 */
class OfflineResilienceTest {

    private lateinit var harness: SyncIntegrationTestHarness

    @BeforeTest
    fun setUp() = runTest {
        harness = SyncIntegrationTestHarness()
        harness.reset()
    }

    // ── Rapid online/offline toggling ───────────────────────────

    @Test
    fun test_rapid_online_offline_toggling() = runTest {
        // Rapidly toggle network state while creating mutations
        repeat(20) { i ->
            if (i % 2 == 0) {
                harness.networkA.goOffline()
            } else {
                harness.networkA.goOnline()
            }

            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-toggle-$i",
                payload = """{"amount":${(i + 1) * 100},"note":"Toggle iteration $i"}""",
            )
        }

        // Ensure network is back online
        harness.networkA.goOnline()

        // Push any remaining queued mutations
        harness.deviceA.pushPendingMutations()

        // Verify: all 20 transactions should exist in Device A's local DB
        val localRecords = harness.deviceA.database.getAll("transaction")
        assertEquals(
            20,
            localRecords.size,
            "All 20 transactions should be in Device A's local database regardless of network state",
        )

        // Verify: no duplicates and queue is empty
        assertEquals(0, harness.deviceA.offlineQueueSize, "Queue should be drained after push")

        // Device B should be able to pull all that made it to the server
        val applied = harness.deviceB.pullRemoteChanges()
        assertTrue(
            applied.isNotEmpty(),
            "Device B should receive at least the mutations sent while online",
        )
    }

    // ── Large offline queue ─────────────────────────────────────

    @Test
    fun test_large_offline_queue_processes_in_order() = runTest {
        val mutationCount = 150

        // Go offline and queue a large batch
        harness.networkA.goOffline()

        repeat(mutationCount) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-bulk-$i",
                payload = """{"amount":${i + 1},"index":$i}""",
            )
        }

        assertEquals(
            mutationCount,
            harness.deviceA.offlineQueueSize,
            "All $mutationCount mutations should be queued",
        )

        // Come online and push
        harness.networkA.goOnline()
        val pushed = harness.deviceA.pushPendingMutations()

        assertEquals(mutationCount, pushed, "All $mutationCount mutations should be pushed successfully")
        assertEquals(0, harness.deviceA.offlineQueueSize, "Queue should be empty after push")

        // Device B pulls all changes
        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(
            mutationCount,
            applied.size,
            "Device B should receive all $mutationCount mutations",
        )

        // Verify ordering: server mutations should have ascending sequences
        val sequences = applied.map { it.sequence }
        assertEquals(
            sequences.sorted(),
            sequences,
            "Mutations should arrive in sequence order",
        )

        // Verify all records exist in Device B's database
        val records = harness.deviceB.database.getAll("transaction")
        assertEquals(
            mutationCount,
            records.size,
            "Device B should have all $mutationCount records locally",
        )
    }

    // ── Server error triggers backoff ───────────────────────────

    @Test
    fun test_server_error_triggers_backoff() = runTest {
        // Go offline, create a mutation, come back online
        harness.networkA.goOffline()
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-backoff",
            payload = """{"amount":999}""",
        )
        harness.networkA.goOnline()

        // Configure server to fail on next calls
        harness.server.shouldFailNext = true
        val pushed1 = harness.deviceA.pushPendingMutations()
        assertEquals(0, pushed1, "Push should fail when server errors")
        assertEquals(1, harness.deviceA.offlineQueueSize, "Mutation should remain queued after failure")
        assertTrue(harness.deviceA.backoffCount >= 1, "Backoff count should increment on server error")

        // Second failure to verify backoff increases
        harness.server.shouldFailNext = true
        val pushed2 = harness.deviceA.pushPendingMutations()
        assertEquals(0, pushed2, "Second push should also fail")
        assertTrue(
            harness.deviceA.backoffCount >= 2,
            "Backoff count should increment again on repeated failure",
        )

        // Server recovers — push should succeed
        val pushed3 = harness.deviceA.pushPendingMutations()
        assertEquals(1, pushed3, "Push should succeed when server recovers")
        assertEquals(0, harness.deviceA.offlineQueueSize, "Queue should be empty after successful push")
    }
}
