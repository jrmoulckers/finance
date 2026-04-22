// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.insights

import com.finance.core.aggregation.FinancialAggregator
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*

/**
 * Shared analytics engine for spending trends, category analysis,
 * and financial health scoring.
 *
 * Pure commonMain — no platform dependencies.
 * All monetary values use [Cents] (Long-backed) for exact precision.
 * All date/time operations use kotlinx-datetime exclusively.
 *
 * ## Financial Health Score Components
 *
 * | Component       | Weight | Scoring Criteria                                |
 * |-----------------|--------|-------------------------------------------------|
 * | Savings Rate    | 30     | 0–50% mapped to 0–100 score                    |
 * | Budget Adherence| 25     | % of budgets within limit                       |
 * | Debt Ratio      | 20     | Liabilities / Assets (lower is better)          |
 * | Spending Trend  | 15     | MoM spending change (decreasing is better)      |
 * | Emergency Fund  | 10     | Months of expenses covered by savings           |
 */
object InsightsEngine {

    /** Number of months for trend analysis. */
    private const val TREND_MONTHS = 6

    /** Stability threshold: ±5% change is considered stable. */
    private const val STABILITY_THRESHOLD_PERCENT = 5.0

    // ── Category Trends ──────────────────────────────────────────────

    /**
     * Compute spending trends per category over the last [months] months.
     *
     * @param transactions All available transactions.
     * @param months Number of months to analyse (default 6).
     * @param referenceDate Anchor date (defaults to today UTC).
     * @return List of [CategoryTrend] sorted by average monthly spend descending.
     */
    fun categoryTrends(
        transactions: List<Transaction>,
        months: Int = TREND_MONTHS,
        referenceDate: LocalDate = currentDate(),
    ): List<CategoryTrend> {
        require(months > 0) { "months must be > 0" }

        val expenses = transactions.filter {
            it.type == TransactionType.EXPENSE && it.deletedAt == null
        }

        // Gather all category IDs that have at least one transaction
        val allCategories = expenses.mapNotNull { it.categoryId }.toSet()

        return allCategories.map { categoryId ->
            val monthlyAmounts = (0 until months).map { offset ->
                val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
                val start = LocalDate(monthDate.year, monthDate.month, 1)
                val end = endOfMonth(start)

                val total = expenses
                    .filter {
                        it.categoryId == categoryId &&
                            it.date in start..end
                    }
                    .sumOf { it.amount.abs().amount }

                MonthAmount(start.year, start.month, Cents(total))
            }.reversed()

            val avgMonthly = Cents(
                if (monthlyAmounts.isEmpty()) 0L
                else monthlyAmounts.sumOf { it.amount.amount } / monthlyAmounts.size,
            )

            val first = monthlyAmounts.firstOrNull()?.amount ?: Cents.ZERO
            val last = monthlyAmounts.lastOrNull()?.amount ?: Cents.ZERO

            val changePercent = if (first.isZero()) null
            else ((last.amount - first.amount).toDouble() / first.amount) * 100.0

            val direction = when {
                changePercent == null -> TrendDirection.STABLE
                changePercent > STABILITY_THRESHOLD_PERCENT -> TrendDirection.INCREASING
                changePercent < -STABILITY_THRESHOLD_PERCENT -> TrendDirection.DECREASING
                else -> TrendDirection.STABLE
            }

            CategoryTrend(
                categoryId = categoryId,
                monthlyAmounts = monthlyAmounts,
                direction = direction,
                averageMonthly = avgMonthly,
                overallChangePercent = changePercent,
            )
        }.sortedByDescending { it.averageMonthly.amount }
    }

    // ── Category Analysis ────────────────────────────────────────────

