package com.finance.core.analytics

import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.aggregation.MonthlyTotal
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*

/**
 * Generates analytics reports from in-memory transaction and account data.
 *
 * All monetary values use [Cents] (Long-backed) — never floating point.
 * Date/time operations use kotlinx-datetime exclusively (no java.time).
 *
 * The generator delegates low-level aggregation to [FinancialAggregator] where
 * appropriate and adds higher-level report-oriented computations on top.
 */
object ReportGenerator {

    // ── Spending by category ─────────────────────────────────────────

    /**
     * Spending broken down by category for an arbitrary date range.
     *
     * Enhances [FinancialAggregator.spendingByCategory] by accepting a
     * [DateRange] and returning a map keyed by non-null [SyncId] (un-categorised
     * transactions are excluded).
     *
     * @param transactions All available transactions (filtering is applied internally).
     * @param dateRange    Inclusive start/end range.
     * @return Map of categoryId → total spent (always non-negative cents).
     */
    fun spendingByCategory(
        transactions: List<Transaction>,
        dateRange: DateRange,
    ): Map<SyncId, Cents> {
        return FinancialAggregator.spendingByCategory(
            transactions, dateRange.start, dateRange.endInclusive,
        )
            .filterKeys { it != null }
            .mapKeys { (key, _) -> key!! }
    }

    // ── Income vs. expense ───────────────────────────────────────────

