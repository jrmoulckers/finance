// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.sync

import app.cash.turbine.test
import com.finance.sync.SyncCredentials
import com.finance.sync.SyncError
import com.finance.sync.SyncPhase
import com.finance.sync.SyncProgress
import com.finance.sync.SyncStatus
import com.finance.sync.queue.InMemoryMutationQueue
import com.finance.sync.MutationOperation
import com.finance.sync.SyncMutation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for the sync integration layer.
 *
 * These tests exercise the shared [SyncEngine] contract and the
 * [InMemoryMutationQueue] that [AndroidSyncManager] delegates to,
 * without requiring an Android context.
 *
 * Full integration tests for [AndroidSyncManager] and [SyncWorker]
 * require instrumented tests with a real Android runtime.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AndroidSyncManagerTest {

    // -- Fakes ----------------------------------------------------------------

    /**
     * Test double for [com.finance.sync.SyncEngine] that records calls
     * and emits controlled [SyncStatus] values.
     */
    private class FakeSyncEngine : com.finance.sync.SyncEngine {
        var connectCalled = false
            private set
        var disconnectCalled = false
            private set
        var syncCalled = false
            private set

        private val _isConnected = MutableStateFlow(false)
        override val isConnected: StateFlow<Boolean> = _isConnected

        var syncFlow: Flow<SyncStatus> = flow {
            emit(SyncStatus.Syncing(SyncProgress(phase = SyncPhase.PULLING, processedRecords = 0, totalRecords = null)))
            emit(SyncStatus.Connected)
        }

        override suspend fun connect(credentials: SyncCredentials) {
            connectCalled = true
            _isConnected.value = true
        }

        override suspend fun disconnect() {
            disconnectCalled = true
            _isConnected.value = false
        }

        override fun sync(): Flow<SyncStatus> {
            syncCalled = true
            return syncFlow
        }
    }

    private val testCredentials = SyncCredentials(
        endpointUrl = "https://test.powersync.journeyapps.com",
        authToken = "test-token",
        userId = "user-123",
    )

    // -- SyncEngine contract tests --------------------------------------------

    @Test
    fun `SyncEngine starts disconnected`() = runTest {
        val engine = FakeSyncEngine()
        assertEquals(false, engine.isConnected.value)
    }

    @Test
    fun `SyncEngine connect sets isConnected to true`() = runTest {
        val engine = FakeSyncEngine()

        engine.connect(testCredentials)

        assertTrue(engine.connectCalled)
        assertEquals(true, engine.isConnected.value)
    }

    @Test
    fun `SyncEngine disconnect sets isConnected to false`() = runTest {
        val engine = FakeSyncEngine()
        engine.connect(testCredentials)

        engine.disconnect()

        assertTrue(engine.disconnectCalled)
        assertEquals(false, engine.isConnected.value)
    }

    @Test
    fun `SyncEngine sync emits Syncing then Connected`() = runTest {
        val engine = FakeSyncEngine()

        engine.sync().test {
            val first = awaitItem()
            assertTrue(first is SyncStatus.Syncing)

            val second = awaitItem()
            assertEquals(SyncStatus.Connected, second)

            awaitComplete()
        }
        assertTrue(engine.syncCalled)
    }

    @Test
    fun `SyncEngine sync emits Error on failure`() = runTest {
        val engine = FakeSyncEngine()
        val testError = SyncError.Unknown(cause = "sync failed")
        engine.syncFlow = flow {
            emit(SyncStatus.Error(testError))
        }

        engine.sync().test {
            val status = awaitItem()
            assertTrue(status is SyncStatus.Error)
            assertEquals("sync failed", (status as SyncStatus.Error).error.let { (it as SyncError.Unknown).cause })
            awaitComplete()
        }
    }

    // -- MutationQueue integration tests --------------------------------------

    @Test
    fun `mutation queue starts empty`() = runTest {
        val queue = InMemoryMutationQueue()
        assertEquals(0, queue.pendingCount())
    }

    @Test
    fun `mutation queue pendingCount reflects enqueued mutations`() = runTest {
        val queue = InMemoryMutationQueue()

        queue.enqueue(
            SyncMutation(
                id = "mut-1",
                tableName = "accounts",
                operation = MutationOperation.INSERT,
                rowData = mapOf("id" to "acc-1", "name" to "Test"),
                timestamp = Clock.System.now(),
            ),
        )
        assertEquals(1, queue.pendingCount())

        queue.enqueue(
            SyncMutation(
                id = "mut-2",
                tableName = "transactions",
                operation = MutationOperation.INSERT,
                rowData = mapOf("id" to "txn-1"),
                timestamp = Clock.System.now(),
            ),
        )
        assertEquals(2, queue.pendingCount())
    }

    @Test
    fun `mutation queue dequeue reduces count`() = runTest {
        val queue = InMemoryMutationQueue()

        queue.enqueue(
            SyncMutation(
                id = "mut-1",
                tableName = "accounts",
                operation = MutationOperation.INSERT,
                rowData = mapOf("id" to "acc-1"),
                timestamp = Clock.System.now(),
            ),
        )
        queue.enqueue(
            SyncMutation(
                id = "mut-2",
                tableName = "transactions",
                operation = MutationOperation.INSERT,
                rowData = mapOf("id" to "txn-1"),
                timestamp = Clock.System.now(),
            ),
        )
        assertEquals(2, queue.pendingCount())

        queue.dequeue("mut-1")
        assertEquals(1, queue.pendingCount())
    }

    @Test
    fun `mutation queue deduplicates by entity key`() = runTest {
        val queue = InMemoryMutationQueue()

        queue.enqueue(
            SyncMutation(
                id = "mut-1",
                tableName = "accounts",
                operation = MutationOperation.INSERT,
                rowData = mapOf("id" to "acc-1", "name" to "Original"),
                timestamp = Clock.System.now(),
            ),
        )

        // Same entity key (accounts:acc-1) — should replace, not add
        queue.enqueue(
            SyncMutation(
                id = "mut-2",
                tableName = "accounts",
                operation = MutationOperation.UPDATE,
                rowData = mapOf("id" to "acc-1", "name" to "Updated"),
                timestamp = Clock.System.now(),
            ),
        )

        assertEquals(1, queue.pendingCount())
        val pending = queue.allPending()
        assertEquals("mut-2", pending.first().id)
        assertEquals("Updated", pending.first().rowData["name"])
    }
}
