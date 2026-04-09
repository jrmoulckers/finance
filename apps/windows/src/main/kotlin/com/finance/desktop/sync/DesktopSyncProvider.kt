// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.sync

import com.finance.sync.PullResult
import com.finance.sync.PushResult
import com.finance.sync.SyncChange
import com.finance.sync.SyncConfig
import com.finance.sync.SyncCredentials
import com.finance.sync.SyncMutation
import com.finance.sync.SyncProvider
import com.finance.sync.SyncStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import java.util.logging.Logger

/**
 * Desktop (JVM) implementation of [SyncProvider].
 *
 * Provides a functional sync provider for the Windows desktop client. This
 * implementation stores connection state and reports status but delegates actual
 * network operations to a future Ktor-based HTTP transport layer.
 *
 * The provider is designed to be instantiated by the Koin DI module and consumed
 * by [com.finance.sync.DefaultSyncEngine].
 *
 * ## Roadmap
 *
 * - **Phase 1 (current):** Functional shell — instantiable, state-aware, returns
 *   empty results. Enables the full sync engine lifecycle without a backend.
 * - **Phase 2:** Wire to Ktor OkHttp engine for real HTTP push/pull against the
 *   Finance sync backend (PowerSync).
 * - **Phase 3:** Add SQLite-backed mutation queue and sequence tracker for
 *   offline resilience.
 */
class DesktopSyncProvider : SyncProvider {

    private val logger: Logger = Logger.getLogger("DesktopSyncProvider")
    private val _status = MutableStateFlow<SyncStatus>(SyncStatus.Idle)

    override suspend fun initialize(config: SyncConfig) {
        logger.info("Initializing desktop sync provider for ${config.endpoint}")
        _status.value = SyncStatus.Idle
    }

    override suspend fun connect(credentials: SyncCredentials, config: SyncConfig) {
        logger.info("Desktop sync provider connecting to ${config.endpoint}")
        initialize(config)
        _status.value = SyncStatus.Connected
    }

    override suspend fun disconnect() {
        logger.info("Desktop sync provider disconnected")
        _status.value = SyncStatus.Disconnected
    }

    override suspend fun push(mutations: List<SyncMutation>): Result<Unit> {
        logger.fine("Push requested for ${mutations.size} mutation(s)")
        return Result.success(Unit)
    }

    override fun pull(): Flow<List<SyncChange>> = emptyFlow()

    override fun getStatus(): Flow<SyncStatus> = _status

    override suspend fun pullChanges(since: Map<String, Long>): PullResult {
        return PullResult(
            changes = emptyList(),
            newVersions = since,
            hasMore = false,
        )
    }

    override suspend fun pushMutations(mutations: List<SyncMutation>): PushResult {
        return PushResult(
            succeeded = mutations.map { it.id },
            failed = emptyList(),
        )
    }
}
