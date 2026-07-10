// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.*
import com.finance.models.types.*
import com.finance.core.money.MoneyOperations
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Calculates budget utilization, remaining amounts, and period boundaries.
 */
object BudgetCalculator {

    /**
     * Calculate budget status for a given budget and its transactions.
     *
     * The reported [BudgetStatus.isWithinBudgetDates] reflects whether
     * [referenceDate] falls inside the budget's active window
     * `[startDate, endDate]` (see [isActiveOn]); an ended budget still reports
     * its last period's numbers but is flagged as inactive (#3632).
     */
    fun calculateStatus(
        budget: Budget,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): BudgetStatus {
        val period = getCurrentPeriod(budget.period, budget.startDate, referenceDate)
        val periodTransactions = periodExpenses(budget, transactions, period)

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
            isWithinBudgetDates = isActiveOn(budget, referenceDate),
        )
    }

    /**
     * Break a shared/household budget's spend down by member (`ownerId`) for the
     * period containing [referenceDate] (#3690).
     *
     * The same category / currency / date-window / soft-delete / expense-only
     * filters as [calculateStatus] are applied, so [BudgetMemberBreakdown.totalSpent]
     * reconciles exactly with [BudgetStatus.spent]. Members with no qualifying
     * spend in the period do not appear in [BudgetMemberBreakdown.byMember]; use
     * [BudgetMemberBreakdown.spendFor] to read a zero for absent members.
     */
    fun calculateMemberBreakdown(
        budget: Budget,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): BudgetMemberBreakdown {
        val period = getCurrentPeriod(budget.period, budget.startDate, referenceDate)
        val periodTransactions = periodExpenses(budget, transactions, period)

        val byMember = LinkedHashMap<SyncId, Cents>()
        for (txn in periodTransactions) {
            val current = byMember[txn.ownerId] ?: Cents.ZERO
            byMember[txn.ownerId] = current + txn.amount.abs()
        }
        val total = Cents(periodTransactions.sumOf { it.amount.abs().amount })

        return BudgetMemberBreakdown(
            budget = budget,
            period = period,
            totalSpent = total,
            byMember = byMember,
        )
    }

    /**
     * Whether [referenceDate] falls inside the budget's active window (#3632).
     *
     * A budget is active on any date in `[startDate, endDate]`. When
     * [Budget.endDate] is `null` the budget is open-ended and active on every
     * date on or after [Budget.startDate].
     */
    fun isActiveOn(budget: Budget, referenceDate: LocalDate): Boolean {
        val endDate = budget.endDate
        return referenceDate >= budget.startDate &&
            (endDate == null || referenceDate <= endDate)
    }

    /**
     * Expenses that count against [budget] within [period]: matching category and
     * currency, inside the date window, not soft-deleted, and of expense type.
     */
    private fun periodExpenses(
        budget: Budget,
        transactions: List<Transaction>,
        period: DatePeriod,
    ): List<Transaction> = transactions.filter { txn ->
        txn.categoryId == budget.categoryId &&
            txn.currency == budget.currency &&
            txn.date >= period.start && txn.date <= period.end &&
            txn.deletedAt == null &&
            txn.type == TransactionType.EXPENSE
    }

    /**
     * Get the current period boundaries for a budget.
     *
     * ## Anchoring rule (#3595)
     * Every period type is anchored to the budget's [startDate] rather than to
     * calendar boundaries, so a cycle that begins on the 15th (or a Thursday)
     * stays on that cadence:
     *  - **WEEKLY / BIWEEKLY** — fixed 7- / 14-day windows counted from [startDate].
     *  - **MONTHLY / QUARTERLY / YEARLY** — 1- / 3- / 12-month windows counted
     *    from [startDate], preserving its day-of-month (clamped for short months
     *    by `kotlinx-datetime`).
     *
     * Because a `startDate` on the 1st of a month that is also an ISO Monday
     * coincides with the calendar grid, calendar-aligned budgets are unaffected.
     * Reference dates before [startDate] resolve to the correct earlier period.
     */
    fun getCurrentPeriod(
        period: BudgetPeriod,
        startDate: LocalDate,
        referenceDate: LocalDate,
    ): DatePeriod {
        return when (period) {
            BudgetPeriod.WEEKLY -> alignedDayPeriod(startDate, referenceDate, DAYS_PER_WEEK)
            BudgetPeriod.BIWEEKLY -> alignedDayPeriod(startDate, referenceDate, BIWEEKLY_DAYS)
            BudgetPeriod.MONTHLY -> alignedMonthPeriod(startDate, referenceDate, MONTHS_PER_MONTH)
            BudgetPeriod.QUARTERLY -> alignedMonthPeriod(startDate, referenceDate, MONTHS_PER_QUARTER)
            BudgetPeriod.YEARLY -> alignedMonthPeriod(startDate, referenceDate, MONTHS_PER_YEAR)
        }
    }

    /**
     * A fixed-length day window (7 or 14 days) anchored at [startDate]. Uses
     * floor division so reference dates before [startDate] bucket into the
     * correct earlier period rather than truncating toward zero.
     */
    private fun alignedDayPeriod(
        startDate: LocalDate,
        referenceDate: LocalDate,
        lengthDays: Int,
    ): DatePeriod {
        val daysSinceStart = startDate.daysUntil(referenceDate)
        val periodIndex = floorDiv(daysSinceStart, lengthDays)
        val periodStart = startDate.plus(periodIndex * lengthDays, DateTimeUnit.DAY)
        return DatePeriod(periodStart, periodStart.plus(lengthDays - 1, DateTimeUnit.DAY))
    }

    /**
     * A month-based window anchored at [startDate], where [monthsPerPeriod] is 1
     * (monthly), 3 (quarterly) or 12 (yearly). The window preserves the
     * [startDate] day-of-month; each period boundary is computed by adding whole
     * months to [startDate] (never by compounding) to avoid drift across short
     * months.
     */
    private fun alignedMonthPeriod(
        startDate: LocalDate,
        referenceDate: LocalDate,
        monthsPerPeriod: Int,
    ): DatePeriod {
        val totalMonths = startDate.monthsUntil(referenceDate)
        var index = floorDiv(totalMonths, monthsPerPeriod)
        var start = startDate.plus(index * monthsPerPeriod, DateTimeUnit.MONTH)
        // monthsUntil truncates by day-of-month, so correct the bucket until
        // referenceDate lies within [start, nextStart).
        while (referenceDate < start) {
            index -= 1
            start = startDate.plus(index * monthsPerPeriod, DateTimeUnit.MONTH)
        }
        var nextStart = startDate.plus((index + 1) * monthsPerPeriod, DateTimeUnit.MONTH)
        while (referenceDate >= nextStart) {
            index += 1
            start = nextStart
            nextStart = startDate.plus((index + 1) * monthsPerPeriod, DateTimeUnit.MONTH)
        }
        return DatePeriod(start, nextStart.minus(1, DateTimeUnit.DAY))
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

    /** Number of days in a weekly budget period. */
    private const val DAYS_PER_WEEK = 7

    /** Months per monthly / quarterly / yearly period, used to anchor on startDate. */
    private const val MONTHS_PER_MONTH = 1
    private const val MONTHS_PER_QUARTER = 3
    private const val MONTHS_PER_YEAR = 12

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
 *
 * @property isWithinBudgetDates Whether the evaluated reference date fell inside
 *   the budget's `[startDate, endDate]` window. `false` means the status is for
 *   a date outside the budget's life (e.g. after its `endDate`) and is reported
 *   for reference only (#3632).
 */
data class BudgetStatus(
    val budget: Budget,
    val period: DatePeriod,
    val spent: Cents,
    val remaining: Cents,
    /** Fraction of budget spent (0.0 to unbounded). >1.0 means over budget. */
    val utilization: Double,
    val isOverBudget: Boolean,
    val isWithinBudgetDates: Boolean = true,
) {
    /**
     * Health level using the default thresholds (WARNING > 75%, OVER > 100%).
     * For custom sensitivity use [healthLevel] with explicit [BudgetThresholds].
     */
    val healthLevel: BudgetHealth get() = BudgetThresholds.DEFAULT.classify(utilization)

    /**
     * Health level classified against caller-supplied [thresholds] (#3678).
     * Passing [BudgetThresholds.DEFAULT] is identical to the [healthLevel] property.
     */
    fun healthLevel(thresholds: BudgetThresholds): BudgetHealth = thresholds.classify(utilization)
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
