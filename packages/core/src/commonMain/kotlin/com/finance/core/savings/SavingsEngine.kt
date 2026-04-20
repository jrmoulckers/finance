// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.savings

import com.finance.models.Budget
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import com.finance.core.budget.BudgetCalculator
import com.finance.core.subscription.DetectedSubscription
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Rule-based engine that analyses spending patterns, budget utilization,
 * and subscription data to generate personalized savings suggestions.
 *
 * Pure commonMain — no platform dependencies.
 * All monetary values use [Cents] (Long-backed) for exact precision.
 */
object SavingsEngine {

    /**
     * Generate all applicable savings suggestions from financial data.
     *
     * Rules evaluated:
     * 1. **Spending Spike** — categories where current month spending exceeds
     *    the prior 3-month average by ≥ 20%.
     * 2. **Unused Budget** — budgets with ≤ 50% utilization over 2+ months.
     * 3. **Subscription Savings** — subscriptions that could be consolidated or cancelled.
     * 4. **Income Allocation** — if savings rate < 20%, suggest allocating more income.
     * 5. **Rounding Savings** — estimate savings from rounding up every transaction.
     *
     * @param transactions     All available transactions.
     * @param budgets          Active budgets.
     * @param subscriptions    Detected subscriptions (from [SubscriptionDetector]).
     * @param referenceDate    The date to evaluate against.
     * @return List of [SavingsSuggestion] sorted by estimated savings descending.
     */
    fun generateSuggestions(
        transactions: List<Transaction>,
        budgets: List<Budget> = emptyList(),
        subscriptions: List<DetectedSubscription> = emptyList(),
        referenceDate: LocalDate,
    ): List<SavingsSuggestion> {
        val suggestions = mutableListOf<SavingsSuggestion>()

        suggestions.addAll(detectSpendingSpikes(transactions, referenceDate))
        suggestions.addAll(detectUnusedBudgets(budgets, transactions, referenceDate))
        suggestions.addAll(detectSubscriptionSavings(subscriptions))
        detectIncomeAllocationOpportunity(transactions, referenceDate)?.let { suggestions.add(it) }
        detectRoundUpSavings(transactions, referenceDate)?.let { suggestions.add(it) }

        return suggestions.sortedByDescending { it.estimatedMonthlySavings.amount }
    }

    // ── Rule 1: Spending spikes ──────────────────────────────────────

