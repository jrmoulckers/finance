// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.integration

import kotlinx.coroutines.test.runTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
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

    // ── Multiple offline periods → all mutations eventually sync ──

    @Test
    fun test_multiple_offline_periods_all_mutations_eventually_sync() = runTest {
        val testClock = TestClock()
        val multiHarness = SyncIntegrationTestHarness(clock = testClock)

        // Period 1: Go offline, create mutations
        multiHarness.networkA.goOffline()
        repeat(3) { i ->
            multiHarness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-period1-$i",
                payload = """{"amount":${(i + 1) * 100},"period":1}""",
            )
        }
        assertEquals(3, multiHarness.deviceA.offlineQueueSize, "Period 1: 3 mutations queued")

        // Come online, push period 1 mutations
        multiHarness.networkA.goOnline()
        testClock.advanceBy(1000)
        val pushed1 = multiHarness.deviceA.pushPendingMutations()
        assertEquals(3, pushed1, "Period 1: all 3 mutations should push")
        assertEquals(0, multiHarness.deviceA.offlineQueueSize, "Queue should be empty")

        // Period 2: Go offline again, create more mutations
        multiHarness.networkA.goOffline()
        testClock.advanceBy(5000)
        repeat(4) { i ->
            multiHarness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-period2-$i",
                payload = """{"amount":${(i + 1) * 200},"period":2}""",
            )
        }
        assertEquals(4, multiHarness.deviceA.offlineQueueSize, "Period 2: 4 mutations queued")

        // Come online, push period 2 mutations
        multiHarness.networkA.goOnline()
        testClock.advanceBy(1000)
        val pushed2 = multiHarness.deviceA.pushPendingMutations()
        assertEquals(4, pushed2, "Period 2: all 4 mutations should push")

        // Period 3: Yet another offline period
        multiHarness.networkA.goOffline()
        testClock.advanceBy(10000)
        repeat(2) { i ->
            multiHarness.deviceA.put(
                entityType = "account",
                entityId = "acc-period3-$i",
                payload = """{"name":"Account $i","period":3}""",
            )
        }

        multiHarness.networkA.goOnline()
        testClock.advanceBy(1000)
        val pushed3 = multiHarness.deviceA.pushPendingMutations()
        assertEquals(2, pushed3, "Period 3: all 2 mutations should push")

        // Device B pulls all changes across all periods
        val applied = multiHarness.deviceB.pullRemoteChanges()
        assertEquals(9, applied.size, "Device B should receive all 9 mutations (3 + 4 + 2)")

        // Verify Device B has all records
        val transactions = multiHarness.deviceB.database.getAll("transaction")
        assertEquals(7, transactions.size, "Device B should have 7 transactions")

        val accounts = multiHarness.deviceB.database.getAll("account")
        assertEquals(2, accounts.size, "Device B should have 2 accounts")
    }

    // ── Network drop mid-sync → retry on reconnect ──────────────

    @Test
    fun test_network_drop_during_push_retries_on_reconnect() = runTest {
        // Device A goes offline and creates a mutation
        harness.networkA.goOffline()
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-drop",
            payload = """{"amount":777}""",
        )

        // Try to push while offline — should fail silently
        val pushedOffline = harness.deviceA.pushPendingMutations()
        assertEquals(0, pushedOffline, "Push should fail while offline")
        assertEquals(1, harness.deviceA.offlineQueueSize, "Mutation should remain queued")

        // Come back online
        harness.networkA.goOnline()

        // Retry push — should succeed
        val pushedOnline = harness.deviceA.pushPendingMutations()
        assertEquals(1, pushedOnline, "Push should succeed after reconnect")
        assertEquals(0, harness.deviceA.offlineQueueSize, "Queue should be empty after successful push")

        // Device B should receive the mutation
        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(1, applied.size, "Device B should receive the mutation after retry")
    }

    @Test
    fun test_server_error_mid_sync_does_not_lose_data() = runTest {
        // Device A creates mutations while online
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-server-err-1",
            payload = """{"amount":100}""",
        )

        // Now go offline and create more
        harness.networkA.goOffline()
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-server-err-2",
            payload = """{"amount":200}""",
        )
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-server-err-3",
            payload = """{"amount":300}""",
        )

        // Come online but server will fail
        harness.networkA.goOnline()
        harness.server.shouldFailNext = true
        val pushed1 = harness.deviceA.pushPendingMutations()
        assertEquals(0, pushed1, "Push should fail due to server error")
        assertEquals(2, harness.deviceA.offlineQueueSize, "Both mutations should remain queued")

        // Server recovers
        val pushed2 = harness.deviceA.pushPendingMutations()
        assertEquals(2, pushed2, "Both mutations should push on retry")
        assertEquals(0, harness.deviceA.offlineQueueSize)
    }

    // ── Pull while offline returns empty ─────────────────────────

    @Test
    fun test_pull_while_offline_returns_empty() = runTest {
        // Device A creates a mutation
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-pull-offline",
            payload = """{"amount":500}""",
        )

        // Device B goes offline
        harness.networkB.goOffline()

        // Device B tries to pull — should get empty list (not crash)
        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(0, applied.size, "Pull while offline should return empty list")

        // Device B comes back online and pulls successfully
        harness.networkB.goOnline()
        val appliedOnline = harness.deviceB.pullRemoteChanges()
        assertEquals(1, appliedOnline.size, "Pull should succeed after coming online")
    }

    // ── Network state history tracking ──────────────────────────

    @Test
    fun test_network_state_history_is_tracked() = runTest {
        // Initial state is ONLINE
        assertEquals(
            listOf(NetworkSimulator.State.ONLINE),
            harness.networkA.stateHistory,
        )

        harness.networkA.goOffline()
        harness.networkA.goOnline()
        harness.networkA.goOffline()

        assertEquals(
            listOf(
                NetworkSimulator.State.ONLINE,
                NetworkSimulator.State.OFFLINE,
                NetworkSimulator.State.ONLINE,
                NetworkSimulator.State.OFFLINE,
            ),
            harness.networkA.stateHistory,
        )
    }

    // ── Extended offline with data consistency ───────────────────

    @Test
    fun test_extended_offline_maintains_local_data_consistency() = runTest {
        // Device A goes offline for an extended period
        harness.networkA.goOffline()

        // Create, update, then delete a record — all while offline
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-lifecycle",
            payload = """{"amount":100,"payee":"Initial"}""",
        )
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-lifecycle",
            payload = """{"amount":200,"payee":"Updated"}""",
            operation = MutationOperation.UPDATE,
        )

        // Local DB should have the latest version
        val localRecord = harness.deviceA.database.get("transaction", "txn-lifecycle")
        assertNotNull(localRecord)
        assertTrue(localRecord.payload.contains("Updated"), "Local DB should reflect latest update")

        // Come online and push
        harness.networkA.goOnline()
        harness.deviceA.pushPendingMutations()

        // Device B should receive the mutations
        val applied = harness.deviceB.pullRemoteChanges()
        assertTrue(applied.isNotEmpty(), "Device B should receive mutations")

        val bRecord = harness.deviceB.database.get("transaction", "txn-lifecycle")
        assertNotNull(bRecord)
    }

    // ── Both devices offline simultaneously ─────────────────────

    @Test
    fun test_both_devices_offline_then_sync() = runTest {
        val testClock = TestClock()
        val dualOfflineHarness = SyncIntegrationTestHarness(clock = testClock)

        // Both devices go offline
        dualOfflineHarness.networkA.goOffline()
        dualOfflineHarness.networkB.goOffline()

        // Device A creates while offline
        dualOfflineHarness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-dual-a",
            payload = """{"amount":111,"payee":"Device A Offline"}""",
        )

        testClock.advanceBy(500)

        // Device B creates while offline
        dualOfflineHarness.deviceB.put(
            entityType = "transaction",
            entityId = "txn-dual-b",
            payload = """{"amount":222,"payee":"Device B Offline"}""",
        )

        // Both come online
        dualOfflineHarness.networkA.goOnline()
        dualOfflineHarness.networkB.goOnline()

        testClock.advanceBy(100)

        // Push queued mutations
        dualOfflineHarness.deviceA.pushPendingMutations()
        dualOfflineHarness.deviceB.pushPendingMutations()

        // Pull to get each other's changes
        dualOfflineHarness.deviceA.pullRemoteChanges()
        dualOfflineHarness.deviceB.pullRemoteChanges()

        // Both should have both transactions
        val aRecord = dualOfflineHarness.deviceA.database.get("transaction", "txn-dual-b")
        assertNotNull(aRecord, "Device A should have Device B's offline transaction")

        val bRecord = dualOfflineHarness.deviceB.database.get("transaction", "txn-dual-a")
        assertNotNull(bRecord, "Device B should have Device A's offline transaction")
    }
}
