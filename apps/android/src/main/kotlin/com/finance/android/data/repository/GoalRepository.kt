// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Goal
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository contract for [Goal] entities.
 *
 * Extends [BaseRepository] with goal-specific queries such as
 * filtering active goals and updating savings progress.
 */
interface GoalRepository : BaseRepository<Goal> {

    /**
     * Observes all non-deleted goals with [Goal.status] of
     * [com.finance.models.GoalStatus.ACTIVE] for a household.
     *
     * @param householdId The household to scope the query to.
     */
    fun observeActive(householdId: SyncId): Flow<List<Goal>>

    /**
     * Updates the current saved amount for a goal.
     *
     * Marks the goal as unsynced so the change is pushed on the
     * next sync cycle.
     *
     * @param id The goal's [SyncId].
     * @param currentAmount The updated saved amount in [Cents].
     */
    suspend fun updateProgress(id: SyncId, currentAmount: Cents)
}
