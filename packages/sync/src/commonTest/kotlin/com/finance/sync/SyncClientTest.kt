// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync

import com.finance.sync.auth.AuthCredentials
import com.finance.sync.auth.AuthManager
import com.finance.sync.auth.AuthSession
import com.finance.sync.delta.DeltaSyncManager
import com.finance.sync.delta.InMemorySequenceTracker
import com.finance.sync.queue.InMemoryMutationQueue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class SyncClientTest {

    private val config = SyncConfig(
        endpoint = "https://sync.example.com",
        databaseName = "test.db",
        syncIntervalMs = 5_000L,
        maxRetryAttempts = 3,
        retryBackoffBaseMs = 100L,
        retryBackoffMaxMs = 1_000L,
    )

    private fun createTestComponents(
        authManager: FakeAuthManager = FakeAuthManager(),
        provider: FakeSyncProvider = FakeSyncProvider(),
    ): TestComponents {
        val queue = InMemoryMutationQueue()
        val tracker = InMemorySequenceTracker()
        val deltaSyncManager = DeltaSyncManager(provider, tracker, config)
        val engine = DefaultSyncEngine(
            config = config,
            provider = provider,
            mutationQueue = queue,
            deltaSyncManager = deltaSyncManager,
        )
        return TestComponents(
            authManager = authManager,
            provider = provider,
            queue = queue,
            engine = engine,
        )
    }

    private data class TestComponents(
        val authManager: FakeAuthManager,
        val provider: FakeSyncProvider,
        val queue: InMemoryMutationQueue,
        val engine: DefaultSyncEngine,
    )

    // ── signInAndSync ───────────────────────────────────────────────

    @Test
    fun signInAndSyncSucceedsWithValidCredentials() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        val result = client.signInAndSync(
            AuthCredentials.EmailPassword("test@example.com", "password"),
        )

        assertTrue(result.isSuccess)
        assertTrue(components.authManager.isAuthenticated.value)

        client.destroy()
    }

    @Test
    fun signInAndSyncFailsWithInvalidCredentials() = runTest {
        val authManager = FakeAuthManager(signInShouldFail = true)
        val components = createTestComponents(authManager = authManager)
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        val result = client.signInAndSync(
            AuthCredentials.EmailPassword("bad@example.com", "wrong"),
        )

        assertTrue(result.isFailure)
        assertFalse(components.authManager.isAuthenticated.value)

        client.destroy()
    }

    // ── signOut ─────────────────────────────────────────────────────

    @Test
    fun signOutClearsSessionAndQueue() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        // Sign in first
        client.signInAndSync(
            AuthCredentials.EmailPassword("test@example.com", "password"),
        )

        // Enqueue a mutation
        components.queue.enqueue(
            SyncMutation(
                id = "m-1",
                tableName = "transactions",
                operation = MutationOperation.INSERT,
                rowData = mapOf("id" to "t-1", "amount" to "1000"),
                timestamp = Clock.System.now(),
            ),
        )
        assertEquals(1, components.queue.pendingCount())

        // Sign out
        client.signOut()

        assertFalse(components.authManager.isAuthenticated.value)
        assertEquals(0, components.queue.pendingCount())

        client.destroy()
    }

    // ── syncNow ─────────────────────────────────────────────────────

    @Test
    fun syncNowDelegatesToEngine() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        components.engine.connect(
            SyncCredentials(authToken = "token", userId = "user-1"),
        )

        val result = client.syncNow()

        assertIs<SyncResult.Success>(result)

        client.destroy()
    }

    // ── Reactive state ──────────────────────────────────────────────

    @Test
    fun isAuthenticatedReflectsAuthManagerState() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        assertFalse(client.isAuthenticated.value)

        components.authManager.signIn(
            AuthCredentials.EmailPassword("test@example.com", "password"),
        )

        assertTrue(client.isAuthenticated.value)

        client.destroy()
    }

    @Test
    fun pendingMutationCountReflectsQueue() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        assertEquals(0, client.pendingMutationCount.value)

        components.queue.enqueue(
            SyncMutation(
                id = "m-1",
                tableName = "transactions",
                operation = MutationOperation.INSERT,
                rowData = mapOf("id" to "t-1"),
                timestamp = Clock.System.now(),
            ),
        )

        // Allow the stateIn collector to update
        advanceUntilIdle()

        assertEquals(1, client.pendingMutationCount.value)

        client.destroy()
    }

    // ── Lifecycle ───────────────────────────────────────────────────

    @Test
    fun startRequiresActiveSession() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        // No session — start should return without starting
        client.start()

        // Engine should not be connected
        assertFalse(components.engine.isConnected.value)

        client.destroy()
    }

    @Test
    fun stopIsIdempotent() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        // Multiple stops should not throw
        client.stop()
        client.stop()
        client.stop()

        client.destroy()
    }

    @Test
    fun destroyCancelsScope() = runTest {
        val components = createTestComponents()
        val client = SyncClient(
            config = config,
            authManager = components.authManager,
            syncEngine = components.engine,
            mutationQueue = components.queue,
            coroutineContext = UnconfinedTestDispatcher(testScheduler),
        )

        client.destroy()

        // After destroy, any operation on the scope should fail gracefully
        // The client is no longer usable
    }
}

// ── Fake AuthManager ────────────────────────────────────────────────

/**
 * Fake [AuthManager] implementation for testing.
 *
 * Simulates sign-in / sign-out flows with in-memory state.
 */
class FakeAuthManager(
    private val signInShouldFail: Boolean = false,
) : AuthManager {

    private val _currentSession = MutableStateFlow<AuthSession?>(null)
    override val currentSession: StateFlow<AuthSession?> = _currentSession.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    override val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    override suspend fun signIn(credentials: AuthCredentials): Result<AuthSession> {
        if (signInShouldFail) {
            return Result.failure(RuntimeException("Authentication failed"))
        }

        val session = AuthSession(
            accessToken = "fake-access-token",
            refreshToken = "fake-refresh-token",
            expiresAt = Instant.fromEpochMilliseconds(
                Clock.System.now().toEpochMilliseconds() + 3_600_000L,
            ),
            userId = "fake-user-id",
        )

        _currentSession.value = session
        _isAuthenticated.value = true
        return Result.success(session)
    }

    override suspend fun signOut() {
        _currentSession.value = null
        _isAuthenticated.value = false
    }

    override suspend fun refreshToken(): Result<AuthSession> {
        val session = _currentSession.value
            ?: return Result.failure(RuntimeException("No active session"))

        val refreshed = session.copy(
            accessToken = "refreshed-access-token",
            expiresAt = Instant.fromEpochMilliseconds(
                Clock.System.now().toEpochMilliseconds() + 3_600_000L,
            ),
        )

        _currentSession.value = refreshed
        return Result.success(refreshed)
    }

    override suspend fun deleteAccount(): Result<Unit> {
        _currentSession.value = null
        _isAuthenticated.value = false
        return Result.success(Unit)
    }
}
