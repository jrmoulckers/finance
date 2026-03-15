// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Goal
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository for [Goal] entities.
 *
 * Provides reactive read streams via [Flow] and suspend write operations.
 */
interface GoalRepository {

    /** Observe all non-deleted goals. */
    fun getAll(): Flow<List<Goal>>

    /** Observe a single goal by its [SyncId], or `null` if not found. */
    fun getById(id: SyncId): Flow<Goal?>

    /** Observe goals whose [Goal.status] is [GoalStatus.ACTIVE]. */
    fun getActiveGoals(): Flow<List<Goal>>

    /** Insert a new goal. */
    suspend fun create(goal: Goal)

    /** Update an existing goal. */
    suspend fun update(goal: Goal)

    /**
     * Update only the [Goal.currentAmount] for a given goal.
     *
     * @param id The goal's [SyncId].
     * @param currentAmount The new progress amount in [Cents].
     */
    suspend fun updateProgress(id: SyncId, currentAmount: Cents)

    /** Soft-delete a goal by its [SyncId]. */
    suspend fun delete(id: SyncId)
}
