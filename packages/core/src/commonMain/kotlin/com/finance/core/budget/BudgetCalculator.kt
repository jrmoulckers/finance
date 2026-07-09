// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.*
import com.finance.models.types.*
import com.finance.core.money.MoneyOperations
import com.finance.models.util.DateTimeUtil.endOfMonth
import com.finance.models.util.DateTimeUtil.startOfMonth
import com.finance.models.util.DateTimeUtil.startOfWeek
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Calculates budget utilization, remaining amounts, and period boundaries.
 */
object BudgetCalculator {

    /**
     * Calculate budget status for a given budget and its transactions.
     */
    fun calculateStatus(
        budget: Budget,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): BudgetStatus {
        val period = getCurrentPeriod(budget.period, budget.startDate, referenceDate)
        val periodTransactions = transactions.filter { txn ->
            txn.categoryId == budget.categoryId &&
                txn.currency == budget.currency &&
                txn.date >= period.start && txn.date <= period.end &&
                txn.deletedAt == null &&
                txn.type == TransactionType.EXPENSE
        }

        val spent = Cents(periodTransactions.sumOf { it.amount.abs().amount })
        val remaining = budget.amount - spent
        val utilization = if (budget.amount.amount > 0) {
            (spent.amount.toDouble() / budget.amount.amount).coerceIn(0.0, Double.MAX_VALUE)
        } else 0.0

        return BudgetStatus(
            budget = budget,
            period = period,
            spent = spent,
            remaining = remaining,
            utilization = utilization,
            isOverBudget = spent.amount > budget.amount.amount,
        )
    }

    /**
     * Get the current period boundaries for a budget.
     */
    fun getCurrentPeriod(
        period: BudgetPeriod,
        startDate: LocalDate,
        referenceDate: LocalDate,
    ): DatePeriod {
        return when (period) {
            BudgetPeriod.WEEKLY -> {
                val start = referenceDate.startOfWeek()
                DatePeriod(start, start.plus(6, DateTimeUnit.DAY))
            }
            BudgetPeriod.BIWEEKLY -> {
                val daysSinceStart = startDate.daysUntil(referenceDate)
                // Floor division so dates before startDate bucket into the
                // correct (earlier) period rather than truncating toward zero.
                val periodIndex = floorDiv(daysSinceStart, BIWEEKLY_DAYS)
                val periodStart = startDate.plus(periodIndex * BIWEEKLY_DAYS, DateTimeUnit.DAY)
                DatePeriod(periodStart, periodStart.plus(BIWEEKLY_DAYS - 1, DateTimeUnit.DAY))
            }
            BudgetPeriod.MONTHLY -> {
                val start = referenceDate.startOfMonth()
                DatePeriod(start, referenceDate.endOfMonth())
            }
            BudgetPeriod.QUARTERLY -> {
                val quarterMonth = ((referenceDate.monthNumber - 1) / 3) * 3 + 1
                val start = LocalDate(referenceDate.year, quarterMonth, 1)
                val endMonth = quarterMonth + 2
                val end = LocalDate(referenceDate.year, endMonth, 1)
                    .plus(1, DateTimeUnit.MONTH)
                    .minus(1, DateTimeUnit.DAY)
                DatePeriod(start, end)
            }
            BudgetPeriod.YEARLY -> {
                val start = LocalDate(referenceDate.year, 1, 1)
                val end = LocalDate(referenceDate.year, 12, 31)
                DatePeriod(start, end)
            }
        }
    }

    /**
     * Calculate daily spending rate to stay within budget.
     */
    @Suppress("ReturnCount")
    fun dailyBudgetRate(budget: Budget, spent: Cents, daysRemaining: Int): Cents {
        if (daysRemaining <= 0) return Cents.ZERO
        val remaining = budget.amount - spent
        if (remaining.isNegative()) return Cents.ZERO
        return MoneyOperations.divide(remaining, daysRemaining)
    }

