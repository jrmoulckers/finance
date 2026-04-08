// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.desktop.data.repository.GoalRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.flow.*
import kotlinx.datetime.Clock

class InMemoryGoalRepository : GoalRepository {
    private val store = MutableStateFlow(createSampleGoals())
    override fun observeAll(householdId: SyncId) = store.map { it.filter { g -> g.deletedAt == null } }
    override fun observeActive(householdId: SyncId) = store.map { it.filter { g -> g.deletedAt == null && g.status == GoalStatus.ACTIVE } }
    override suspend fun updateProgress(id: SyncId, currentAmount: Cents) {
        val now = Clock.System.now(); store.update { l -> l.map { if (it.id == id) it.copy(currentAmount = currentAmount, updatedAt = now) else it } }
    }
}

private fun createSampleGoals(): List<Goal> {
    val now = Clock.System.now(); val hid = SyncId("d1")
    return listOf(
        Goal(SyncId("g1"), hid, "Emergency Fund", Cents(1000000), Cents(850000), Currency.USD, createdAt = now, updatedAt = now),
        Goal(SyncId("g2"), hid, "Vacation", Cents(300000), Cents(120000), Currency.USD, createdAt = now, updatedAt = now),
    )
}