    /**
     * Detect categories where current month spending is ≥ 20% above the
     * 3-month historical average.
     */
    internal fun detectSpendingSpikes(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<SavingsSuggestion> {
        val activeExpenses = transactions.filter {
            it.type == TransactionType.EXPENSE && it.deletedAt == null
        }

        val currentMonthStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentMonthEnd = endOfMonth(referenceDate)

        // Current month by category
        val currentByCategory = activeExpenses
            .filter { it.date in currentMonthStart..currentMonthEnd }
            .groupBy { it.categoryId }
            .mapValues { (_, txns) -> Cents(txns.sumOf { it.amount.abs().amount }) }

        // 3-month average by category
        val avgByCategory = mutableMapOf<SyncId?, Cents>()
        for (offset in 1..3) {
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = endOfMonth(start)
            activeExpenses
                .filter { it.date in start..end }
                .groupBy { it.categoryId }
                .forEach { (catId, txns) ->
                    val total = txns.sumOf { it.amount.abs().amount }
                    val existing = avgByCategory[catId]?.amount ?: 0L
                    avgByCategory[catId] = Cents(existing + total)
                }
        }
        val avgByCategoryFinal = avgByCategory.mapValues { Cents(it.value.amount / 3) }

        return currentByCategory.mapNotNull { (categoryId, currentSpending) ->
            if (categoryId == null) return@mapNotNull null
            val historicalAvg = avgByCategoryFinal[categoryId] ?: return@mapNotNull null
            if (historicalAvg.isZero()) return@mapNotNull null

            val increasePercent = ((currentSpending.amount - historicalAvg.amount).toDouble() / historicalAvg.amount) * 100.0
            if (increasePercent >= 20.0) {
                val potentialSavings = Cents(currentSpending.amount - historicalAvg.amount)
                SavingsSuggestion(
                    type = SuggestionType.SPENDING_SPIKE,
                    title = "Spending spike detected",
                    description = "Spending in this category is ${increasePercent.toInt()}% above your 3-month average.",
                    estimatedMonthlySavings = potentialSavings,
                    categoryId = categoryId,
                    priority = SuggestionPriority.HIGH,
                )
            } else null
        }
    }

    // ── Rule 2: Unused budgets ───────────────────────────────────────

    /**
     * Detect budgets with ≤ 50% utilization — suggest lowering the budget
     * to free up funds for savings.
     */
    internal fun detectUnusedBudgets(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<SavingsSuggestion> {
        return budgets.mapNotNull { budget ->
            val categoryTxns = transactions.filter { it.categoryId == budget.categoryId }
            val status = BudgetCalculator.calculateStatus(budget, categoryTxns, referenceDate)
            if (status.utilization <= 0.50 && status.budget.amount.amount > 0) {
                val unusedAmount = Cents(budget.amount.amount - status.spent.amount)
                val halfUnused = Cents(unusedAmount.amount / 2)
                SavingsSuggestion(
                    type = SuggestionType.UNUSED_BUDGET,
                    title = "Budget underutilized",
                    description = "\"${budget.name}\" is only ${(status.utilization * 100).toInt()}% used. " +
                        "Consider reducing it to save more.",
                    estimatedMonthlySavings = halfUnused,
                    categoryId = budget.categoryId,
                    priority = SuggestionPriority.MEDIUM,
                )
            } else null
        }
    }

    // ── Rule 3: Subscription savings ─────────────────────────────────

    /**
     * Flag subscriptions as potential savings opportunities.
     * Low-confidence subscriptions or those with few occurrences are
     * flagged for review.
     */
    internal fun detectSubscriptionSavings(
        subscriptions: List<DetectedSubscription>,
    ): List<SavingsSuggestion> {
        return subscriptions.map { sub ->
            SavingsSuggestion(
                type = SuggestionType.SUBSCRIPTION_REVIEW,
                title = "Review subscription: ${sub.payee}",
                description = "You pay ~${formatCents(sub.estimatedMonthlyCost)}/mo for ${sub.payee}. " +
                    "Review whether you still need this service.",
                estimatedMonthlySavings = sub.estimatedMonthlyCost,
                priority = when {
                    sub.estimatedMonthlyCost.amount >= 5000 -> SuggestionPriority.HIGH // $50+/mo
                    sub.estimatedMonthlyCost.amount >= 1000 -> SuggestionPriority.MEDIUM // $10+/mo
                    else -> SuggestionPriority.LOW
                },
            )
        }
    }

    // ── Rule 4: Income allocation ────────────────────────────────────

    /**
     * If savings rate is below 20%, suggest increasing it.
     */
    internal fun detectIncomeAllocationOpportunity(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): SavingsSuggestion? {
        val monthStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val monthEnd = endOfMonth(referenceDate)

        val activeTxns = transactions.filter { it.deletedAt == null }

        val income = activeTxns
            .filter {
                it.type == TransactionType.INCOME &&
                    it.date in monthStart..monthEnd
            }
            .sumOf { it.amount.abs().amount }

        val expenses = activeTxns
            .filter {
                it.type == TransactionType.EXPENSE &&
                    it.date in monthStart..monthEnd
            }
            .sumOf { it.amount.abs().amount }

        if (income <= 0) return null

        val savingsRate = ((income - expenses).toDouble() / income) * 100.0

        if (savingsRate < 20.0) {
            val targetSavings = Cents((income * 20) / 100)
            val currentSavings = Cents((income - expenses).coerceAtLeast(0))
            val gap = Cents(targetSavings.amount - currentSavings.amount)

            if (gap.amount > 0) {
                return SavingsSuggestion(
                    type = SuggestionType.INCOME_ALLOCATION,
                    title = "Increase your savings rate",
                    description = "Your savings rate is ${savingsRate.toInt()}%. " +
                        "Aim for 20% by saving an additional ${formatCents(gap)}/mo.",
                    estimatedMonthlySavings = gap,
                    priority = SuggestionPriority.HIGH,
                )
            }
        }

        return null
    }

    // ── Rule 5: Round-up savings ─────────────────────────────────────

    /**
     * Estimate how much would be saved by rounding up every expense
     * transaction to the nearest dollar.
     */
    internal fun detectRoundUpSavings(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): SavingsSuggestion? {
        val monthStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val monthEnd = endOfMonth(referenceDate)

        val expenses = transactions.filter {
            it.type == TransactionType.EXPENSE &&
                it.deletedAt == null &&
                it.date in monthStart..monthEnd
        }

        if (expenses.isEmpty()) return null

        val totalRoundUp = expenses.sumOf { txn ->
            val cents = txn.amount.abs().amount
            val remainder = cents % 100
            if (remainder == 0L) 0L else 100L - remainder
        }

        if (totalRoundUp <= 0) return null

        return SavingsSuggestion(
            type = SuggestionType.ROUND_UP,
            title = "Round-up savings",
            description = "Rounding up every expense to the nearest dollar would save ~${formatCents(Cents(totalRoundUp))}/mo.",
            estimatedMonthlySavings = Cents(totalRoundUp),
            priority = SuggestionPriority.LOW,
        )
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
enum class SuggestionType {
    SPENDING_SPIKE,
    UNUSED_BUDGET,
    SUBSCRIPTION_REVIEW,
    INCOME_ALLOCATION,
    ROUND_UP,
}

@Serializable
enum class SuggestionPriority { LOW, MEDIUM, HIGH }

/**
 * A personalized savings suggestion with estimated impact.
 */
@Serializable
data class SavingsSuggestion(
    val type: SuggestionType,
    val title: String,
    val description: String,
    val estimatedMonthlySavings: Cents,
    val categoryId: SyncId? = null,
    val priority: SuggestionPriority = SuggestionPriority.MEDIUM,
) {
    val estimatedAnnualSavings: Cents get() = Cents(estimatedMonthlySavings.amount * 12)
}
