// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.serialization.Serializable

/**
 * Audit-trail record for a single rollover carry-forward.
 *
 * @property budgetId Identifier of the budget this rollover belongs to.
 * @property fromPeriod The period that generated the surplus or deficit.
 * @property toPeriod The period that receives the carry-forward.
 * @property baseAmount The budget's base amount for [fromPeriod] (in cents).
 * @property spentAmount Total expenses in [fromPeriod] (in cents, always non-negative).
 * @property rolloverAmount Carried-forward amount: positive = surplus, negative = overspend.
 */
@Serializable
data class RolloverAmount(
    val budgetId: String,
    val fromPeriod: DatePeriod,
    val toPeriod: DatePeriod,
    val baseAmount: Cents,
    val spentAmount: Cents,
    val rolloverAmount: Cents,
)

/**
 * Result of computing the effective budget after applying rollover.
 *
 * @property budget The original [Budget] definition.
 * @property period The current period boundaries.
 * @property baseAmount The budget's base allocation for this period.
 * @property rolloverCarry Amount carried from the previous period (positive = surplus, negative = overspend).
 * @property effectiveAmount The total available budget: [baseAmount] + [rolloverCarry].
 */
data class EffectiveBudget(
    val budget: Budget,
    val period: DatePeriod,
    val baseAmount: Cents,
    val rolloverCarry: Cents,
    val effectiveAmount: Cents,
)

/**
 * Calculates budget rollover carry-forward behaviour.
 *
 * When [Budget.isRollover] is `true`, unused budget from the previous period
 * carries forward to the next period. Conversely, overspending in one period
 * reduces the effective budget for the following period.
 *
 * All monetary calculations use [Cents] (Long) — no floating-point arithmetic.
 */
object BudgetRolloverCalculator {

    /**
     * Calculate the rollover amount from a completed budget period.
     *
     * @param budget The budget definition (must have [Budget.isRollover] == true).
     * @param transactions All transactions that may fall within the period.
     * @param periodDate A date that falls within the *completed* period.
     * @return A [RolloverAmount] capturing the carry-forward for audit purposes.
     */
    fun calculateRollover(
        budget: Budget,
        transactions: List<Transaction>,
        periodDate: LocalDate,
    ): RolloverAmount {
        val fromPeriod = BudgetCalculator.getCurrentPeriod(budget.period, budget.startDate, periodDate)
        val toPeriod = nextPeriod(budget.period, budget.startDate, fromPeriod)
        val spent = sumExpenses(transactions, fromPeriod)
        val rollover = budget.amount - spent

        return RolloverAmount(
            budgetId = budget.id.value,
            fromPeriod = fromPeriod,
            toPeriod = toPeriod,
            baseAmount = budget.amount,
            spentAmount = spent,
            rolloverAmount = rollover,
        )
    }

    /**
     * Compute the effective budget for [referenceDate], incorporating any rollover
     * from the immediately preceding period.
     *
     * If [Budget.isRollover] is `false`, the effective amount equals the base amount.
     *
     * @param budget The budget definition.
     * @param currentPeriodTransactions Transactions in the *current* period (used for status only, not rollover).
     * @param previousPeriodTransactions Transactions in the *previous* period (used to compute rollover).
     * @param referenceDate The date for which the effective budget is evaluated.
     * @return An [EffectiveBudget] with the base, rollover, and effective amounts.
     */
    fun calculateEffectiveBudget(
        budget: Budget,
        @Suppress("unused") currentPeriodTransactions: List<Transaction>,
        previousPeriodTransactions: List<Transaction>,
        referenceDate: LocalDate,
    ): EffectiveBudget {
        val currentPeriod = BudgetCalculator.getCurrentPeriod(budget.period, budget.startDate, referenceDate)

        if (!budget.isRollover) {
            return EffectiveBudget(
                budget = budget,
                period = currentPeriod,
                baseAmount = budget.amount,
                rolloverCarry = Cents.ZERO,
                effectiveAmount = budget.amount,
            )
        }

        val previousPeriodDate = currentPeriod.start.minus(1, DateTimeUnit.DAY)
        val previousPeriod = BudgetCalculator.getCurrentPeriod(budget.period, budget.startDate, previousPeriodDate)
        val previousSpent = sumExpenses(previousPeriodTransactions, previousPeriod)
        val rolloverCarry = budget.amount - previousSpent
        val effectiveAmount = budget.amount + rolloverCarry

        return EffectiveBudget(
            budget = budget,
            period = currentPeriod,
            baseAmount = budget.amount,
            rolloverCarry = rolloverCarry,
            effectiveAmount = effectiveAmount,
        )
    }

