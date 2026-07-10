// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Tests for #3690 — per-member attribution for shared/household budgets.
 */
class BudgetMemberBreakdownTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    private val alice = SyncId("owner-alice")
    private val bob = SyncId("owner-bob")
    private val carol = SyncId("owner-carol")

    @Test
    fun breakdown_multipleMembers_sumsReconcileWithTotal() {
        val budget = TestFixtures.createBudget(amount = Cents(50000), startDate = LocalDate(2024, 6, 1))
        val txns = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 5), ownerId = alice),
            TestFixtures.createExpense(amount = Cents(5000), date = LocalDate(2024, 6, 10), ownerId = alice),
            TestFixtures.createExpense(amount = Cents(8000), date = LocalDate(2024, 6, 12), ownerId = bob),
        )

        val breakdown = BudgetCalculator.calculateMemberBreakdown(budget, txns, LocalDate(2024, 6, 15))
        val status = BudgetCalculator.calculateStatus(budget, txns, LocalDate(2024, 6, 15))

        assertEquals(Cents(15000), breakdown.spendFor(alice))
        assertEquals(Cents(8000), breakdown.spendFor(bob))
        assertEquals(Cents(23000), breakdown.totalSpent)
        assertEquals(status.spent, breakdown.totalSpent, "member total reconciles with BudgetStatus.spent")

        val summed = breakdown.byMember.values.fold(Cents.ZERO) { acc, c -> acc + c }
        assertEquals(breakdown.totalSpent, summed, "per-member sums add up to the total")
    }

    @Test
    fun breakdown_singleMember() {
        val budget = TestFixtures.createBudget(amount = Cents(50000), startDate = LocalDate(2024, 6, 1))
        val txns = listOf(
            TestFixtures.createExpense(amount = Cents(12000), date = LocalDate(2024, 6, 5), ownerId = alice),
        )
        val breakdown = BudgetCalculator.calculateMemberBreakdown(budget, txns, LocalDate(2024, 6, 15))

        assertEquals(setOf(alice), breakdown.members)
        assertEquals(Cents(12000), breakdown.totalSpent)
    }

    @Test
    fun breakdown_noSpend_isEmpty() {
        val budget = TestFixtures.createBudget(amount = Cents(50000), startDate = LocalDate(2024, 6, 1))
        val breakdown = BudgetCalculator.calculateMemberBreakdown(budget, emptyList(), LocalDate(2024, 6, 15))

        assertTrue(breakdown.byMember.isEmpty())
        assertEquals(Cents.ZERO, breakdown.totalSpent)
        assertEquals(Cents.ZERO, breakdown.spendFor(carol), "absent member reads zero")
    }

    @Test
    fun breakdown_appliesSameFiltersAsStatus() {
        val budget = TestFixtures.createBudget(amount = Cents(50000), startDate = LocalDate(2024, 6, 1))
        val txns = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 5), ownerId = alice),
            // Deleted → excluded
            TestFixtures.createExpense(
                amount = Cents(9999), date = LocalDate(2024, 6, 6), ownerId = alice,
                deletedAt = TestFixtures.fixedInstant,
            ),
            // Out of period → excluded
            TestFixtures.createExpense(amount = Cents(7777), date = LocalDate(2024, 7, 1), ownerId = bob),
            // Income → excluded
            TestFixtures.createIncome(amount = Cents(20000), date = LocalDate(2024, 6, 7)),
        )
        val breakdown = BudgetCalculator.calculateMemberBreakdown(budget, txns, LocalDate(2024, 6, 15))

        assertEquals(Cents(10000), breakdown.totalSpent)
        assertEquals(setOf(alice), breakdown.members)
    }
}
