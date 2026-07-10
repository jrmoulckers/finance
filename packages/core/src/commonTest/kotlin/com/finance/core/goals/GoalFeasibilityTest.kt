// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Tests for [GoalTrackingEngine.feasibility] (#3734). */
class GoalFeasibilityTest {

    private val from = LocalDate(2024, 1, 1)

    @Test
    fun meetsExactly() {
        // Need $300 over 30 days at $10/day = exactly on target.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 1, 31),
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents(1000), ContributionPeriod.DAILY, from)
        assertTrue(result.willMeetDeadline)
        assertEquals(Cents(30_000), result.projectedAmountByDeadline)
        assertEquals(Cents.ZERO, result.shortfall)
        assertEquals(LocalDate(2024, 1, 31), result.projectedCompletionDate)
    }

    @Test
    fun meetsEarly() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 1, 31),
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents(2000), ContributionPeriod.DAILY, from)
        assertTrue(result.willMeetDeadline)
        assertEquals(Cents.ZERO, result.shortfall)
        assertTrue(result.projectedAmountByDeadline.amount >= 30_000)
        assertTrue(result.projectedCompletionDate!! < LocalDate(2024, 1, 31))
    }

    @Test
    fun fallsShort() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 1, 31),
        )
        // $5/day * 30 days = $150 projected, $150 short.
        val result = GoalTrackingEngine.feasibility(goal, Cents(500), ContributionPeriod.DAILY, from)
        assertFalse(result.willMeetDeadline)
        assertEquals(Cents(15_000), result.projectedAmountByDeadline)
        assertEquals(Cents(15_000), result.shortfall)
        assertTrue(result.projectedCompletionDate!! > LocalDate(2024, 1, 31))
    }

    @Test
    fun zeroContributionNeverCompletes() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents(5_000),
            targetDate = LocalDate(2024, 1, 31),
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents.ZERO, ContributionPeriod.DAILY, from)
        assertFalse(result.willMeetDeadline)
        assertEquals(Cents(5_000), result.projectedAmountByDeadline)
        assertEquals(Cents(25_000), result.shortfall)
        assertNull(result.projectedCompletionDate)
    }

    @Test
    fun noDeadlineWithPositiveContributionEventuallyCompletes() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents(1000), ContributionPeriod.DAILY, from)
        assertTrue(result.willMeetDeadline)
        assertEquals(Cents.ZERO, result.shortfall)
        // $300 / $10 per day = 30 days.
        assertEquals(LocalDate(2024, 1, 31), result.projectedCompletionDate)
    }

    @Test
    fun noDeadlineWithZeroContributionDoesNotComplete() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents.ZERO, ContributionPeriod.DAILY, from)
        assertFalse(result.willMeetDeadline)
        assertEquals(Cents(30_000), result.shortfall)
        assertNull(result.projectedCompletionDate)
    }

    @Test
    fun alreadyCompleteMeetsImmediately() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents(30_000),
            targetDate = LocalDate(2024, 1, 31),
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents(1000), ContributionPeriod.DAILY, from)
        assertTrue(result.willMeetDeadline)
        assertEquals(Cents.ZERO, result.shortfall)
        assertEquals(from, result.projectedCompletionDate)
    }

    @Test
    fun weeklyContributionProjection() {
        // 8 whole weeks between Jan 1 and Feb 28; $50/wk = $400.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(40_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 2, 28),
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents(5_000), ContributionPeriod.WEEKLY, from)
        assertEquals(Cents(40_000), result.projectedAmountByDeadline)
        assertTrue(result.willMeetDeadline)
    }

    @Test
    fun monthlyContributionProjection() {
        // 6 whole months Jan 1 -> Jul 1; $100/mo = $600.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(60_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 7, 1),
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents(10_000), ContributionPeriod.MONTHLY, from)
        assertEquals(Cents(60_000), result.projectedAmountByDeadline)
        assertTrue(result.willMeetDeadline)
    }

    @Test
    fun pastDueDeadlineProjectsNoPeriods() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents(10_000),
            targetDate = LocalDate(2023, 12, 1),
        )
        val result = GoalTrackingEngine.feasibility(goal, Cents(1000), ContributionPeriod.DAILY, from)
        assertFalse(result.willMeetDeadline)
        assertEquals(Cents(10_000), result.projectedAmountByDeadline)
        assertEquals(Cents(20_000), result.shortfall)
    }
}