    /**
     * Month-by-month income vs. expense comparison for the last [months] months
     * ending at (and including) [referenceDate]'s month.
     *
     * The list is ordered chronologically (oldest first).
     *
     * @param transactions  All available transactions.
     * @param months        Number of months to include (must be > 0).
     * @param referenceDate The anchor date — its calendar month is the most recent
     *                      month in the result. Defaults to today (UTC).
     */
    fun incomeVsExpense(
        transactions: List<Transaction>,
        months: Int,
        referenceDate: LocalDate = currentDate(),
    ): List<MonthlyComparison> {
        require(months > 0) { "months must be > 0" }

        return (0 until months).map { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = start.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY)

            val income = FinancialAggregator.totalIncome(transactions, start, end)
            val expense = FinancialAggregator.totalSpending(transactions, start, end)

            MonthlyComparison(
                year = start.year,
                month = start.month,
                income = income,
                expense = expense,
                net = income - expense,
            )
        }.reversed()
    }

    // ── Net worth over time ──────────────────────────────────────────

    /**
     * Simulates net-worth at the end of each of the last [months] months by
     * replaying transactions against account starting balances.
     *
     * **Algorithm:**
     * 1. Compute the current net worth from account balances (point-in-time snapshot).
     * 2. Walk backwards from the reference month, subtracting each month's net
     *    cash-flow to derive earlier month-end values.
     *
     * The list is ordered chronologically (oldest first).
     *
     * @param accounts      All user accounts (un-archived, non-deleted are used).
     * @param transactions  All available transactions.
     * @param months        Number of months to include (must be > 0).
     * @param referenceDate Anchor date. Defaults to today (UTC).
     */
    fun netWorthOverTime(
        accounts: List<Account>,
        transactions: List<Transaction>,
        months: Int,
        referenceDate: LocalDate = currentDate(),
    ): List<NetWorthSnapshot> {
        require(months > 0) { "months must be > 0" }

        val currentNetWorth = FinancialAggregator.netWorth(accounts)

        // Compute the active (non-deleted, non-archived) accounts for asset/liability split.
        val active = accounts.filter { it.deletedAt == null && !it.isArchived }
        val currentAssets = Cents(active
            .filter { it.type != AccountType.CREDIT_CARD && it.type != AccountType.LOAN }
            .sumOf { it.currentBalance.amount })
        val currentLiabilities = Cents(active
            .filter { it.type == AccountType.CREDIT_CARD || it.type == AccountType.LOAN }
            .sumOf { it.currentBalance.amount })

        // Build month-end snapshots starting from the most recent month.
        val snapshots = mutableListOf<NetWorthSnapshot>()
        var runningNetWorth = currentNetWorth

        for (offset in 0 until months) {
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = start.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY)

            if (offset == 0) {
                // Current month: use actual account balances.
                snapshots.add(
                    NetWorthSnapshot(
                        date = end,
                        totalAssets = currentAssets,
                        totalLiabilities = currentLiabilities,
                        netWorth = currentNetWorth,
                    )
                )
            } else {
                // Derive earlier month-end by subtracting the *following* month's cash-flow.
                val followingMonthDate = referenceDate.minus(offset - 1, DateTimeUnit.MONTH)
                val followingStart = LocalDate(
                    followingMonthDate.year, followingMonthDate.month, 1,
                )
                val followingEnd = followingStart
                    .plus(1, DateTimeUnit.MONTH)
                    .minus(1, DateTimeUnit.DAY)
                val followingCashFlow = FinancialAggregator.netCashFlow(
                    transactions, followingStart, followingEnd,
                )
                runningNetWorth = runningNetWorth - followingCashFlow

                // Without per-account historical data, approximate asset/liability split
                // by scaling from the current-day ratio.
                val estimated = estimateAssetLiabilitySplit(
                    runningNetWorth, currentAssets, currentLiabilities,
                )
                snapshots.add(
                    NetWorthSnapshot(
                        date = end,
                        totalAssets = estimated.first,
                        totalLiabilities = estimated.second,
                        netWorth = runningNetWorth,
                    )
                )
            }
        }

        return snapshots.reversed()
    }

    // ── Category trends ──────────────────────────────────────────────

    /**
     * Monthly spending for a single category over the last [months] months.
     *
     * Delegates to [FinancialAggregator.monthlySpendingTrend] after pre-filtering
     * transactions to the requested category.
     *
     * The list is ordered chronologically (oldest first).
     *
     * @param transactions  All available transactions.
     * @param categoryId    The category to analyse.
     * @param months        Number of months to include (must be > 0).
     * @param referenceDate Anchor date. Defaults to today (UTC).
     */
    fun categoryTrends(
        transactions: List<Transaction>,
        categoryId: SyncId,
        months: Int,
        referenceDate: LocalDate = currentDate(),
    ): List<MonthlyTotal> {
        require(months > 0) { "months must be > 0" }

        val filtered = transactions.filter { it.categoryId == categoryId }
        return FinancialAggregator.monthlySpendingTrend(filtered, months, referenceDate)
    }

    // ── Spending insights ────────────────────────────────────────────

    /**
     * Generates per-category spending insights comparing [referenceDate]'s month
     * with the immediately preceding month.
     *
     * Only categories with activity in *either* month are included.
     *
     * @param transactions  All available transactions.
     * @param referenceDate Anchor date. Defaults to today (UTC).
     * @return List of [SpendingInsight] sorted by absolute percent change descending.
     */
    fun spendingInsights(
        transactions: List<Transaction>,
        referenceDate: LocalDate = currentDate(),
    ): List<SpendingInsight> {
        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = currentStart
            .plus(1, DateTimeUnit.MONTH)
            .minus(1, DateTimeUnit.DAY)
        val previousStart = currentStart.minus(1, DateTimeUnit.MONTH)
        val previousEnd = currentStart.minus(1, DateTimeUnit.DAY)

        val currentByCategory = spendingByCategory(
            transactions, DateRange(currentStart, currentEnd),
        )
        val previousByCategory = spendingByCategory(
            transactions, DateRange(previousStart, previousEnd),
        )

        val allCategories = currentByCategory.keys + previousByCategory.keys

        return allCategories.map { categoryId ->
            val current = currentByCategory[categoryId] ?: Cents.ZERO
            val previous = previousByCategory[categoryId] ?: Cents.ZERO

            val (percentChange, trend) = computeTrend(current, previous)

            SpendingInsight(
                categoryId = categoryId,
                currentMonth = current,
                previousMonth = previous,
                percentChange = percentChange,
                trend = trend,
            )
        }.sortedByDescending { insight ->
            insight.percentChange?.let { kotlin.math.abs(it) } ?: 0.0
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────

    /**
     * Inclusive date range used by report APIs.
     */
    data class DateRange(val start: LocalDate, val endInclusive: LocalDate) {
        init {
            require(start <= endInclusive) {
                "start ($start) must be <= endInclusive ($endInclusive)"
            }
        }
    }

    /**
     * Compute percentage change and directional trend between two months.
     *
     * Returns `null` percent change when the previous month is zero (undefined).
     * A ±1 % dead-band around zero is considered [Trend.STABLE].
     */
    internal fun computeTrend(
        current: Cents,
        previous: Cents,
    ): Pair<Double?, Trend> {
        if (previous.isZero()) {
            return if (current.isZero()) {
                null to Trend.STABLE
            } else {
                null to Trend.UP
            }
        }

        val change = ((current.amount - previous.amount).toDouble() /
            previous.amount) * 100.0

        val trend = when {
            change > 1.0 -> Trend.UP
            change < -1.0 -> Trend.DOWN
            else -> Trend.STABLE
        }

        return change to trend
    }

    /**
     * Estimate an asset/liability split for a historical net-worth value
     * based on the current-day ratio. This is an approximation — without
     * per-account historical balances we cannot reconstruct the exact split.
     */
    internal fun estimateAssetLiabilitySplit(
        netWorth: Cents,
        currentAssets: Cents,
        currentLiabilities: Cents,
    ): Pair<Cents, Cents> {
        val currentTotal = currentAssets.amount + currentLiabilities.amount
        if (currentTotal == 0L) {
            // No accounts — attribute everything to assets (or zero).
            return if (netWorth.amount >= 0) {
                netWorth to Cents.ZERO
            } else {
                Cents.ZERO to Cents(-netWorth.amount)
            }
        }

        // Scale liabilities proportionally to the net worth change,
        // using the current asset/liability ratio as a baseline.
        val liabilityRatio = currentLiabilities.amount.toDouble() / currentTotal
        val estimatedLiabilities = Cents(
            (liabilityRatio * (currentTotal.toDouble() *
                netWorth.amount / (currentAssets.amount - currentLiabilities.amount)))
                .toLong()
                .coerceAtLeast(0L),
        )
        val estimatedAssets = Cents(
            (netWorth.amount + estimatedLiabilities.amount).coerceAtLeast(0L),
        )

        return estimatedAssets to estimatedLiabilities
    }

    /**
     * Returns current date in UTC. Centralised so tests can reason about the
     * default without mocking the clock.
     */
    internal fun currentDate(): LocalDate =
        Clock.System.now().toLocalDateTime(TimeZone.UTC).date
}