    /**
     * Project end-of-period spending from the current daily run rate and report
     * whether the budget is on track to be exceeded.
     *
     * The projection assumes spending continues at the average daily pace so far
     * (`spent / daysElapsed`) for the whole period. All money math stays in
     * [Cents]; the projection is `spent * daysTotal / daysElapsed` with
     * round-half-to-even.
     *
     * Edge handling:
     *  - Before the period starts, `daysElapsed` is clamped to 1.
     *  - On/after the period end, `daysElapsed == daysTotal`, so the projection
     *    equals actual spend to date.
     *  - With zero spend the projection is zero.
     *
     * @param budget The budget definition.
     * @param transactions Transactions to evaluate (filtered by the same rules as [calculateStatus]).
     * @param referenceDate The "as of" date for the projection.
     * @return A [BudgetForecast] with projected spend and remaining.
     */
    fun forecast(
        budget: Budget,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): BudgetForecast {
        val status = calculateStatus(budget, transactions, referenceDate)
        val period = status.period
        val daysTotal = period.daysTotal

        val clampedRef = when {
            referenceDate < period.start -> period.start
            referenceDate > period.end -> period.end
            else -> referenceDate
        }
        val daysElapsed = (period.start.daysUntil(clampedRef) + 1).coerceIn(1, daysTotal)
        val daysRemaining = (daysTotal - daysElapsed).coerceAtLeast(0)

        val projectedSpend = MoneyOperations.divide(status.spent * daysTotal, daysElapsed)
        val projectedRemaining = budget.amount - projectedSpend

        return BudgetForecast(
            period = period,
            spent = status.spent,
            daysElapsed = daysElapsed,
            daysRemaining = daysRemaining,
            projectedSpend = projectedSpend,
            projectedRemaining = projectedRemaining,
            isProjectedOverBudget = projectedSpend.amount > budget.amount.amount,
        )
    }

    /** Number of days in a biweekly budget period. */
    private const val BIWEEKLY_DAYS = 14

    /**
     * Integer floor division (rounds toward negative infinity), unlike Kotlin's
     * `/` which truncates toward zero. Ensures negative day offsets bucket into
     * the correct earlier period.
     */
    private fun floorDiv(dividend: Int, divisor: Int): Int {
        var quotient = dividend / divisor
        if ((dividend xor divisor) < 0 && quotient * divisor != dividend) {
            quotient -= 1
        }
        return quotient
    }
}

/**
 * A date range representing a budget period.
 */
@Serializable
data class DatePeriod(
    val start: LocalDate,
    val end: LocalDate,
) {
    val daysTotal: Int get() = start.daysUntil(end) + 1
    fun daysRemaining(from: LocalDate): Int = (from.daysUntil(end) + 1).coerceAtLeast(0)
    fun contains(date: LocalDate): Boolean = date in start..end
}

/**
 * Current status of a budget for its active period.
 */
data class BudgetStatus(
    val budget: Budget,
    val period: DatePeriod,
    val spent: Cents,
    val remaining: Cents,
    /** Fraction of budget spent (0.0 to unbounded). >1.0 means over budget. */
    val utilization: Double,
    val isOverBudget: Boolean,
) {
    /** Health level: HEALTHY (< 75%), WARNING (75-100%), OVER (> 100%) */
    val healthLevel: BudgetHealth get() = when {
        utilization > 1.0 -> BudgetHealth.OVER
        utilization > 0.75 -> BudgetHealth.WARNING
        else -> BudgetHealth.HEALTHY
    }
}

enum class BudgetHealth { HEALTHY, WARNING, OVER }

/**
 * Forward-looking projection of budget spend for the current period.
 *
 * @property period The active budget period.
 * @property spent Actual spend to date within the period (in cents).
 * @property daysElapsed Days elapsed in the period so far (>= 1).
 * @property daysRemaining Days remaining in the period (>= 0).
 * @property projectedSpend Expected total spend by period end at the current run rate.
 * @property projectedRemaining Budget amount minus [projectedSpend] (negative = projected overspend).
 * @property isProjectedOverBudget `true` when [projectedSpend] exceeds the budget amount.
 */
data class BudgetForecast(
    val period: DatePeriod,
    val spent: Cents,
    val daysElapsed: Int,
    val daysRemaining: Int,
    val projectedSpend: Cents,
    val projectedRemaining: Cents,
    val isProjectedOverBudget: Boolean,
)
