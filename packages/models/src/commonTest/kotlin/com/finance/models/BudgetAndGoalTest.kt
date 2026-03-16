// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [Budget] and [Goal] data classes — validation, defaults, and computed properties.
 */
class BudgetAndGoalTest {

    private val now = Instant.parse("2024-01-15T12:00:00Z")
    private val householdId = SyncId("household-1")
    private val categoryId = SyncId("category-1")

    // ══════════════════════════════════════════════════════════════════════
    //  Budget
    // ══════════════════════════════════════════════════════════════════════

    private fun budget(
        name: String = "Groceries",
        amount: Cents = Cents(50000L),
        period: BudgetPeriod = BudgetPeriod.MONTHLY,
    ) = Budget(
        id = SyncId("budget-1"),
        householdId = householdId,
        categoryId = categoryId,
        name = name,
        amount = amount,
        currency = Currency.USD,
        period = period,
        startDate = LocalDate.parse("2024-01-01"),
        createdAt = now,
        updatedAt = now,
    )

    @Test
    fun createValidBudget() {
        val b = budget()
        assertEquals("Groceries", b.name)
        assertEquals(Cents(50000L), b.amount)
        assertEquals(BudgetPeriod.MONTHLY, b.period)
    }

    @Test
    fun rejectBlankBudgetName() {
        assertFailsWith<IllegalArgumentException> { budget(name = "") }
    }

    @Test
    fun rejectWhitespaceBudgetName() {
        assertFailsWith<IllegalArgumentException> { budget(name = "   ") }
    }

    @Test
    fun rejectZeroBudgetAmount() {
        assertFailsWith<IllegalArgumentException> { budget(amount = Cents.ZERO) }
    }

    @Test
    fun rejectNegativeBudgetAmount() {
        assertFailsWith<IllegalArgumentException> { budget(amount = Cents(-100L)) }
    }

    @Test
    fun budgetDefaultEndDateIsNull() {
        assertNull(budget().endDate)
    }

    @Test
    fun budgetDefaultIsRolloverIsFalse() {
        assertFalse(budget().isRollover)
    }

    @Test
    fun budgetDefaultSyncVersionIsZero() {
        assertEquals(0L, budget().syncVersion)
    }

    @Test
    fun budgetDefaultIsSyncedIsFalse() {
        assertFalse(budget().isSynced)
    }

    @Test
    fun allBudgetPeriodsExist() {
        val periods = BudgetPeriod.entries
        assertEquals(5, periods.size)
        assertTrue(periods.contains(BudgetPeriod.WEEKLY))
        assertTrue(periods.contains(BudgetPeriod.BIWEEKLY))
        assertTrue(periods.contains(BudgetPeriod.MONTHLY))
        assertTrue(periods.contains(BudgetPeriod.QUARTERLY))
        assertTrue(periods.contains(BudgetPeriod.YEARLY))
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Goal
    // ══════════════════════════════════════════════════════════════════════

    private fun goal(
        name: String = "Emergency Fund",
        targetAmount: Cents = Cents(1000000L),
        currentAmount: Cents = Cents.ZERO,
        status: GoalStatus = GoalStatus.ACTIVE,
    ) = Goal(
        id = SyncId("goal-1"),
        householdId = householdId,
        name = name,
        targetAmount = targetAmount,
        currentAmount = currentAmount,
        currency = Currency.USD,
        status = status,
        createdAt = now,
        updatedAt = now,
    )

    @Test
    fun createValidGoal() {
        val g = goal()
        assertEquals("Emergency Fund", g.name)
        assertEquals(Cents(1000000L), g.targetAmount)
        assertEquals(Cents.ZERO, g.currentAmount)
    }

    @Test
    fun rejectBlankGoalName() {
        assertFailsWith<IllegalArgumentException> { goal(name = "") }
    }

    @Test
    fun rejectWhitespaceGoalName() {
        assertFailsWith<IllegalArgumentException> { goal(name = "   ") }
    }

    @Test
    fun rejectZeroTargetAmount() {
        assertFailsWith<IllegalArgumentException> { goal(targetAmount = Cents.ZERO) }
    }

    @Test
    fun rejectNegativeTargetAmount() {
        assertFailsWith<IllegalArgumentException> { goal(targetAmount = Cents(-100L)) }
    }

    @Test
    fun goalDefaultStatusIsActive() {
        assertEquals(GoalStatus.ACTIVE, goal().status)
    }

    @Test
    fun goalDefaultCurrentAmountIsZero() {
        assertEquals(Cents.ZERO, goal().currentAmount)
    }

    @Test
    fun goalDefaultTargetDateIsNull() {
        assertNull(goal().targetDate)
    }

    @Test
    fun allGoalStatusesExist() {
        val statuses = GoalStatus.entries
        assertEquals(4, statuses.size)
        assertTrue(statuses.contains(GoalStatus.ACTIVE))
        assertTrue(statuses.contains(GoalStatus.PAUSED))
        assertTrue(statuses.contains(GoalStatus.COMPLETED))
        assertTrue(statuses.contains(GoalStatus.CANCELLED))
    }

    // ── Progress ────────────────────────────────────────────────────────

    @Test
    fun progressAtZero() {
        val g = goal(currentAmount = Cents.ZERO)
        assertEquals(0.0, g.progress)
    }

    @Test
    fun progressAtHalf() {
        val g = goal(
            targetAmount = Cents(1000L),
            currentAmount = Cents(500L),
        )
        assertEquals(0.5, g.progress)
    }

    @Test
    fun progressAtFull() {
        val g = goal(
            targetAmount = Cents(1000L),
            currentAmount = Cents(1000L),
        )
        assertEquals(1.0, g.progress)
    }

    @Test
    fun progressClampedAtOneWhenOverTarget() {
        val g = goal(
            targetAmount = Cents(1000L),
            currentAmount = Cents(1500L),
        )
        assertEquals(1.0, g.progress) // clamped
    }

    @Test
    fun progressClampedAtZeroWhenNegativeCurrent() {
        val g = goal(
            targetAmount = Cents(1000L),
            currentAmount = Cents(-100L),
        )
        assertEquals(0.0, g.progress) // clamped
    }

    @Test
    fun progressAtQuarter() {
        val g = goal(
            targetAmount = Cents(10000L),
            currentAmount = Cents(2500L),
        )
        assertEquals(0.25, g.progress)
    }

    // ── isComplete ──────────────────────────────────────────────────────

    @Test
    fun isCompleteWhenCurrentEqualsTarget() {
        val g = goal(
            targetAmount = Cents(1000L),
            currentAmount = Cents(1000L),
        )
        assertTrue(g.isComplete)
    }

    @Test
    fun isCompleteWhenCurrentExceedsTarget() {
        val g = goal(
            targetAmount = Cents(1000L),
            currentAmount = Cents(1500L),
        )
        assertTrue(g.isComplete)
    }

    @Test
    fun isNotCompleteWhenBelowTarget() {
        val g = goal(
            targetAmount = Cents(1000L),
            currentAmount = Cents(999L),
        )
        assertFalse(g.isComplete)
    }

    @Test
    fun isNotCompleteAtZero() {
        assertFalse(goal().isComplete)
    }
}
