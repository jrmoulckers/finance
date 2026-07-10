// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.goals

import com.finance.core.TestFixtures
import com.finance.models.GoalStatus
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** Tests for [GoalTrackingEngine.requiredContribution] (#3689). */
class GoalRequiredContributionTest {

    private val from = LocalDate(2024, 1, 1)

    @Test
    fun exactDivision_perPeriodIsExact() {
        // Need $300 over 3 whole months → exactly $100/month.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(30_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 4, 1),
        )
        val required = GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from)
        assertEquals(Cents(10_000), required)
    }

    @Test
    fun remainderRoundsUp_scheduleNeverFallsShort() {
        // Need $100 over 3 whole months → ceil(10000/3) = 3334/month.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(10_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 4, 1),
        )
        val required = GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from)
        assertEquals(Cents(3_334), required)
        // Applying it each of the 3 periods reaches or exceeds the target.
        assertTrue(required.amount * 3 >= 10_000)
    }

    @Test
    fun accountsForCurrentAmount() {
        // Target $500, already saved $200 → remaining $300 over 3 months = $100.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(50_000),
            currentAmount = Cents(20_000),
            targetDate = LocalDate(2024, 4, 1),
        )
        val required = GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from)
        assertEquals(Cents(10_000), required)
    }

    @Test
    fun completeGoal_returnsZero() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(10_000),
            currentAmount = Cents(10_000),
            targetDate = LocalDate(2024, 4, 1),
            status = GoalStatus.ACTIVE,
        )
        assertEquals(Cents.ZERO, GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from))
    }

    @Test
    fun overfundedGoal_returnsZero() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(10_000),
            currentAmount = Cents(12_000),
            targetDate = LocalDate(2024, 4, 1),
        )
        assertEquals(Cents.ZERO, GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from))
    }

    @Test
    fun singlePeriodRemaining_requiresFullRemaining() {
        // Exactly one whole week between from and deadline.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(25_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 1, 8),
        )
        val required = GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.WEEKLY, from)
        assertEquals(Cents(25_000), required)
    }

    @Test
    fun lessThanOnePeriodRemaining_requiresFullRemaining() {
        // 3 days before deadline but weekly cadence → still need it all in one contribution.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(25_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 1, 4),
        )
        val required = GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.WEEKLY, from)
        assertEquals(Cents(25_000), required)
    }

    @Test
    fun weeklyExactDivision() {
        // Need $280 over 4 whole weeks → $70/week.
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(28_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2024, 1, 29), // 28 days = 4 weeks
        )
        val required = GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.WEEKLY, from)
        assertEquals(Cents(7_000), required)
    }

    @Test
    fun nullTargetDate_throws() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(10_000),
            currentAmount = Cents.ZERO,
            targetDate = null,
        )
        assertFailsWith<IllegalArgumentException> {
            GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from)
        }
    }

    @Test
    fun targetDateInPast_throws() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(10_000),
            currentAmount = Cents.ZERO,
            targetDate = LocalDate(2023, 12, 1),
        )
        assertFailsWith<IllegalArgumentException> {
            GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from)
        }
    }

    @Test
    fun targetDateEqualsFrom_throws() {
        val goal = TestFixtures.createGoal(
            targetAmount = Cents(10_000),
            currentAmount = Cents.ZERO,
            targetDate = from,
        )
        assertFailsWith<IllegalArgumentException> {
            GoalTrackingEngine.requiredContribution(goal, ContributionPeriod.MONTHLY, from)
        }
    }
}
