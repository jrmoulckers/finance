// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import com.finance.sync.delta.DeltaSyncManager
import com.finance.sync.delta.InMemorySequenceTracker
import com.finance.sync.queue.InMemoryMutationQueue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultSyncEngineTest {

    private val config = SyncConfig(
        endpoint = "https://sync.example.com",
        databaseName = "test.db",
        syncIntervalMs = 5_000L,
        maxRetryAttempts = 3,
        retryBackoffBaseMs = 100L,
        retryBackoffMaxMs = 1_000L,
    )

    private val testCredentials = SyncCredentials(
        authToken = "test-token",
        userId = "user-123",
    )

    private fun createEngine(
        provider: SyncProvider = FakeSyncProvider(),
        healthListener: SyncHealthListener? = null,
        credentialRefresher: (suspend () -> SyncCredentials)? = null,
    ): DefaultSyncEngine {
        val queue = InMemoryMutationQueue()
        val tracker = InMemorySequenceTracker()
        val deltaSyncManager = DeltaSyncManager(provider, tracker, config)
        return DefaultSyncEngine(
            config = config,
            provider = provider,
            mutationQueue = queue,
            deltaSyncManager = deltaSyncManager,
            healthListener = healthListener,
            credentialRefresher = credentialRefresher,
        )
    }

    // ── Connection lifecycle ────────────────────────────────────────

    @Test
    fun connectSetsStatusToConnected() = runTest {
        val engine = createEngine()
        engine.connect(testCredentials)

        assertTrue(engine.isConnected.value)
        assertEquals(SyncStatus.Connected, engine.status.value)
    }

    @Test
    fun connectIsNoOpWhenAlreadyConnected() = runTest {
        val provider = FakeSyncProvider()
        val engine = createEngine(provider)

        engine.connect(testCredentials)
        engine.connect(testCredentials) // second call

        assertEquals(1, provider.connectCount)
    }

    @Test
    fun connectSetsErrorStatusOnFailure() = runTest {
        val provider = FakeSyncProvider(connectShouldFail = true)
        val engine = createEngine(provider)

        engine.connect(testCredentials)

        assertFalse(engine.isConnected.value)
        assertIs<SyncStatus.Error>(engine.status.value)
    }

    @Test
    fun disconnectSetsStatusToDisconnected() = runTest {
        val engine = createEngine()
        engine.connect(testCredentials)
        engine.disconnect()

        assertFalse(engine.isConnected.value)
        assertEquals(SyncStatus.Disconnected, engine.status.value)
    }

    @Test
    fun disconnectIsNoOpWhenNotConnected() = runTest {
        val provider = FakeSyncProvider()
        val engine = createEngine(provider)

        engine.disconnect() // should not throw

        assertEquals(0, provider.disconnectCount)
    }

    // ── Single sync cycle ───────────────────────────────────────────

    @Test
    fun syncNowReturnsSuccessOnCleanCycle() = runTest {
        val engine = createEngine()
        engine.connect(testCredentials)

        val result = engine.syncNow()

        assertIs<SyncResult.Success>(result)
        assertEquals(0, result.changesApplied)
        assertEquals(0, result.mutationsPushed)
        assertEquals(0, result.conflictsResolved)
    }

    @Test
    fun syncNowReturnsFailureOnProviderError() = runTest {
        val provider = FakeSyncProvider(pullShouldFail = true)
        val engine = createEngine(provider)
        engine.connect(testCredentials)

        val result = engine.syncNow()

        assertIs<SyncResult.Failure>(result)
    }

    @Test
    fun syncNowResetsConsecutiveFailuresOnSuccess() = runTest {
        val provider = FakeSyncProvider()
        val engine = createEngine(provider)
        engine.connect(testCredentials)

        // First call fails
        provider.pullShouldFail = true
        engine.syncNow()

        // Second call succeeds
        provider.pullShouldFail = false
        val result = engine.syncNow()

        assertIs<SyncResult.Success>(result)
        assertEquals(SyncStatus.Connected, engine.status.value)
    }

    // ── Health listener ─────────────────────────────────────────────

    @Test
    fun syncNowReportsSuccessToHealthListener() = runTest {
        val listener = RecordingHealthListener()
        val engine = createEngine(healthListener = listener)
        engine.connect(testCredentials)

        engine.syncNow()

        assertEquals(1, listener.successes.size)
        assertTrue(listener.failures.isEmpty())
    }

    @Test
    fun syncNowReportsFailureToHealthListener() = runTest {
        val provider = FakeSyncProvider(pullShouldFail = true)
        val listener = RecordingHealthListener()
        val engine = createEngine(provider = provider, healthListener = listener)
        engine.connect(testCredentials)

        engine.syncNow()

        assertEquals(1, listener.failures.size)
        assertTrue(listener.successes.isEmpty())
    }

    @Test
    fun syncNowReportsPendingMutationCount() = runTest {
        val listener = RecordingHealthListener()
        val engine = createEngine(healthListener = listener)
        engine.connect(testCredentials)

        engine.syncNow()

        // Should have reported pending count at least once (at start of cycle)
        assertTrue(listener.pendingChanges.isNotEmpty())
    }

    // ── Credential refresh ──────────────────────────────────────────

    @Test
    fun syncNowRefreshesExpiringCredentials() = runTest {
        var refreshCalled = false
        val now = Clock.System.now()

        val refreshedCredentials = SyncCredentials(
            authToken = "refreshed-token",
            userId = "user-123",
            expiresAt = Instant.fromEpochMilliseconds(
                now.toEpochMilliseconds() + 3_600_000L,
            ),
        )

        // Credentials that are about to expire (within 60s buffer)
        val expiringCredentials = SyncCredentials(
            authToken = "expiring-token",
            userId = "user-123",
            expiresAt = Instant.fromEpochMilliseconds(
                now.toEpochMilliseconds() + 30_000L,
            ),
        )

        val engine = createEngine(
            credentialRefresher = {
                refreshCalled = true
                refreshedCredentials
            },
        )

        engine.connect(expiringCredentials)
        engine.syncNow()

        assertTrue(refreshCalled)
    }

    @Test
    fun syncNowSkipsRefreshWhenCredentialsAreValid() = runTest {
        var refreshCalled = false
        val now = Clock.System.now()

        // Credentials that expire far in the future
        val validCredentials = SyncCredentials(
            authToken = "valid-token",
            userId = "user-123",
            expiresAt = Instant.fromEpochMilliseconds(
                now.toEpochMilliseconds() + 3_600_000L,
            ),
        )

        val engine = createEngine(
            credentialRefresher = {
                refreshCalled = true
                validCredentials
            },
        )

        engine.connect(validCredentials)
        engine.syncNow()

        assertFalse(refreshCalled)
    }

    @Test
    fun syncNowContinuesWhenRefreshFails() = runTest {
        val now = Clock.System.now()

        val expiringCredentials = SyncCredentials(
            authToken = "expiring-token",
            userId = "user-123",
            expiresAt = Instant.fromEpochMilliseconds(
                now.toEpochMilliseconds() + 30_000L,
            ),
        )

        val engine = createEngine(
            credentialRefresher = {
                throw RuntimeException("Refresh failed")
            },
        )

        engine.connect(expiringCredentials)
        val result = engine.syncNow()

        // Should still complete the sync cycle (with existing credentials)
        assertIs<SyncResult.Success>(result)
    }

    // ── Start / stop lifecycle ──────────────────────────────────────

    @Test
    fun isRunningReturnsFalseInitially() {
        val engine = createEngine()
        assertFalse(engine.isRunning())
    }

    @Test
    fun stopCancelsRunningLoop() = runTest {
        val engine = createEngine()

        val startJob = async { engine.start(testCredentials) }
        advanceTimeBy(100)

        assertTrue(engine.isRunning())

        engine.stop()
        advanceUntilIdle()

        assertFalse(engine.isRunning())
        assertFalse(engine.isConnected.value)
    }

    @Test
    fun stopIsIdempotent() = runTest {
        val engine = createEngine()
        engine.connect(testCredentials)

        // Multiple stops should not throw
        engine.stop()
        engine.stop()
        engine.stop()

        assertFalse(engine.isConnected.value)
    }

    // ── Status flow ─────────────────────────────────────────────────

    @Test
    fun syncFlowReturnsStatusUpdates() = runTest {
        val engine = createEngine()
        val flow = engine.sync()

        // Initially idle
        engine.connect(testCredentials)

        // After connect, should be Connected
        assertEquals(SyncStatus.Connected, engine.status.value)
    }
}

