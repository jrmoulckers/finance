// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recommendation

import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Budget optimization engine that analyses historical spending and current
 * budget performance to recommend adjustments.
 *
 * Pure commonMain — no platform dependencies.
 * All monetary values use [Cents] (Long-backed) for exact precision.
 */
object BudgetRecommendationEngine {

    /** Default lookback period for historical analysis. */
    private const val DEFAULT_LOOKBACK_MONTHS = 3

    /** Threshold below which a budget is considered too tight. */
    private const val OVER_BUDGET_THRESHOLD = 1.0

    /** Threshold below which a budget is considered underutilized. */
    private const val UNDERUTILIZED_THRESHOLD = 0.5

    /**
     * Generate all budget recommendations based on financial data.
     *
     * Strategies:
     * 1. **Adjust Over-Budget** — budgets consistently exceeded → suggest increasing.
     * 2. **Reduce Under-Budget** — budgets consistently underused → suggest decreasing.
     * 3. **New Budget Suggestion** — categories without budgets that have consistent spending.
     * 4. **Rebalance** — suggest reallocating from underused to overused budgets.
     * 5. **50/30/20 Alignment** — compare total allocation against the 50/30/20 rule.
     *
     * @param budgets         Active budgets.
     * @param transactions    All available transactions.
     * @param totalIncome     Monthly income in cents (for ratio calculations).
     * @param referenceDate   The date to evaluate against.
     * @return Sorted list of [BudgetRecommendation]s by priority then impact.
     */
    fun generateRecommendations(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        totalIncome: Cents,
        referenceDate: LocalDate,
    ): List<BudgetRecommendation> {
        val recommendations = mutableListOf<BudgetRecommendation>()

        recommendations.addAll(recommendOverBudgetAdjustments(budgets, transactions, referenceDate))
        recommendations.addAll(recommendUnderBudgetReductions(budgets, transactions, referenceDate))
        recommendations.addAll(suggestNewBudgets(budgets, transactions, referenceDate))
        recommendations.addAll(suggestRebalancing(budgets, transactions, referenceDate))
        recommend503020(budgets, transactions, totalIncome, referenceDate)?.let { recommendations.add(it) }

        return recommendations.sortedWith(
            compareByDescending<BudgetRecommendation> { it.priority.ordinal }
                .thenByDescending { it.impactCents.amount },
        )
    }

    // ── Strategy 1: Over-budget adjustments ──────────────────────────

