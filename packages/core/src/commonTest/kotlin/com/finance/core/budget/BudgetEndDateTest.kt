// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.BudgetPeriod
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Regression tests for #3632 — budget `endDate` must be honoured: status flags a
 * date outside the window and rollover chaining stops at `endDate`.
 */
class BudgetEndDateTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    // ── isActiveOn / isWithinBudgetDates ───────────────────────────────

    @Test
    fun isActiveOn_withinWindow_true() {
        val budget = TestFixtures.createBudget(
            startDate = LocalDate(2024, 1, 1),
            endDate = LocalDate(2024, 12, 31),
        )
        assertTrue(BudgetCalculator.isActiveOn(budget, LocalDate(2024, 6, 15)))
        assertTrue(BudgetCalculator.isActiveOn(budget, LocalDate(2024, 1, 1)))
        assertTrue(BudgetCalculator.isActiveOn(budget, LocalDate(2024, 12, 31)))
    }

    @Test
    fun isActiveOn_afterEndDate_false() {
        val budget = TestFixtures.createBudget(
            startDate = LocalDate(2024, 1, 1),
            endDate = LocalDate(2024, 6, 30),
        )
        assertFalse(BudgetCalculator.isActiveOn(budget, LocalDate(2024, 7, 1)))
    }

    @Test
    fun isActiveOn_beforeStartDate_false() {
        val budget = TestFixtures.createBudget(startDate = LocalDate(2024, 6, 1))
        assertFalse(BudgetCalculator.isActiveOn(budget, LocalDate(2024, 5, 31)))
    }

    @Test
    fun isActiveOn_nullEndDate_openEnded() {
        val budget = TestFixtures.createBudget(
            startDate = LocalDate(2024, 1, 1),
            endDate = null,
        )
        assertTrue(BudgetCalculator.isActiveOn(budget, LocalDate(2030, 1, 1)))
    }

    @Test
    fun calculateStatus_afterEndDate_flaggedInactive() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            endDate = LocalDate(2024, 6, 30),
        )
        val status = BudgetCalculator.calculateStatus(budget, emptyList(), LocalDate(2024, 9, 15))
        assertFalse(status.isWithinBudgetDates, "reference date after endDate is not active")
    }

    @Test
    fun calculateStatus_withinWindow_active() {
        val budget = TestFixtures.createBudget(
            startDate = LocalDate(2024, 1, 1),
            endDate = LocalDate(2024, 12, 31),
        )
        val status = BudgetCalculator.calculateStatus(budget, emptyList(), LocalDate(2024, 6, 15))
        assertTrue(status.isWithinBudgetDates)
    }

    @Test
    fun calculateStatus_nullEndDate_alwaysActive() {
        val budget = TestFixtures.createBudget(startDate = LocalDate(2024, 1, 1))
        val status = BudgetCalculator.calculateStatus(budget, emptyList(), LocalDate(2027, 3, 3))
        assertTrue(status.isWithinBudgetDates)
    }

    // ── Rollover chaining stops at endDate ─────────────────────────────

    @Test
    fun cumulativeRollover_doesNotExtendPastEndDate() {
        // Budget ends Feb 29; only Jan and Feb should contribute. A big surplus
        // is provided for a period after endDate which must be ignored.
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500/month
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            endDate = LocalDate(2024, 2, 29),
            isRollover = true,
        )
        val transactionsByPeriod = mapOf(
            LocalDate(2024, 1, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 1, 15)),
            ),
            LocalDate(2024, 2, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 2, 15)),
            ),
            // This period is entirely after endDate and must NOT be chained.
            LocalDate(2024, 3, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 3, 15)),
            ),
        )

        // Only Jan (+$100) and Feb (eff $600 - $300 = +$300) count → $300 into a later ref.
        val cumulative = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget = budget,
            transactionsByPeriod = transactionsByPeriod,
            referenceDate = LocalDate(2024, 6, 15),
        )
        assertEquals(Cents(30000), cumulative, "periods after endDate are excluded from chaining")
    }

    @Test
    fun cumulativeRollover_openEnded_chainsNormally() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
            endDate = null,
            isRollover = true,
        )
        val transactionsByPeriod = mapOf(
            LocalDate(2024, 1, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 1, 15)),
            ),
            LocalDate(2024, 2, 1) to listOf(
                TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 2, 15)),
            ),
        )
        val cumulative = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget = budget,
            transactionsByPeriod = transactionsByPeriod,
            referenceDate = LocalDate(2024, 3, 15),
        )
        assertEquals(Cents(30000), cumulative)
    }
}