    /**
     * Analyse spending by category for the current period vs prior period.
     *
     * @param transactions All available transactions.
     * @param referenceDate Anchor date.
     * @return List of [CategoryAnalysis] ranked by total spent descending.
     */
    fun categoryAnalysis(
        transactions: List<Transaction>,
        referenceDate: LocalDate = currentDate(),
    ): List<CategoryAnalysis> {
        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = endOfMonth(referenceDate)
        val priorStart = currentStart.minus(1, DateTimeUnit.MONTH)
        val priorEnd = endOfMonth(priorStart)

        val currentByCategory = FinancialAggregator.spendingByCategory(
            transactions, currentStart, currentEnd,
        ).filterKeys { it != null }.mapKeys { it.key!! }

        val priorByCategory = FinancialAggregator.spendingByCategory(
            transactions, priorStart, priorEnd,
        ).filterKeys { it != null }.mapKeys { it.key!! }

        val totalCurrentSpending = currentByCategory.values.sumOf { it.amount }

        val ranked = currentByCategory.entries
            .sortedByDescending { it.value.amount }

        return ranked.mapIndexed { index, (categoryId, spent) ->
            val prior = priorByCategory[categoryId] ?: Cents.ZERO
            val changePercent = if (prior.isZero()) null
            else ((spent.amount - prior.amount).toDouble() / prior.amount) * 100.0

            CategoryAnalysis(
                categoryId = categoryId,
                totalSpent = spent,
                percentOfTotal = if (totalCurrentSpending > 0)
                    (spent.amount.toDouble() / totalCurrentSpending) * 100.0
                else 0.0,
                rank = index + 1,
                priorPeriodAmount = prior,
                changePercent = changePercent,
            )
        }
    }

    // ── Income vs Expense Summary ────────────────────────────────────

    /**
     * Compute an income vs. expense summary for the reference month.
     */
    fun incomeExpenseSummary(
        transactions: List<Transaction>,
        referenceDate: LocalDate = currentDate(),
    ): IncomeExpenseSummary {
        val start = LocalDate(referenceDate.year, referenceDate.month, 1)
        val end = endOfMonth(referenceDate)

        val income = FinancialAggregator.totalIncome(transactions, start, end)
        val expenses = FinancialAggregator.totalSpending(transactions, start, end)
        val cashFlow = income - expenses
        val savingsRate = FinancialAggregator.savingsRate(transactions, start, end)

        return IncomeExpenseSummary(
            periodStart = start,
            periodEnd = end,
            totalIncome = income,
            totalExpenses = expenses,
            netCashFlow = cashFlow,
            savingsRate = savingsRate,
            topExpenseCategories = categoryAnalysis(transactions, referenceDate).take(5),
        )
    }

    // ── Financial Health Score ────────────────────────────────────────

    /**
     * Calculate a composite financial health score (0–100).
     *
     * @param transactions All available transactions.
     * @param accounts All active accounts.
     * @param budgets All active budgets.
     * @param referenceDate Anchor date.
     * @return [FinancialHealthScore] with component breakdown.
     */
    fun calculateHealthScore(
        transactions: List<Transaction>,
        accounts: List<Account>,
        budgets: List<Budget>,
        referenceDate: LocalDate = currentDate(),
    ): FinancialHealthScore {
        val components = mutableListOf<HealthComponent>()

        // Component 1: Savings Rate (weight: 30)
        components.add(savingsRateComponent(transactions, referenceDate))

        // Component 2: Budget Adherence (weight: 25)
        components.add(budgetAdherenceComponent(budgets, transactions, referenceDate))

        // Component 3: Debt Ratio (weight: 20)
        components.add(debtRatioComponent(accounts))

        // Component 4: Spending Trend (weight: 15)
        components.add(spendingTrendComponent(transactions, referenceDate))

        // Component 5: Emergency Fund (weight: 10)
        components.add(emergencyFundComponent(accounts, transactions, referenceDate))

        // Weighted average
        val totalWeight = components.sumOf { it.weight }
        val weightedScore = if (totalWeight > 0) {
            components.sumOf { it.score * it.weight } / totalWeight
        } else 0

        val overall = weightedScore.coerceIn(0, 100)

        val assessment = when {
            overall >= 80 -> HealthAssessment.EXCELLENT
            overall >= 60 -> HealthAssessment.GOOD
            overall >= 40 -> HealthAssessment.FAIR
            overall >= 20 -> HealthAssessment.NEEDS_ATTENTION
            else -> HealthAssessment.CRITICAL
        }

        return FinancialHealthScore(
            overallScore = overall,
            components = components,
            assessment = assessment,
        )
    }