    /**
     * Identify budgets that are consistently exceeded and recommend
     * increasing the allocation to a realistic level.
     */
    internal fun recommendOverBudgetAdjustments(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<BudgetRecommendation> {
        return budgets.mapNotNull { budget ->
            val categoryTxns = transactions.filter { it.categoryId == budget.categoryId }
            val status = BudgetCalculator.calculateStatus(budget, categoryTxns, referenceDate)
            if (status.utilization > OVER_BUDGET_THRESHOLD) {
                // Recommend setting budget to actual spending + 10% buffer
                val recommended = Cents(status.spent.amount + status.spent.amount / 10)
                val increase = Cents(recommended.amount - budget.amount.amount)

                BudgetRecommendation(
                    type = RecommendationType.INCREASE_BUDGET,
                    budgetId = budget.id,
                    categoryId = budget.categoryId,
                    title = "Increase \"${budget.name}\" budget",
                    description = "This budget is over by ${formatCents(status.spent - budget.amount)}. " +
                        "Consider raising it to ${formatCents(recommended)} for a realistic target.",
                    currentAmount = budget.amount,
                    recommendedAmount = recommended,
                    impactCents = increase,
                    priority = RecommendationPriority.HIGH,
                )
            } else null
        }
    }

    // ── Strategy 2: Under-budget reductions ──────────────────────────

    /**
     * Identify budgets that are consistently underused and recommend
     * reducing the allocation to free up funds.
     */
    internal fun recommendUnderBudgetReductions(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<BudgetRecommendation> {
        return budgets.mapNotNull { budget ->
            val categoryTxns = transactions.filter { it.categoryId == budget.categoryId }
            val status = BudgetCalculator.calculateStatus(budget, categoryTxns, referenceDate)
            if (status.utilization <= UNDERUTILIZED_THRESHOLD && budget.amount.amount > 0) {
                // Recommend setting budget to actual spending + 20% buffer
                val recommended = Cents(status.spent.amount + status.spent.amount / 5)
                    .let { if (it.isZero()) Cents(budget.amount.amount / 2) else it }
                val savings = Cents(budget.amount.amount - recommended.amount)

                if (savings.amount > 0) {
                    BudgetRecommendation(
                        type = RecommendationType.DECREASE_BUDGET,
                        budgetId = budget.id,
                        categoryId = budget.categoryId,
                        title = "Reduce \"${budget.name}\" budget",
                        description = "Only ${(status.utilization * 100).toInt()}% used. " +
                            "Reducing to ${formatCents(recommended)} frees up ${formatCents(savings)}/period.",
                        currentAmount = budget.amount,
                        recommendedAmount = recommended,
                        impactCents = savings,
                        priority = RecommendationPriority.MEDIUM,
                    )
                } else null
            } else null
        }
    }

    // ── Strategy 3: New budget suggestions ───────────────────────────

    /**
     * Identify categories with consistent spending but no budget,
     * and suggest creating one.
     */
    internal fun suggestNewBudgets(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<BudgetRecommendation> {
        val budgetedCategories = budgets.map { it.categoryId }.toSet()

        val expenses = transactions.filter {
            it.type == TransactionType.EXPENSE &&
                it.deletedAt == null &&
                it.categoryId != null &&
                it.categoryId !in budgetedCategories
        }

        // Analyse spending per unbudgeted category over last 3 months
        val monthlyTotals = mutableMapOf<SyncId, MutableList<Long>>()

        for (offset in 0 until DEFAULT_LOOKBACK_MONTHS) {
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = endOfMonth(start)

            expenses
                .filter { it.date in start..end }
                .groupBy { it.categoryId!! }
                .forEach { (catId, txns) ->
                    monthlyTotals.getOrPut(catId) { mutableListOf() }
                        .add(txns.sumOf { it.amount.abs().amount })
                }
        }

        return monthlyTotals
            .filter { (_, totals) -> totals.size >= 2 } // at least 2 months of data
            .map { (categoryId, totals) ->
                val avgMonthly = totals.sum() / totals.size
                // Suggest budget at average + 10% buffer
                val recommended = Cents(avgMonthly + avgMonthly / 10)

                BudgetRecommendation(
                    type = RecommendationType.CREATE_BUDGET,
                    categoryId = categoryId,
                    title = "Create a budget for this category",
                    description = "You spend ~${formatCents(Cents(avgMonthly))}/mo here. " +
                        "A budget of ${formatCents(recommended)} would help track it.",
                    recommendedAmount = recommended,
                    impactCents = recommended,
                    priority = RecommendationPriority.LOW,
                )
            }
    }

    // ── Strategy 4: Rebalancing ──────────────────────────────────────

    /**
     * Suggest shifting funds from underused budgets to overused ones.
     */
    @Suppress("ReturnCount")
    internal fun suggestRebalancing(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<BudgetRecommendation> {
        val statuses = budgets.map { budget ->
            val categoryTxns = transactions.filter { it.categoryId == budget.categoryId }
            budget to BudgetCalculator.calculateStatus(budget, categoryTxns, referenceDate)
        }

        val overBudget = statuses.filter { it.second.healthLevel == BudgetHealth.OVER }
        val underBudget = statuses.filter {
            it.second.utilization <= UNDERUTILIZED_THRESHOLD && it.second.budget.amount.amount > 0
        }

        if (overBudget.isEmpty() || underBudget.isEmpty()) return emptyList()

        // Compute total surplus from underused budgets
        val totalSurplus = underBudget.sumOf { (budget, status) ->
            (budget.amount.amount - status.spent.amount).coerceAtLeast(0)
        }

        // Compute total deficit in overused budgets
        val totalDeficit = overBudget.sumOf { (budget, status) ->
            (status.spent.amount - budget.amount.amount).coerceAtLeast(0)
        }

        val rebalanceAmount = Cents(minOf(totalSurplus, totalDeficit))

        if (rebalanceAmount.amount <= 0) return emptyList()

        return listOf(
            BudgetRecommendation(
                type = RecommendationType.REBALANCE,
                title = "Rebalance your budgets",
                description = "You have ${formatCents(Cents(totalSurplus))} unused across " +
                    "${underBudget.size} budget(s) while ${overBudget.size} budget(s) are over. " +
                    "Reallocating ${formatCents(rebalanceAmount)} could balance things out.",
                impactCents = rebalanceAmount,
                priority = RecommendationPriority.MEDIUM,
            ),
        )
    }

    // ── Strategy 5: 50/30/20 alignment ───────────────────────────────

    /**
     * Compare total budget allocation against the 50/30/20 rule:
     * - 50% needs (essentials)
     * - 30% wants (discretionary)
     * - 20% savings
     *
     * Returns a recommendation if total budgeted spending exceeds 80% of income.
     */
    @Suppress("ReturnCount", "UnusedParameter")
    internal fun recommend503020(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        totalIncome: Cents,
        referenceDate: LocalDate,
    ): BudgetRecommendation? {
        if (totalIncome.isZero()) return null

        val totalBudgeted = Cents(budgets.sumOf { it.amount.amount })
        val spendingRatio = totalBudgeted.amount.toDouble() / totalIncome.amount

        if (spendingRatio > 0.80) {
            val target80 = Cents(totalIncome.amount * 80 / 100)
            val excess = Cents(totalBudgeted.amount - target80.amount)

            return BudgetRecommendation(
                type = RecommendationType.RATIO_ADJUSTMENT,
                title = "Align with the 50/30/20 rule",
                description = "Total budgets are ${(spendingRatio * 100).toInt()}% of income. " +
                    "The 50/30/20 rule suggests keeping spending under 80% to save 20%. " +
                    "Reducing by ${formatCents(excess)} would get you there.",
                currentAmount = totalBudgeted,
                recommendedAmount = target80,
                impactCents = excess,
                priority = RecommendationPriority.HIGH,
            )
        }

        return null
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private fun endOfMonth(date: LocalDate): LocalDate {
        val nextMonth = if (date.month == Month.DECEMBER) {
            LocalDate(date.year + 1, Month.JANUARY, 1)
        } else {
            LocalDate(date.year, Month.entries[date.month.ordinal + 1], 1)
        }
        return nextMonth.minus(1, DateTimeUnit.DAY)
    }

    private fun formatCents(cents: Cents): String {
        val dollars = cents.amount / 100
        val remainder = kotlin.math.abs(cents.amount % 100)
        return "$${dollars}.${remainder.toString().padStart(2, '0')}"
    }
}

// ── Data classes ─────────────────────────────────────────────────────

@Serializable
enum class RecommendationType {
    INCREASE_BUDGET,
    DECREASE_BUDGET,
    CREATE_BUDGET,
    REBALANCE,
    RATIO_ADJUSTMENT,
}

@Serializable
enum class RecommendationPriority { LOW, MEDIUM, HIGH }

/**
 * A budget optimization recommendation with before/after amounts and impact.
 */
@Serializable
data class BudgetRecommendation(
    val type: RecommendationType,
    val budgetId: SyncId? = null,
    val categoryId: SyncId? = null,
    val title: String,
    val description: String,
    val currentAmount: Cents? = null,
    val recommendedAmount: Cents? = null,
    /** The absolute magnitude of savings or reallocation, in cents. */
    val impactCents: Cents,
    val priority: RecommendationPriority = RecommendationPriority.MEDIUM,
)
