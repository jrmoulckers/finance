// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.debt

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Unit tests for [DebtPayoffPlanner] — the deterministic joint debt simulator (#2153).
 *
 * Money is represented in [Cents] (Long) throughout, so results are exact and
 * reproducible on any machine with no floating-point drift.
 */
class DebtPayoffPlannerTest {

    private fun debt(
        id: String,
        balanceCents: Long,
        aprBps: Int,
        minCents: Long,
    ) = CoupleDebt(
        id = id,
        name = "Debt $id",
        balance = Cents(balanceCents),
        aprBasisPoints = aprBps,
        minimumPayment = Cents(minCents),
        ownership = DebtOwnership.SHARED,
    )

    @Test
    fun `empty debts is instantly debt free`() {
        val plan = DebtPayoffPlanner.simulate(emptyList(), Cents(10_000), PayoffStrategy.AVALANCHE)
        assertEquals(0, plan.monthsToDebtFree)
        assertEquals(Cents.ZERO, plan.totalInterest)
        assertTrue(plan.completed)
    }

    @Test
    fun `single zero-interest debt pays off by principal over minimums`() {
        // $1,000 at 0% APR, $100/month minimum, no extra -> 10 months, no interest.
        val debts = listOf(debt("a", 100_000, 0, 10_000))
        val plan = DebtPayoffPlanner.simulate(debts, Cents.ZERO, PayoffStrategy.SNOWBALL)
        assertEquals(10, plan.monthsToDebtFree)
        assertEquals(Cents.ZERO, plan.totalInterest)
        assertTrue(plan.completed)
    }

    @Test
    fun `extra payment clears debt faster`() {
        val debts = listOf(debt("a", 100_000, 0, 10_000))
        val base = DebtPayoffPlanner.simulate(debts, Cents.ZERO, PayoffStrategy.SNOWBALL)
        val boosted = DebtPayoffPlanner.simulate(debts, Cents(10_000), PayoffStrategy.SNOWBALL)
        assertTrue(boosted.monthsToDebtFree < base.monthsToDebtFree)
    }

    @Test
    fun `avalanche pays no more interest than snowball`() {
        val debts = listOf(
            debt("card", 200_000, 2400, 4_000), // $2,000 @ 24%
            debt("loan", 500_000, 600, 10_000), // $5,000 @ 6%
        )
        val comparison = DebtPayoffPlanner.compare(debts, Cents(30_000))
        assertTrue(
            comparison.avalanche.totalInterest.amount <= comparison.snowball.totalInterest.amount,
            "Avalanche interest ${comparison.avalanche.totalInterest.amount} " +
                "should be <= snowball ${comparison.snowball.totalInterest.amount}",
        )
        assertTrue(comparison.interestSavedWithAvalanche.amount >= 0L)
    }

    @Test
    fun `avalanche prioritises the highest-APR debt first`() {
        val debts = listOf(
            debt("low", 300_000, 500, 5_000), // 5%
            debt("high", 300_000, 2500, 5_000), // 25%
        )
        val plan = DebtPayoffPlanner.simulate(debts, Cents(50_000), PayoffStrategy.AVALANCHE)
        val highPayoff = plan.order.first { it.debtId == "high" }.payoffMonth
        val lowPayoff = plan.order.first { it.debtId == "low" }.payoffMonth
        assertTrue(highPayoff <= lowPayoff, "Highest-APR debt should be cleared first")
    }

    @Test
    fun `snowball prioritises the smallest balance first`() {
        val debts = listOf(
            debt("big", 500_000, 1000, 5_000),
            debt("small", 100_000, 1000, 5_000),
        )
        val plan = DebtPayoffPlanner.simulate(debts, Cents(50_000), PayoffStrategy.SNOWBALL)
        val smallPayoff = plan.order.first { it.debtId == "small" }.payoffMonth
        val bigPayoff = plan.order.first { it.debtId == "big" }.payoffMonth
        assertTrue(smallPayoff <= bigPayoff, "Smallest balance should be cleared first")
    }

    @Test
    fun `interest accrues on a carried balance`() {
        val debts = listOf(debt("a", 100_000, 1200, 10_000))
        val plan = DebtPayoffPlanner.simulate(debts, Cents.ZERO, PayoffStrategy.AVALANCHE)
        assertTrue(plan.totalInterest.amount > 0L, "A carried APR balance must accrue interest")
        assertTrue(plan.completed)
    }

    @Test
    fun `months saved by adding is non-negative and increases speed`() {
        val debts = listOf(debt("a", 300_000, 1800, 6_000))
        val saved = DebtPayoffPlanner.monthsSavedByAdding(
            debts = debts,
            currentExtra = Cents.ZERO,
            reallocated = Cents(20_000),
            strategy = PayoffStrategy.AVALANCHE,
        )
        assertTrue(saved >= 0)
        assertTrue(saved > 0, "Reallocating money to debt should save at least a month")
    }

    @Test
    fun `negative balance is rejected`() {
        assertFailsWith<IllegalArgumentException> {
            debt("bad", -1L, 0, 0)
        }
    }
}
