// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals

/** Tests for [GoalTrackingEngine.prioritize] (#3721). */
class GoalPrioritizeTest {

    private val asOf = LocalDate(2024, 1, 1)

    @Test
    fun datedGoalsSortByNearestDeadlineFirst() {
        val later = TestFixtures.createGoal(id = SyncId("later"), targetDate = LocalDate(2024, 3, 1))
        val sooner = TestFixtures.createGoal(id = SyncId("sooner"), targetDate = LocalDate(2024, 2, 1))
        val ordered = GoalTrackingEngine.prioritize(listOf(later, sooner), asOf)
        assertEquals(listOf(SyncId("sooner"), SyncId("later")), ordered.map { it.id })
    }

    @Test
    fun undatedGoalsSortAfterDatedOnes() {
        val dated = TestFixtures.createGoal(id = SyncId("dated"), targetDate = LocalDate(2024, 6, 1))
        val undated = TestFixtures.createGoal(id = SyncId("undated"), targetDate = null)
        val ordered = GoalTrackingEngine.prioritize(listOf(undated, dated), asOf)
        assertEquals(listOf(SyncId("dated"), SyncId("undated")), ordered.map { it.id })
    }

    @Test
    fun undatedGoalsSortByHighestCompletionThenRemaining() {
        val nearlyDone = TestFixtures.createGoal(
            id = SyncId("nearly"),
            targetAmount = Cents(1000),
            currentAmount = Cents(800),
        )
        val fresh = TestFixtures.createGoal(
            id = SyncId("fresh"),
            targetAmount = Cents(1000),
            currentAmount = Cents.ZERO,
        )
        val ordered = GoalTrackingEngine.prioritize(listOf(fresh, nearlyDone), asOf)
        assertEquals(listOf(SyncId("nearly"), SyncId("fresh")), ordered.map { it.id })
    }

    @Test
    fun nonActiveGoalsExcluded() {
        val active = TestFixtures.createGoal(id = SyncId("active"), status = GoalStatus.ACTIVE)
        val paused = TestFixtures.createGoal(id = SyncId("paused"), status = GoalStatus.PAUSED)
        val completed = TestFixtures.createGoal(id = SyncId("completed"), status = GoalStatus.COMPLETED)
        val cancelled = TestFixtures.createGoal(id = SyncId("cancelled"), status = GoalStatus.CANCELLED)
        val ordered = GoalTrackingEngine.prioritize(listOf(active, paused, completed, cancelled), asOf)
        assertEquals(listOf(SyncId("active")), ordered.map { it.id })
    }

    @Test
    fun deletedGoalsExcluded() {
        val active = TestFixtures.createGoal(id = SyncId("active"))
        val deleted = active.copy(id = SyncId("deleted"), deletedAt = TestFixtures.fixedInstant)
        val ordered = GoalTrackingEngine.prioritize(listOf(active, deleted), asOf)
        assertEquals(listOf(SyncId("active")), ordered.map { it.id })
    }

    @Test
    fun tiesBrokenStablyByGoalId() {
        val y = TestFixtures.createGoal(
            id = SyncId("y"),
            targetAmount = Cents(1000),
            currentAmount = Cents(500),
            targetDate = LocalDate(2024, 5, 1),
        )
        val x = TestFixtures.createGoal(
            id = SyncId("x"),
            targetAmount = Cents(1000),
            currentAmount = Cents(500),
            targetDate = LocalDate(2024, 5, 1),
        )
        val ordered = GoalTrackingEngine.prioritize(listOf(y, x), asOf)
        assertEquals(listOf(SyncId("x"), SyncId("y")), ordered.map { it.id })
    }

    @Test
    fun largerRemainingFundedFirstWhenCompletionEqual() {
        val big = TestFixtures.createGoal(
            id = SyncId("big"),
            targetAmount = Cents(2000),
            currentAmount = Cents.ZERO,
        )
        val small = TestFixtures.createGoal(
            id = SyncId("small"),
            targetAmount = Cents(1000),
            currentAmount = Cents.ZERO,
        )
        val ordered = GoalTrackingEngine.prioritize(listOf(small, big), asOf)
        assertEquals(listOf(SyncId("big"), SyncId("small")), ordered.map { it.id })
    }
}
