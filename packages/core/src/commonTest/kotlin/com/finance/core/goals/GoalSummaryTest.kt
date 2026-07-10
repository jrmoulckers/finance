// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals

/** Tests for [GoalTrackingEngine.summarize] (#3726). */
class GoalSummaryTest {

    @Test
    fun emptyListIsAllZero() {
        val summary = GoalTrackingEngine.summarize(emptyList())
        assertEquals(Cents.ZERO, summary.totalSaved)
        assertEquals(Cents.ZERO, summary.totalTarget)
        assertEquals(Cents.ZERO, summary.remaining)
        assertEquals(0, summary.progressPermille)
        assertEquals(0, summary.activeCount)
        assertEquals(0, summary.completedCount)
        assertEquals(0, summary.totalCount)
    }

    @Test
    fun singleGoal() {
        val goal = TestFixtures.createGoal(targetAmount = Cents(100_000), currentAmount = Cents(25_000))
        val summary = GoalTrackingEngine.summarize(listOf(goal))
        assertEquals(Cents(25_000), summary.totalSaved)
        assertEquals(Cents(100_000), summary.totalTarget)
        assertEquals(Cents(75_000), summary.remaining)
        assertEquals(250, summary.progressPermille)
        assertEquals(1, summary.activeCount)
        assertEquals(1, summary.totalCount)
    }

    @Test
    fun mixedStatusesCountedAndTotaled() {
        val active = TestFixtures.createGoal(
            targetAmount = Cents(100_000),
            currentAmount = Cents(40_000),
            status = GoalStatus.ACTIVE,
        )
        val completed = TestFixtures.createGoal(
            targetAmount = Cents(50_000),
            currentAmount = Cents(50_000),
            status = GoalStatus.COMPLETED,
        )
        val paused = TestFixtures.createGoal(
            targetAmount = Cents(20_000),
            currentAmount = Cents(10_000),
            status = GoalStatus.PAUSED,
        )
        val cancelled = TestFixtures.createGoal(
            targetAmount = Cents(999_999),
            currentAmount = Cents(999_999),
            status = GoalStatus.CANCELLED,
        )
        val summary = GoalTrackingEngine.summarize(listOf(active, completed, paused, cancelled))

        // Cancelled excluded from totals: saved = 40k+50k+10k, target = 100k+50k+20k.
        assertEquals(Cents(100_000), summary.totalSaved)
        assertEquals(Cents(170_000), summary.totalTarget)
        assertEquals(Cents(70_000), summary.remaining)
        assertEquals(588, summary.progressPermille) // 100000*1000/170000 floored
        assertEquals(1, summary.activeCount)
        assertEquals(1, summary.completedCount)
        assertEquals(4, summary.totalCount) // all non-deleted counted
    }

    @Test
    fun deletedGoalsExcludedEntirely() {
        val active = TestFixtures.createGoal(targetAmount = Cents(100_000), currentAmount = Cents(50_000))
        val deleted = active.copy(deletedAt = TestFixtures.fixedInstant)
        val summary = GoalTrackingEngine.summarize(listOf(active, deleted))
        assertEquals(Cents(50_000), summary.totalSaved)
        assertEquals(1, summary.totalCount)
    }

    @Test
    fun overFundedGoalClampedInPermille() {
        val overFunded = TestFixtures.createGoal(targetAmount = Cents(100_000), currentAmount = Cents(150_000))
        val summary = GoalTrackingEngine.summarize(listOf(overFunded))
        assertEquals(1000, summary.progressPermille)
        assertEquals(Cents.ZERO, summary.remaining)
    }

    @Test
    fun zeroTargetGuardedInPermille() {
        // Only a cancelled goal -> totals are zero, permille must not divide by zero.
        val cancelled = TestFixtures.createGoal(
            targetAmount = Cents(100_000),
            currentAmount = Cents(50_000),
            status = GoalStatus.CANCELLED,
        )
        val summary = GoalTrackingEngine.summarize(listOf(cancelled))
        assertEquals(0, summary.progressPermille)
        assertEquals(Cents.ZERO, summary.totalTarget)
        assertEquals(1, summary.totalCount)
    }
}
