// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import kotlinx.coroutines.flow.Flow

/**
 * Base repository interface for all sync-enabled entities.
 *
 * Provides a uniform contract for CRUD + soft-delete + sync-flag
 * operations. All methods operate on domain model types (not raw DB rows).
 *
 * @param T The domain model type (e.g. [com.finance.models.Account]).
 */
interface BaseRepository<T> {

    /** Observe all non-deleted entities as a reactive [Flow]. */
    fun observeAll(): Flow<List<T>>

    /** Get a single entity by its primary key, or `null` if not found / soft-deleted. */
    suspend fun getById(id: String): T?

    /** Insert a new entity. Marks it as unsynced (`is_synced = 0`). */
    suspend fun insert(entity: T)

    /** Update an existing entity. Increments `sync_version` and marks as unsynced. */
    suspend fun update(entity: T)

    /** Soft-delete an entity by setting `deleted_at`. */
    suspend fun softDelete(id: String)

    /** Return all entities that have local changes not yet pushed to the server. */
    suspend fun getUnsynced(): List<T>

    /** Mark an entity as synced after successful push to the server. */
    suspend fun markSynced(id: String, syncVersion: Long)
}
