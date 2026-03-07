package com.finance.core.insights

import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.budget.BudgetStatus
import com.finance.models.*
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate

/**
 * Generates financial insights by analysing transactions, budgets, and goals.
 *
 * All monetary values use [Cents] (Long); ratios and percentages are
 * returned as [Double] clearly documented as "ratio" or "percentage 0–100".
 */
object InsightEngine {

    // ── Spending velocity ────────────────────────────────────────────────

    /**
     * Calculates the spending velocity ratio between two periods.
     *
     * A value > 1.0 means spending increased; < 1.0 means it decreased.
     * Returns 0.0 when both periods have zero spending.
     * Returns [Double.POSITIVE_INFINITY] when the previous period was zero
     * but the current period has spending.
     *
     * @param transactions All (non-deleted) transactions to consider.
     * @param currentPeriod Date range for the current period.
     * @param previousPeriod Date range for the comparison period.
     */
    fun calculateSpendingVelocity(
        transactions: List<Transaction>,
        currentPeriod: ClosedRange<LocalDate>,
        previousPeriod: ClosedRange<LocalDate>,
    ): Double {
        val currentSpending = sumExpenses(transactions, currentPeriod)
        val previousSpending = sumExpenses(transactions, previousPeriod)

        return when {
            previousSpending == 0L && currentSpending == 0L -> 0.0
            previousSpending == 0L -> Double.POSITIVE_INFINITY
            else -> currentSpending.toDouble() / previousSpending
        }
    }

    // ── Savings rate ─────────────────────────────────────────────────────

    /**
     * Calculates the savings rate as a percentage (0.0–100.0).
     *
     * Formula: `((income − expenses) / income) × 100`.
     * Returns 0.0 when income is zero or negative, or when expenses >= income.
     *
     * @param income Total income in cents (must use absolute value).
     * @param expenses Total expenses in cents (must use absolute value).
     */
    fun calculateSavingsRate(income: Cents, expenses: Cents): Double {
        if (income.amount <= 0L) return 0.0
        val saved = income.amount - expenses.abs().amount
        if (saved <= 0L) return 0.0
        return (saved.toDouble() / income.amount) * 100.0
    }

    // ── Budget health score ──────────────────────────────────────────────

    /**
     * Aggregates individual [BudgetStatus] entries into a single 0–100 score.
     *
     * Scoring:
     * - HEALTHY budgets contribute 100 points each.
     * - WARNING budgets contribute 50 points each.
     * - OVER budgets contribute 0 points each.
     *
     * The final score is the weighted average across all budgets.
     * Returns 100 when there are no budgets (nothing to worry about).
     */
    fun budgetHealthScore(budgets: List<BudgetStatus>): Int {
        if (budgets.isEmpty()) return 100

        val totalPoints = budgets.sumOf { status ->
            when (status.healthLevel) {
                BudgetHealth.HEALTHY -> 100
                BudgetHealth.WARNING -> 50
                BudgetHealth.OVER -> 0
            }
        }
        return (totalPoints.toDouble() / budgets.size).toInt().coerceIn(0, 100)
    }

    // ── Full insight generation ────────────────────────────────────────────

