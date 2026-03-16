// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Base contract for all entity repositories.
 *
 * Provides CRUD operations, Flow-based observation, and sync-related
 * queries that every domain entity requires. All queries automatically
 * exclude soft-deleted records (where `deletedAt` is non-null) unless
 * otherwise noted.
 *
 * @param T The domain model type managed by this repository.
 */
interface BaseRepository<T> {

    /**
     * Observes all non-deleted entities belonging to a household.
     *
     * @param householdId The household whose entities to observe.
     * @return A [Flow] emitting the latest list whenever the data changes.
     */
    fun observeAll(householdId: SyncId): Flow<List<T>>

    /**
     * Observes a single entity by its unique ID.
     *
     * Emits `null` if the entity does not exist or has been soft-deleted.
     *
     * @param id The entity's [SyncId].
     * @return A [Flow] emitting the entity or `null`.
     */
    fun observeById(id: SyncId): Flow<T?>

    /**
     * Fetches a single entity by ID, or `null` if not found / soft-deleted.
     *
     * @param id The entity's [SyncId].
     */
    suspend fun getById(id: SyncId): T?

    /**
     * Inserts a new entity. If an entity with the same ID already exists,
     * the behaviour is implementation-defined (replace or throw).
     *
     * @param entity The entity to insert.
     */
    suspend fun insert(entity: T)

    /**
     * Updates an existing entity. The entity is matched by its [SyncId].
     *
     * @param entity The updated entity.
     */
    suspend fun update(entity: T)

    /**
     * Soft-deletes an entity by setting its `deletedAt` timestamp.
     *
     * The record is retained for sync purposes but excluded from
     * normal queries.
     *
     * @param id The entity's [SyncId].
     */
    suspend fun delete(id: SyncId)

    /**
     * Returns all entities that have local modifications not yet
     * synchronised to the server (`isSynced == false`).
     *
     * This includes soft-deleted records so the server can process
     * the deletion.
     *
     * @param householdId The household to query.
     */
    suspend fun getUnsynced(householdId: SyncId): List<T>

    /**
     * Marks the given entities as synchronised (`isSynced = true`).
     *
     * Called by the sync engine after a successful push.
     *
     * @param ids The IDs of the entities to mark.
     */
    suspend fun markSynced(ids: List<SyncId>)
}
