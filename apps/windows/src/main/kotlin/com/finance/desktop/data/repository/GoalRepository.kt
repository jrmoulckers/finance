// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import com.finance.models.Goal
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

interface GoalRepository {
    fun observeAll(householdId: SyncId): Flow<List<Goal>>
    fun observeActive(householdId: SyncId): Flow<List<Goal>>
    suspend fun updateProgress(id: SyncId, currentAmount: Cents)
}