    /**
     * Generates a list of actionable [Insight]s from the user's current
     * financial state.
     *
     * @param transactions All non-deleted transactions.
     * @param budgetStatuses Current-period budget statuses (pre-calculated).
     * @param goals Active savings goals.
     * @param currentPeriod The date range for the current analysis period.
     * @param previousPeriod The date range for the previous comparison period.
     * @param previousIncome Previous-period income for savings comparison.
     * @param previousExpenses Previous-period expenses for savings comparison.
     * @param referenceDate The "today" date for time-based progress calculations.
     */
    fun generateInsights(
        transactions: List<Transaction>,
        budgetStatuses: List<BudgetStatus>,
        goals: List<Goal>,
        currentPeriod: ClosedRange<LocalDate>,
        previousPeriod: ClosedRange<LocalDate>,
        previousIncome: Cents = Cents.ZERO,
        previousExpenses: Cents = Cents.ZERO,
        referenceDate: LocalDate = currentPeriod.endInclusive,
    ): List<Insight> {
        val insights = mutableListOf<Insight>()

        // ── Spending velocity insight ──
        val velocity = calculateSpendingVelocity(transactions, currentPeriod, previousPeriod)
        val currentSpend = Cents(sumExpenses(transactions, currentPeriod))
        val previousSpend = Cents(sumExpenses(transactions, previousPeriod))

        if (velocity.isFinite() && velocity > 1.0) {
            insights += Insight.SpendingUp(
                velocityRatio = velocity,
                increaseAmount = currentSpend - previousSpend,
            )
        } else if (velocity.isFinite() && velocity < 1.0 && velocity > 0.0) {
            insights += Insight.SpendingDown(
                velocityRatio = velocity,
                decreaseAmount = previousSpend - currentSpend,
            )
        }

        // ── Budget insights ──
        for (status in budgetStatuses) {
            when (status.healthLevel) {
                BudgetHealth.HEALTHY -> insights += Insight.BudgetOnTrack(
                    budgetId = status.budget.id,
                    budgetName = status.budget.name,
                    utilization = status.utilization,
                )
                BudgetHealth.WARNING, BudgetHealth.OVER -> {
                    val projectedOverage = projectOverage(status, referenceDate)
                    insights += Insight.BudgetAtRisk(
                        budgetId = status.budget.id,
                        budgetName = status.budget.name,
                        utilization = status.utilization,
                        projectedOverage = projectedOverage,
                    )
                }
            }
        }

        // ── Goal insights ──
        for (goal in goals.filter { it.status == GoalStatus.ACTIVE && it.targetDate != null }) {
            val expectedProgress = calculateExpectedProgress(goal, referenceDate)
            val actualProgress = goal.progress

            if (actualProgress >= expectedProgress) {
                insights += Insight.GoalAhead(
                    goalId = goal.id,
                    goalName = goal.name,
                    progress = actualProgress,
                    expectedProgress = expectedProgress,
                )
            } else {
                insights += Insight.GoalBehind(
                    goalId = goal.id,
                    goalName = goal.name,
                    progress = actualProgress,
                    expectedProgress = expectedProgress,
                )
            }
        }

        // ── Savings improvement insight ──
        if (previousIncome.amount > 0L) {
            val currentIncome = Cents(
                transactions.filter {
                    it.type == TransactionType.INCOME &&
                        it.deletedAt == null &&
                        it.date in currentPeriod
                }.sumOf { it.amount.abs().amount }
            )
            val currentExpenses = Cents(sumExpenses(transactions, currentPeriod))
            val currentRate = calculateSavingsRate(currentIncome, currentExpenses)
            val prevRate = calculateSavingsRate(previousIncome, previousExpenses)

            if (currentRate > prevRate && currentRate > 0.0) {
                insights += Insight.SavingsImproved(
                    currentRate = currentRate,
                    previousRate = prevRate,
                )
            }
        }

        return insights
    }

    // ── Private helpers ────────────────────────────────────────────────────

    /** Sum absolute expense amounts within [period], ignoring deleted txns. */
    private fun sumExpenses(
        transactions: List<Transaction>,
        period: ClosedRange<LocalDate>,
    ): Long = transactions.filter {
        it.type == TransactionType.EXPENSE &&
            it.deletedAt == null &&
            it.date in period
    }.sumOf { it.amount.abs().amount }

    /**
     * Project overage: if the user continues spending at the current daily rate
     * for the remainder of the period, how much will they exceed the budget by?
     */
    private fun projectOverage(status: BudgetStatus, referenceDate: LocalDate): Cents {
        val daysElapsed = status.period.start.daysUntil(referenceDate) + 1
        if (daysElapsed <= 0) return Cents.ZERO

        val dailyRate = status.spent.amount.toDouble() / daysElapsed
        val totalDays = status.period.daysTotal
        val projectedTotal = (dailyRate * totalDays).toLong()
        val overage = projectedTotal - status.budget.amount.amount
        return if (overage > 0) Cents(overage) else Cents.ZERO
    }

    /**
     * Linear expected progress: fraction of time elapsed from goal creation to target date.
     */
    private fun calculateExpectedProgress(goal: Goal, referenceDate: LocalDate): Double {
        val targetDate = goal.targetDate ?: return 0.0
        val createdDate = kotlinx.datetime.Instant.fromEpochMilliseconds(
            goal.createdAt.toEpochMilliseconds()
        ).toLocalDateTime(kotlinx.datetime.TimeZone.UTC).date
        val totalDays = createdDate.daysUntil(targetDate)
        if (totalDays <= 0) return 1.0
        val elapsedDays = createdDate.daysUntil(referenceDate)
        return (elapsedDays.toDouble() / totalDays).coerceIn(0.0, 1.0)
    }

    /** Helper extension: kotlinx.datetime [LocalDate] range containment. */
    private operator fun ClosedRange<LocalDate>.contains(date: LocalDate): Boolean =
        date >= start && date <= endInclusive
}