// ── Test helpers ────────────────────────────────────────────────────

/**
 * Recording implementation of [SyncHealthListener] for test assertions.
 */
class RecordingHealthListener : SyncHealthListener {
    val successes = mutableListOf<Pair<Long, Int>>()
    val failures = mutableListOf<SyncError>()
    val pendingChanges = mutableListOf<Int>()

    override fun onSyncSuccess(durationMs: Long, pendingMutations: Int) {
        successes.add(durationMs to pendingMutations)
    }

    override fun onSyncFailure(error: SyncError) {
        failures.add(error)
    }

    override fun onPendingMutationsChanged(count: Int) {
        pendingChanges.add(count)
    }
}

/**
 * Minimal [SyncProvider] fake for unit testing.
 *
 * All operations succeed by default; individual operations can be configured
 * to fail via constructor flags or mutable properties.
 */
class FakeSyncProvider(
    var connectShouldFail: Boolean = false,
    var pullShouldFail: Boolean = false,
    var pushShouldFail: Boolean = false,
) : SyncProvider {

    var connectCount = 0
        private set

    var disconnectCount = 0
        private set

    var pushCount = 0
        private set

    override suspend fun initialize(config: SyncConfig) {
        // No-op
    }

    override suspend fun connect(credentials: SyncCredentials, config: SyncConfig) {
        if (connectShouldFail) throw RuntimeException("Simulated connect failure")
        connectCount++
    }

    override suspend fun disconnect() {
        disconnectCount++
    }

    override suspend fun push(mutations: List<SyncMutation>): Result<Unit> {
        pushCount++
        return if (pushShouldFail) {
            Result.failure(RuntimeException("Simulated push failure"))
        } else {
            Result.success(Unit)
        }
    }

    override fun pull(): Flow<List<SyncChange>> = emptyFlow()

    override fun getStatus(): Flow<SyncStatus> = emptyFlow()

    override suspend fun pullChanges(since: Map<String, Long>): PullResult {
        if (pullShouldFail) throw RuntimeException("Simulated pull failure")
        return PullResult(
            changes = emptyList(),
            newVersions = since,
            hasMore = false,
        )
    }
}
