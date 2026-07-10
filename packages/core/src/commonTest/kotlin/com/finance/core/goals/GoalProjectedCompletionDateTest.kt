// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Tests for the public [GoalTrackingEngine.projectedCompletionDate] (#3681):
 * projecting when a goal will be fully funded from a contribution rate.
 */
class GoalProjectedCompletionDateTest {

    private val from = LocalDate(2024, 1, 1)

    @Test
    fun exactFit_returnsExactDate() {
        // $300 remaining, $10/day → exactly 30 days → Jan 31.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        assertEquals(
            LocalDate(2024, 1, 31),
            GoalTrackingEngine.projectedCompletionDate(goal, Cents(1000), ContributionPeriod.DAILY, from),
        )
    }

    @Test
    fun remainder_roundsUpToNextWholePeriod() {
        // $300 remaining, $7/day → ceil(42.857) = 43 days → Feb 13. The projection
        // never underestimates: 42 days would leave the goal a few cents short.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        assertEquals(
            LocalDate(2024, 2, 13),
            GoalTrackingEngine.projectedCompletionDate(goal, Cents(700), ContributionPeriod.DAILY, from),
        )
    }

    @Test
    fun accountsForExistingProgress() {
        // $250 already saved, $50 remaining, $10/day → 5 days → Jan 6.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents(25_000),
            targetDate = null,
        )
        assertEquals(
            LocalDate(2024, 1, 6),
            GoalTrackingEngine.projectedCompletionDate(goal, Cents(1000), ContributionPeriod.DAILY, from),
        )
    }

    @Test
    fun monthlyContribution_projectsMonths() {
        // $600 remaining, $100/month → 6 months → Jul 1.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(60_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        assertEquals(
            LocalDate(2024, 7, 1),
            GoalTrackingEngine.projectedCompletionDate(goal, Cents(10_000), ContributionPeriod.MONTHLY, from),
        )
    }

    @Test
    fun weeklyContribution_projectsWeeks() {
        // $200 remaining, $50/week → 4 weeks → Jan 29.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(20_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        assertEquals(
            LocalDate(2024, 1, 29),
            GoalTrackingEngine.projectedCompletionDate(goal, Cents(5000), ContributionPeriod.WEEKLY, from),
        )
    }

    @Test
    fun alreadyComplete_returnsNull() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents(30_000),
            targetDate = null,
        )
        assertNull(GoalTrackingEngine.projectedCompletionDate(goal, Cents(1000), ContributionPeriod.DAILY, from))
    }

    @Test
    fun overFunded_returnsNull() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents(45_000),
            targetDate = null,
        )
        assertNull(GoalTrackingEngine.projectedCompletionDate(goal, Cents(1000), ContributionPeriod.DAILY, from))
    }

    @Test
    fun zeroContribution_returnsNull() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        assertNull(GoalTrackingEngine.projectedCompletionDate(goal, Cents.ZERO, ContributionPeriod.DAILY, from))
    }

    @Test
    fun negativeContribution_returnsNull() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        assertNull(GoalTrackingEngine.projectedCompletionDate(goal, Cents(-1000), ContributionPeriod.DAILY, from))
    }

    @Test
    fun largeAmount_usesIntegerMathWithoutOverflow() {
        // $10,000,000,000 remaining at $1,000,000/day → 10,000 days. Exercises
        // large integer-cents division without precision loss or overflow.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(1_000_000_000_000L),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        val result = GoalTrackingEngine.projectedCompletionDate(
            goal, Cents(100_000_000), ContributionPeriod.DAILY, from,
        )
        // from + 10,000 days = 2051-05-19.
        assertEquals(LocalDate(2051, 5, 19), result)
    }
}