    // ── Health Score Components ───────────────────────────────────────

    internal fun savingsRateComponent(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): HealthComponent {
        val start = LocalDate(referenceDate.year, referenceDate.month, 1)
        val end = endOfMonth(referenceDate)

        val rate = FinancialAggregator.savingsRate(transactions, start, end)
        // Score: 0% savings → 0, 50%+ savings → 100
        val score = (rate * 2).toInt().coerceIn(0, 100)

        val explanation = when {
            rate >= 20 -> "Excellent savings rate of ${rate.toInt()}%"
            rate >= 10 -> "Good savings rate of ${rate.toInt()}%"
            rate >= 0 -> "Low savings rate of ${rate.toInt()}%"
            else -> "Negative savings — spending exceeds income"
        }

        return HealthComponent(
            name = "Savings Rate",
            score = score,
            weight = 30,
            explanation = explanation,
        )
    }

    internal fun budgetAdherenceComponent(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): HealthComponent {
        if (budgets.isEmpty()) {
            return HealthComponent(
                name = "Budget Adherence",
                score = 50, // Neutral when no budgets set
                weight = 25,
                explanation = "No budgets set — consider creating budgets to track spending",
            )
        }

        val withinBudget = budgets.count { budget ->
            val catTxns = transactions.filter { it.categoryId == budget.categoryId }
            val spent = catTxns
                .filter {
                    it.type == TransactionType.EXPENSE &&
                        it.deletedAt == null &&
                        it.date >= LocalDate(referenceDate.year, referenceDate.month, 1) &&
                        it.date <= endOfMonth(referenceDate)
                }
                .sumOf { it.amount.abs().amount }
            spent <= budget.amount.amount
        }

        val adherenceRate = (withinBudget.toDouble() / budgets.size) * 100.0
        val score = adherenceRate.toInt().coerceIn(0, 100)

        return HealthComponent(
            name = "Budget Adherence",
            score = score,
            weight = 25,
            explanation = "$withinBudget of ${budgets.size} budgets within limit (${adherenceRate.toInt()}%)",
        )
    }

    internal fun debtRatioComponent(accounts: List<Account>): HealthComponent {
        val active = accounts.filter { it.deletedAt == null && !it.isArchived }

        val assets = active
            .filter { it.type != AccountType.CREDIT_CARD && it.type != AccountType.LOAN }
            .sumOf { it.currentBalance.amount }

        val liabilities = active
            .filter { it.type == AccountType.CREDIT_CARD || it.type == AccountType.LOAN }
            .sumOf { it.currentBalance.amount }

        if (assets <= 0L) {
            return HealthComponent(
                name = "Debt Ratio",
                score = if (liabilities > 0) 10 else 50,
                weight = 20,
                explanation = if (liabilities > 0) "High debt relative to assets"
                else "No significant assets or liabilities tracked",
            )
        }

        val debtRatio = liabilities.toDouble() / assets
        // Score: 0% debt → 100, 100%+ debt → 0
        val score = ((1.0 - debtRatio) * 100).toInt().coerceIn(0, 100)

        val explanation = when {
            debtRatio <= 0.1 -> "Excellent — minimal debt (${(debtRatio * 100).toInt()}% ratio)"
            debtRatio <= 0.3 -> "Healthy debt level (${(debtRatio * 100).toInt()}% ratio)"
            debtRatio <= 0.5 -> "Moderate debt (${(debtRatio * 100).toInt()}% ratio)"
            else -> "High debt (${(debtRatio * 100).toInt()}% ratio) — consider paying down"
        }

        return HealthComponent(
            name = "Debt Ratio",
            score = score,
            weight = 20,
            explanation = explanation,
        )
    }

