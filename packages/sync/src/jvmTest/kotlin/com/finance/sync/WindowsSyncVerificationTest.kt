// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import com.finance.sync.conflict.ConflictResolution
import com.finance.sync.conflict.ConflictStrategy
import com.finance.sync.conflict.SyncConflict
import com.finance.sync.integration.InMemoryDatabase
import com.finance.sync.integration.MockSyncServer
import com.finance.sync.integration.MutationOperation as IntegrationMutationOp
import com.finance.sync.integration.NetworkSimulator
import com.finance.sync.integration.SyncIntegrationTestHarness
import com.finance.sync.integration.TestClock
import com.finance.sync.queue.InMemoryMutationQueue
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Windows sync verification tests — ensures the sync engine operates
 * correctly on the JVM target used by the Windows (Compose Desktop) app.
 *
 * Validates SyncManager initialization, sync operations, offline queue,
 * and configuration consistency between JVM and Android targets.
 *
 * Addresses #1389.
 */
class WindowsSyncVerificationTest {

    private lateinit var harness: SyncIntegrationTestHarness
    private lateinit var testClock: TestClock

    @BeforeTest
    fun setUp() = runTest {
        testClock = TestClock()
        harness = SyncIntegrationTestHarness(clock = testClock)
        harness.reset()
    }

    // ── SyncManager initialization on JVM ───────────────────────

    @Test
    fun test_sync_manager_initializes_on_jvm() {
        // Verify SyncConfig can be created on JVM target
        val config = SyncConfig(
            endpoint = "https://powersync.example.com",
            databaseName = "finance-windows.db",
            syncIntervalMs = 15_000L,
            batchSize = 50,
        )
        assertNotNull(config)
        assertEquals("finance-windows.db", config.databaseName)
        assertEquals(15_000L, config.syncIntervalMs)
    }

    @Test
    fun test_sync_harness_creates_on_jvm() = runTest {
        // Verify the full integration test harness works on JVM
        assertNotNull(harness.server, "MockSyncServer should instantiate on JVM")
        assertNotNull(harness.deviceA, "SyncClient A should instantiate on JVM")
        assertNotNull(harness.deviceB, "SyncClient B should instantiate on JVM")
        assertNotNull(harness.networkA, "NetworkSimulator A should instantiate on JVM")
        assertNotNull(harness.networkB, "NetworkSimulator B should instantiate on JVM")
    }

    @Test
    fun test_sync_status_sealed_hierarchy_on_jvm() {
        // Verify all SyncStatus subtypes resolve correctly on JVM
        val idle: SyncStatus = SyncStatus.Idle
        assertIs<SyncStatus.Idle>(idle)

        val connecting: SyncStatus = SyncStatus.Connecting
        assertIs<SyncStatus.Connecting>(connecting)

        val connected: SyncStatus = SyncStatus.Connected
        assertIs<SyncStatus.Connected>(connected)

        val disconnected: SyncStatus = SyncStatus.Disconnected
        assertIs<SyncStatus.Disconnected>(disconnected)

        val syncing: SyncStatus = SyncStatus.Syncing(
            SyncProgress(SyncPhase.PULLING, 5, 20),
        )
        assertIs<SyncStatus.Syncing>(syncing)
        assertEquals(0.25, (syncing as SyncStatus.Syncing).progress.fraction)

        val error: SyncStatus = SyncStatus.Error(
            SyncError.NetworkError("Connection refused"),
        )
        assertIs<SyncStatus.Error>(error)
    }

    // ── Sync operations run on JVM target ───────────────────────

    @Test
    fun test_sync_push_works_on_jvm() = runTest {
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-jvm-push",
            payload = """{"amount_cents":5000,"payee":"JVM Push Test"}""",
        )

