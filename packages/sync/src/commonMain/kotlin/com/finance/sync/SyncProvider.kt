package com.finance.sync

import kotlinx.coroutines.flow.Flow

/**
 * Abstraction over the sync backend (PowerSync initially, but swappable).
 *
 * Platform-specific or third-party SDK code should live behind an `actual`
 * implementation of this interface so the rest of the sync module stays
 * backend-agnostic.
 */
interface SyncProvider {

    /**
     * One-time initialisation. Called before any push/pull operations.
     * Implementations should set up internal state, open local databases, etc.
     */
    suspend fun initialize(config: SyncConfig)

    /**
     * Push a batch of local mutations to the sync backend.
     *
     * @return [Result.success] when all mutations were accepted, or
     *   [Result.failure] with the underlying error on partial/full failure.
     */
    suspend fun push(mutations: List<SyncMutation>): Result<Unit>

    /**
     * Returns a cold [Flow] of changes pulled from the sync backend.
     * Each emission is a batch of changes received in one pull cycle.
     */
    fun pull(): Flow<List<SyncChange>>

    /**
     * Observe the sync provider's status in real time.
     */
    fun getStatus(): Flow<SyncStatus>
}