    /**
     * Calculate the effective budget by chaining rollover across multiple consecutive periods.
     *
     * This is useful when an audit trail is needed for several periods. The rollover
     * accumulates: period 1 surplus -> period 2 effective, period 2 surplus -> period 3 effective, etc.
     *
     * @param budget The budget definition.
     * @param transactionsByPeriod Map of period start dates to the transactions in that period.
     * @param referenceDate The target date whose effective budget is returned.
     * @return The cumulative rollover amount to apply to the period containing [referenceDate].
     */
    fun calculateCumulativeRollover(
        budget: Budget,
        transactionsByPeriod: Map<LocalDate, List<Transaction>>,
        referenceDate: LocalDate,
    ): Cents {
        if (!budget.isRollover) return Cents.ZERO

        val currentPeriod = BudgetCalculator.getCurrentPeriod(budget.period, budget.startDate, referenceDate)

        // Walk backwards to find the chain of periods that contribute rollover.
        val periods = buildPeriodChain(budget, currentPeriod)

        var cumulativeRollover = Cents.ZERO
        for (period in periods) {
            val txns = transactionsByPeriod[period.start] ?: emptyList()
            val spent = sumExpenses(txns, period)
            val effectiveForPeriod = budget.amount + cumulativeRollover
            cumulativeRollover = effectiveForPeriod - spent
        }
        return cumulativeRollover
    }

    // ── Internal helpers ─────────────────────────────────────────────

    /**
     * Sum expense amounts for transactions within [period], excluding soft-deleted ones.
     */
    internal fun sumExpenses(transactions: List<Transaction>, period: DatePeriod): Cents {
        val total = transactions
            .filter { txn ->
                txn.date >= period.start &&
                    txn.date <= period.end &&
                    txn.deletedAt == null &&
                    txn.type == TransactionType.EXPENSE
            }
            .sumOf { it.amount.abs().amount }
        return Cents(total)
    }

    /**
     * Compute the next period boundary after [currentPeriod].
     */
    internal fun nextPeriod(
        budgetPeriod: BudgetPeriod,
        startDate: LocalDate,
        currentPeriod: DatePeriod,
    ): DatePeriod {
        val nextStart = currentPeriod.end.plus(1, DateTimeUnit.DAY)
        return BudgetCalculator.getCurrentPeriod(budgetPeriod, startDate, nextStart)
    }

    /**
     * Build a chain of consecutive periods from the budget start up to (but not including)
     * [currentPeriod]. Used for cumulative rollover computation.
     */
    @Suppress("LoopWithTooManyJumpStatements")
    private fun buildPeriodChain(budget: Budget, currentPeriod: DatePeriod): List<DatePeriod> {
        val chain = mutableListOf<DatePeriod>()
        var period = BudgetCalculator.getCurrentPeriod(budget.period, budget.startDate, budget.startDate)

        // Safety limit to prevent runaway iteration.
        val maxIterations = 1_000
        var iterations = 0

        while (period.start < currentPeriod.start && iterations < maxIterations) {
            chain.add(period)
            val nextStart = period.end.plus(1, DateTimeUnit.DAY)
            period = BudgetCalculator.getCurrentPeriod(budget.period, budget.startDate, nextStart)
            iterations++
        }
        return chain
    }
}