    internal fun spendingTrendComponent(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): HealthComponent {
        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = endOfMonth(referenceDate)
        val priorDate = referenceDate.minus(1, DateTimeUnit.MONTH)
        val priorStart = LocalDate(priorDate.year, priorDate.month, 1)
        val priorEnd = endOfMonth(priorDate)

        val currentSpending = FinancialAggregator.totalSpending(
            transactions, currentStart, currentEnd,
        )
        val priorSpending = FinancialAggregator.totalSpending(
            transactions, priorStart, priorEnd,
        )

        if (priorSpending.isZero()) {
            return HealthComponent(
                name = "Spending Trend",
                score = 50,
                weight = 15,
                explanation = "Not enough history to determine spending trend",
            )
        }

        val changePercent = ((currentSpending.amount - priorSpending.amount).toDouble() /
            priorSpending.amount) * 100.0

        // Decreasing spending is good, increasing is bad
        // -20% or more → 100, +20% or more → 0
        val score = (50 - (changePercent * 2.5)).toInt().coerceIn(0, 100)

        val explanation = when {
            changePercent < -10 -> "Spending decreased ${kotlin.math.abs(changePercent).toInt()}% vs last month"
            changePercent > 10 -> "Spending increased ${changePercent.toInt()}% vs last month"
            else -> "Spending roughly stable vs last month"
        }

        return HealthComponent(
            name = "Spending Trend",
            score = score,
            weight = 15,
            explanation = explanation,
        )
    }

    internal fun emergencyFundComponent(
        accounts: List<Account>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): HealthComponent {
        val start = LocalDate(referenceDate.year, referenceDate.month, 1)
        val end = endOfMonth(referenceDate)

        val monthlyExpenses = FinancialAggregator.totalSpending(transactions, start, end)

        val savingsBalance = accounts
            .filter {
                it.type == AccountType.SAVINGS &&
                    it.deletedAt == null &&
                    !it.isArchived
            }
            .sumOf { it.currentBalance.amount }

        if (monthlyExpenses.isZero()) {
            return HealthComponent(
                name = "Emergency Fund",
                score = 50,
                weight = 10,
                explanation = "No expenses recorded — cannot assess emergency fund adequacy",
            )
        }

        val monthsCovered = savingsBalance.toDouble() / monthlyExpenses.amount
        // Score: 0 months → 0, 6+ months → 100
        val score = ((monthsCovered / 6.0) * 100).toInt().coerceIn(0, 100)

        val explanation = when {
            monthsCovered >= 6 -> "Strong emergency fund (${monthsCovered.toInt()} months of expenses)"
            monthsCovered >= 3 -> "Adequate emergency fund (${monthsCovered.toInt()} months)"
            monthsCovered >= 1 -> "Minimal emergency fund (${monthsCovered.toInt()} month)"
            else -> "Insufficient emergency fund — build savings to cover 3-6 months"
        }

        return HealthComponent(
            name = "Emergency Fund",
            score = score,
            weight = 10,
            explanation = explanation,
        )
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private fun endOfMonth(date: LocalDate): LocalDate {
        val nextMonth = if (date.month == Month.DECEMBER) {
            LocalDate(date.year + 1, Month.JANUARY, 1)
        } else {
            LocalDate(date.year, Month.entries[date.month.ordinal + 1], 1)
        }
        return nextMonth.minus(1, DateTimeUnit.DAY)
    }

    internal fun currentDate(): LocalDate =
        Clock.System.now().toLocalDateTime(TimeZone.UTC).date
}