        val serverMutations = harness.server.mutations
        assertEquals(1, serverMutations.size, "Server should receive the pushed mutation")
        assertEquals("txn-jvm-push", serverMutations.first().entityId)
    }

    @Test
    fun test_sync_pull_works_on_jvm() = runTest {
        harness.deviceA.put(
            entityType = "account",
            entityId = "acc-jvm-pull",
            payload = """{"name":"JVM Test Account","balance_cents":100000}""",
        )

        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(1, applied.size, "Device B should pull 1 change on JVM")

        val record = harness.deviceB.database.get("account", "acc-jvm-pull")
        assertNotNull(record)
        assertTrue(record.payload.contains("JVM Test Account"))
    }

    @Test
    fun test_sync_bidirectional_on_jvm() = runTest {
        harness.deviceA.put(
            entityType = "transaction",
            entityId = "txn-from-a",
            payload = """{"amount_cents":100,"payee":"Device A"}""",
        )
        harness.deviceB.put(
            entityType = "transaction",
            entityId = "txn-from-b",
            payload = """{"amount_cents":200,"payee":"Device B"}""",
        )

        harness.deviceA.pullRemoteChanges()
        harness.deviceB.pullRemoteChanges()

        assertNotNull(harness.deviceA.database.get("transaction", "txn-from-b"))
        assertNotNull(harness.deviceB.database.get("transaction", "txn-from-a"))
    }

    @Test
    fun test_sync_multi_table_on_jvm() = runTest {
        harness.deviceA.put("account", "acc-1", """{"name":"Checking"}""")
        harness.deviceA.put("transaction", "txn-1", """{"amount_cents":4200}""")
        harness.deviceA.put("category", "cat-1", """{"name":"Food"}""")
        harness.deviceA.put("budget", "bud-1", """{"name":"Groceries","limit_cents":50000}""")

        val applied = harness.deviceB.pullRemoteChanges()
        assertEquals(4, applied.size, "Should sync 4 records across multiple tables on JVM")
    }

    // ── Offline queue works on JVM ──────────────────────────────

    @Test
    fun test_offline_queue_on_jvm() = runTest {
        harness.networkA.goOffline()

        repeat(5) { i ->
            harness.deviceA.put(
                entityType = "transaction",
                entityId = "txn-offline-jvm-$i",
                payload = """{"amount_cents":${(i + 1) * 1000}}""",
            )
        }

        assertEquals(5, harness.deviceA.offlineQueueSize, "Queue should hold 5 mutations on JVM")

        harness.networkA.goOnline()
        val pushed = harness.deviceA.pushPendingMutations()

        assertEquals(5, pushed, "All 5 should push on reconnect on JVM")
        assertEquals(0, harness.deviceA.offlineQueueSize, "Queue should be empty")
    }

    @Test
    fun test_mutation_queue_on_jvm() = runTest {
        val queue = InMemoryMutationQueue()

        val mutation = SyncMutation(
            id = "m-jvm-1",
            tableName = "transactions",
            operation = MutationOperation.INSERT,
            rowData = mapOf("id" to "txn-1", "amount_cents" to "5000"),
            timestamp = Clock.System.now(),
        )

        queue.enqueue(mutation)
        assertEquals(1, queue.pendingCount())
        assertTrue(queue.hasPendingMutations.first())

        val peeked = queue.peek()
        assertNotNull(peeked)
        assertEquals("m-jvm-1", peeked.id)

        queue.dequeue("m-jvm-1")
        assertEquals(0, queue.pendingCount())
        assertFalse(queue.hasPendingMutations.first())
    }

    @Test
    fun test_mutation_queue_coalescing_on_jvm() = runTest {
        val queue = InMemoryMutationQueue()

        queue.enqueue(SyncMutation(
            id = "m-1",
            tableName = "accounts",
            operation = MutationOperation.INSERT,
            rowData = mapOf("id" to "acc-1", "name" to "Original", "balance_cents" to "100000"),
            timestamp = Instant.parse("2024-01-01T00:00:00Z"),
        ))
        queue.enqueue(SyncMutation(
            id = "m-2",
            tableName = "accounts",
            operation = MutationOperation.UPDATE,
            rowData = mapOf("id" to "acc-1", "name" to "Updated"),
            timestamp = Instant.parse("2024-01-01T01:00:00Z"),
        ))

        assertEquals(1, queue.pendingCount(), "INSERT + UPDATE should coalesce on JVM")
        val coalesced = queue.peek()!!
        assertEquals(MutationOperation.INSERT, coalesced.operation)
        assertEquals("Updated", coalesced.rowData["name"])
        assertEquals("100000", coalesced.rowData["balance_cents"])
    }

    // ── Sync engine configuration consistency ───────────────────

    @Test
    fun test_sync_config_consistent_between_jvm_and_android() {
        // Both JVM (Windows) and Android use the same SyncConfig class from commonMain
        val config = SyncConfig(
            endpoint = "https://powersync.example.com",
            databaseName = "finance.db",
        )

        // Verify default values are consistent
        assertEquals(30_000L, config.syncIntervalMs, "Default sync interval should be 30s")
        assertEquals(5, config.maxRetryAttempts, "Default max retries should be 5")
        assertEquals(1_000L, config.retryBackoffBaseMs, "Default backoff base should be 1s")
        assertEquals(60_000L, config.retryBackoffMaxMs, "Default backoff max should be 60s")
        assertEquals(100, config.batchSize, "Default batch size should be 100")
        assertTrue(config.enableCompression, "Compression should be enabled by default")
        assertEquals(10_000L, config.connectionTimeoutMs, "Default connection timeout should be 10s")
        assertEquals(30_000L, config.requestTimeoutMs, "Default request timeout should be 30s")
    }

    @Test
    fun test_conflict_strategy_consistent_on_jvm() {
        // Verify same conflict strategy routing on JVM as Android
        val txnResolver = ConflictStrategy.resolverFor("transactions")
        val budgetResolver = ConflictStrategy.resolverFor("budgets")
        val goalResolver = ConflictStrategy.resolverFor("goals")
        val unknownResolver = ConflictStrategy.resolverFor("unknown_table")

        // transactions → LWW
        val txnConflict = SyncConflict(
            tableName = "transactions",
            recordId = "txn-1",
            localData = mapOf("amount" to "100"),
            serverData = mapOf("amount" to "200"),
            localVersion = 1,
            serverVersion = 2,
            localTimestamp = Instant.parse("2024-01-01T00:00:00Z"),
            serverTimestamp = Instant.parse("2024-01-01T01:00:00Z"),
            localOperation = MutationOperation.UPDATE,
            serverOperation = MutationOperation.UPDATE,
        )
        val txnResult = txnResolver.resolveConflict(txnConflict)
        assertIs<ConflictResolution.AcceptServer>(txnResult)

        // budgets → MERGE
        val budgetConflict = txnConflict.copy(
            tableName = "budgets",
            localData = mapOf("name" to "Local", "limit" to "100"),
            serverData = mapOf("name" to "Server", "limit" to "200"),
        )
        val budgetResult = budgetResolver.resolveConflict(budgetConflict)
        assertNotNull(budgetResult)

        // goals → MERGE (same as budgets)
        val goalConflict = txnConflict.copy(
            tableName = "goals",
            localData = mapOf("name" to "Local Goal"),
            serverData = mapOf("name" to "Server Goal"),
        )
        val goalResult = goalResolver.resolveConflict(goalConflict)
        assertNotNull(goalResult)

        // unknown → LWW (default)
        val unknownResult = unknownResolver.resolveConflict(txnConflict.copy(tableName = "unknown_table"))
        assertIs<ConflictResolution.AcceptServer>(unknownResult)
    }

    @Test
    fun test_sync_error_types_consistent_on_jvm() {
        // Verify all SyncError types construct correctly on JVM
        val errors: List<SyncError> = listOf(
            SyncError.NetworkError("Connection timeout"),
            SyncError.AuthError("Token expired"),
            SyncError.ServerError(500, "Internal server error"),
            SyncError.ConflictError(3),
            SyncError.Unknown("Unexpected"),
        )

        assertEquals(5, errors.size)

        assertIs<SyncError.NetworkError>(errors[0])
        assertEquals("Connection timeout", (errors[0] as SyncError.NetworkError).message)

        assertIs<SyncError.AuthError>(errors[1])
        assertIs<SyncError.ServerError>(errors[2])
        assertEquals(500, (errors[2] as SyncError.ServerError).statusCode)
        assertIs<SyncError.ConflictError>(errors[3])
        assertIs<SyncError.Unknown>(errors[4])
    }

    @Test
    fun test_sync_mutation_entity_key_on_jvm() {
        val mutation = SyncMutation(
            id = "m-key-test",
            tableName = "transactions",
            operation = MutationOperation.INSERT,
            rowData = mapOf("id" to "txn-123", "amount_cents" to "5000"),
            timestamp = Clock.System.now(),
        )

        assertEquals(
            "transactions:txn-123",
            mutation.entityKey,
            "Entity key should combine tableName:rowData[id]",
        )
    }

    @Test
    fun test_sync_mutation_retry_increment_on_jvm() {
        val original = SyncMutation(
            id = "m-retry",
            tableName = "accounts",
            operation = MutationOperation.UPDATE,
            rowData = mapOf("id" to "acc-1"),
            timestamp = Clock.System.now(),
            retryCount = 0,
        )

        val retried = original.withIncrementedRetry()
        assertEquals(1, retried.retryCount)

        val retriedAgain = retried.withIncrementedRetry()
        assertEquals(2, retriedAgain.retryCount)
    }

    // ── Network simulation on JVM ───────────────────────────────

    @Test
    fun test_network_simulator_on_jvm() = runTest {
        val network = NetworkSimulator()

        assertTrue(network.isOnline, "Should start online")

        network.goOffline()
        assertTrue(network.isOffline, "Should be offline")

        network.goOnline()
        assertTrue(network.isOnline, "Should be back online")

        assertEquals(
            listOf(
                NetworkSimulator.State.ONLINE,
                NetworkSimulator.State.OFFLINE,
                NetworkSimulator.State.ONLINE,
            ),
            network.stateHistory,
            "State history should track all transitions on JVM",
        )
    }

    @Test
    fun test_server_error_handling_on_jvm() = runTest {
        harness.networkA.goOffline()
        harness.deviceA.put("transaction", "txn-err", """{"amount_cents":100}""")
        harness.networkA.goOnline()

        // Server fails
        harness.server.shouldFailNext = true
        val pushed = harness.deviceA.pushPendingMutations()
        assertEquals(0, pushed, "Push should fail on server error on JVM")
        assertTrue(harness.deviceA.backoffCount >= 1, "Backoff should increment on JVM")

        // Retry succeeds
        val retryPush = harness.deviceA.pushPendingMutations()
        assertEquals(1, retryPush, "Retry should succeed on JVM")
    }
}
