package com.finance.core.budget

import com.finance.models.*
import com.finance.models.types.*
import com.finance.core.money.MoneyOperations
import com.finance.models.util.DateTimeUtil.endOfMonth
import com.finance.models.util.DateTimeUtil.startOfMonth
import com.finance.models.util.DateTimeUtil.startOfWeek
import kotlinx.datetime.*

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
                val periodIndex = daysSinceStart / 14
                val periodStart = startDate.plus(periodIndex * 14, DateTimeUnit.DAY)
                DatePeriod(periodStart, periodStart.plus(13, DateTimeUnit.DAY))
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
    fun dailyBudgetRate(budget: Budget, spent: Cents, daysRemaining: Int): Cents {
        if (daysRemaining <= 0) return Cents.ZERO
        val remaining = budget.amount - spent
        if (remaining.isNegative()) return Cents.ZERO
        return MoneyOperations.divide(remaining, daysRemaining)
    }
}

/**
 * A date range representing a budget period.
 */
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
