// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.BudgetPeriod
import com.finance.models.Transaction
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Tests for #3649 (rollover cap/floor policy) and #3653 (reconciling
 * single-period `calculateEffectiveBudget` with the cumulative chain).
 */
class BudgetRolloverPolicyTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    private fun monthlyRollover() = TestFixtures.createBudget(
        amount = Cents(50000), // $500/month
        period = BudgetPeriod.MONTHLY,
        startDate = LocalDate(2024, 1, 1),
        isRollover = true,
    )

    // ── #3653: single-period vs cumulative reconciliation ──────────────

    @Test
    fun reconcile_singlePeriodOld_effectiveMatchesCumulative() {
        val budget = monthlyRollover()
        val janTxns = listOf(TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 1, 15)))

        // Reference February → exactly one prior period (January).
        val single = BudgetRolloverCalculator.calculateEffectiveBudget(
            budget = budget,
            currentPeriodTransactions = emptyList(),
            previousPeriodTransactions = janTxns,
            referenceDate = LocalDate(2024, 2, 15),
        )
        val cumulative = BudgetRolloverCalculator.effectiveBudgetCumulative(
            budget = budget,
            transactionsByPeriod = mapOf(LocalDate(2024, 1, 1) to janTxns),
            referenceDate = LocalDate(2024, 2, 15),
        )

        assertEquals(single.rolloverCarry, cumulative.rolloverCarry, "agree for a one-period-old budget")
        assertEquals(single.effectiveAmount, cumulative.effectiveAmount)
        assertEquals(Cents(10000), cumulative.rolloverCarry)
    }

    @Test
    fun reconcile_multiPeriod_cumulativeEffectiveMatchesCumulativeCarry() {
        val budget = monthlyRollover()
        val txnsByPeriod = mapOf(
            LocalDate(2024, 1, 1) to listOf(TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 1, 15))),
            LocalDate(2024, 2, 1) to listOf(TestFixtures.createExpense(amount = Cents(30000), date = LocalDate(2024, 2, 15))),
        )
        val carry = BudgetRolloverCalculator.calculateCumulativeRollover(budget, txnsByPeriod, LocalDate(2024, 3, 15))
        val effective = BudgetRolloverCalculator.effectiveBudgetCumulative(budget, txnsByPeriod, LocalDate(2024, 3, 15))

        // Jan +$100 → Feb eff $600 - $300 = +$300.
        assertEquals(Cents(30000), carry)
        assertEquals(carry, effective.rolloverCarry, "cumulative effective uses the chained carry")
        assertEquals(Cents(80000), effective.effectiveAmount, "$500 base + $300 carry")
    }

    // ── #3649: RolloverPolicy floor / cap ──────────────────────────────

    @Test
    fun policy_default_isUnlimited_preservesBehaviour() {
        val budget = monthlyRollover()
        val txnsByPeriod = mapOf(
            LocalDate(2024, 1, 1) to listOf(TestFixtures.createExpense(amount = Cents(70000), date = LocalDate(2024, 1, 15))),
            LocalDate(2024, 2, 1) to listOf(TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 2, 15))),
        )
        val defaultCarry = BudgetRolloverCalculator.calculateCumulativeRollover(budget, txnsByPeriod, LocalDate(2024, 3, 15))
        val explicitUnlimited = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget, txnsByPeriod, LocalDate(2024, 3, 15), RolloverPolicy.UNLIMITED,
        )
        // Jan -$200 → Feb eff $300 - $100 = +$200.
        assertEquals(Cents(20000), defaultCarry)
        assertEquals(defaultCarry, explicitUnlimited)
    }

    @Test
    fun policy_resetNegative_floorsOverspendAtZero() {
        val budget = monthlyRollover()
        val txnsByPeriod = mapOf(
            // Jan overspend by $200 → raw carry -$200, reset to $0.
            LocalDate(2024, 1, 1) to listOf(TestFixtures.createExpense(amount = Cents(70000), date = LocalDate(2024, 1, 15))),
            // Feb eff $500 (carry reset), spent $100 → +$400.
            LocalDate(2024, 2, 1) to listOf(TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 2, 15))),
        )
        val carry = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget, txnsByPeriod, LocalDate(2024, 3, 15), RolloverPolicy.RESET_NEGATIVE,
        )
        assertEquals(Cents(40000), carry, "one bad month does not bury the next")
    }

    @Test
    fun policy_capAtBase_capsPositiveCarry() {
        val budget = monthlyRollover()
        val txnsByPeriod = mapOf(
            // Jan spent nothing → raw carry +$500, capped at base $500.
            LocalDate(2024, 1, 1) to emptyList<Transaction>(),
            // Feb eff $1000 raw, but carry capped again at base $500.
            LocalDate(2024, 2, 1) to emptyList<Transaction>(),
        )
        val carry = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget, txnsByPeriod, LocalDate(2024, 3, 15), RolloverPolicy.CAP_AT_BASE,
        )
        assertEquals(Cents(50000), carry, "savings carry capped at one month's base")
    }

    @Test
    fun policy_capAtBase_floorsNegativeAtNegativeBase() {
        val budget = monthlyRollover()
        val txnsByPeriod = mapOf(
            // Jan overspend by $1000 → raw -$1000, floored at -base = -$500.
            LocalDate(2024, 1, 1) to listOf(TestFixtures.createExpense(amount = Cents(150000), date = LocalDate(2024, 1, 15))),
        )
        val carry = BudgetRolloverCalculator.calculateCumulativeRollover(
            budget, txnsByPeriod, LocalDate(2024, 2, 15), RolloverPolicy.CAP_AT_BASE,
        )
        assertEquals(Cents(-50000), carry)
    }

    @Test
    fun policy_appliesToSinglePeriodEffective() {
        val budget = monthlyRollover()
        // Previous period overspent by $200.
        val prev = listOf(TestFixtures.createExpense(amount = Cents(70000), date = LocalDate(2024, 1, 15)))
        val reset = BudgetRolloverCalculator.calculateEffectiveBudget(
            budget = budget,
            currentPeriodTransactions = emptyList(),
            previousPeriodTransactions = prev,
            referenceDate = LocalDate(2024, 2, 15),
            policy = RolloverPolicy.RESET_NEGATIVE,
        )
        assertEquals(Cents.ZERO, reset.rolloverCarry, "negative carry reset to zero")
        assertEquals(Cents(50000), reset.effectiveAmount)
    }

    // ── RolloverPolicy.apply unit checks ───────────────────────────────

    @Test
    fun rolloverPolicy_apply_matrix() {
        val base = Cents(500)
        assertEquals(Cents(-200), RolloverPolicy.UNLIMITED.apply(Cents(-200), base))
        assertEquals(Cents.ZERO, RolloverPolicy.RESET_NEGATIVE.apply(Cents(-200), base))
        assertEquals(Cents(200), RolloverPolicy.RESET_NEGATIVE.apply(Cents(200), base))
        assertEquals(Cents(500), RolloverPolicy.CAP_AT_BASE.apply(Cents(800), base))
        assertEquals(Cents(-500), RolloverPolicy.CAP_AT_BASE.apply(Cents(-800), base))
        assertEquals(Cents(300), RolloverPolicy.CAP_AT_BASE.apply(Cents(300), base))
    }
}
