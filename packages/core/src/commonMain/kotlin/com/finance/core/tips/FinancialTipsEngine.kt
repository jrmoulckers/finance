// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.tips

import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*

/**
 * Generates context-aware financial tips based on transaction patterns,
 * budget status, goal progress, and account health.
 *
 * Pure commonMain — no platform dependencies.
 * All monetary values use [Cents] (Long-backed) for exact precision.
 * All date/time operations use kotlinx-datetime exclusively.
 *
 * ## Tip Rules
 *
 * | # | Rule                    | Trigger                                            | Priority |
 * |---|-------------------------|----------------------------------------------------|----------|
 * | 1 | Budget Over             | Budget utilization > 100%                          | HIGH     |
 * | 2 | Budget Warning          | Budget utilization 75–100%                         | MEDIUM   |
 * | 3 | Goal Almost Complete    | Goal progress ≥ 90% but < 100%                    | MEDIUM   |
 * | 4 | Goal Stale              | Active goal with no contributions in 30+ days      | LOW      |
 * | 5 | Spending Spike          | Category spending ≥ 30% above 3-month average     | HIGH     |
 * | 6 | No Budget Categories    | Top spending categories without a budget            | LOW      |
 * | 7 | Low Savings Rate        | Savings rate < 10% for the current month           | HIGH     |
 * | 8 | Positive Savings Streak | 3+ consecutive months with positive cash flow      | LOW      |
 * | 9 | Large Transaction       | Single transaction ≥ 20% of monthly income         | MEDIUM   |
 * |10 | No Emergency Fund       | No savings account or savings balance < 1 mo exp   | MEDIUM   |
 *
 * Tips are returned sorted by priority (HIGH first) then by category.
 */
object FinancialTipsEngine {

    /** Spending spike threshold: 30% above 3-month average. */
    private const val SPIKE_THRESHOLD_PERCENT = 30.0

    /** Goal is "almost complete" when progress ≥ this value. */
    private const val GOAL_ALMOST_COMPLETE_THRESHOLD = 0.90

    /** Days without a goal contribution before it's considered stale. */
    private const val GOAL_STALE_DAYS = 30

    /** Savings rate below this triggers a tip. */
    private const val LOW_SAVINGS_RATE_PERCENT = 10.0

    /** A single transaction is "large" if it exceeds this fraction of monthly income. */
    private const val LARGE_TRANSACTION_INCOME_FRACTION = 0.20

    /** Minimum consecutive months of positive cash flow to earn a streak tip. */
    private const val POSITIVE_STREAK_MONTHS = 3

    /**
     * Generate all applicable tips from the user's financial context.
     *
     * @param context Immutable snapshot of the user's financial data.
     * @param referenceDate The date to evaluate against (defaults to today UTC).
     * @return List of [FinancialTip] sorted by priority descending, then category.
     */
    fun generateTips(
        context: FinancialContext,
        referenceDate: LocalDate = currentDate(),
    ): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        tips.addAll(budgetTips(context.budgets, context.transactions, referenceDate))
        tips.addAll(goalTips(context.goals, context.transactions, referenceDate))
        tips.addAll(spendingSpikeTips(context.transactions, referenceDate))
        tips.addAll(noBudgetCategoryTips(context.transactions, context.budgets, referenceDate))
        lowSavingsRateTip(context.transactions, referenceDate)?.let { tips.add(it) }
        positiveSavingsStreakTip(context.transactions, referenceDate)?.let { tips.add(it) }
        tips.addAll(largeTransactionTips(context.transactions, referenceDate))
        noEmergencyFundTip(context.accounts, context.transactions, referenceDate)?.let { tips.add(it) }

        return tips.sortedWith(
            compareByDescending<FinancialTip> { it.priority.ordinal }
                .thenBy { it.category.ordinal },
        )
    }

    // ── Rule 1 & 2: Budget tips ──────────────────────────────────────

    internal fun budgetTips(
        budgets: List<Budget>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<FinancialTip> {
        return budgets.mapNotNull { budget ->
            val categoryTxns = transactions.filter { it.categoryId == budget.categoryId }
            val status = BudgetCalculator.calculateStatus(budget, categoryTxns, referenceDate)

            when (status.healthLevel) {
                BudgetHealth.OVER -> FinancialTip(
                    id = "budget-over-${budget.id.value}",
                    title = "Budget exceeded: ${budget.name}",
                    description = "You've spent ${formatCents(status.spent)} of your " +
                        "${formatCents(budget.amount)} ${budget.name} budget. " +
                        "Consider adjusting spending for the rest of the period.",
                    category = TipCategory.BUDGET,
                    priority = TipPriority.HIGH,
                    amountCents = Cents(status.spent.amount - budget.amount.amount),
                    relatedCategoryId = budget.categoryId,
                    actionHint = "navigate:budgets",
                )
                BudgetHealth.WARNING -> FinancialTip(
                    id = "budget-warning-${budget.id.value}",
                    title = "Budget almost reached: ${budget.name}",
                    description = "You've used ${(status.utilization * 100).toInt()}% " +
                        "of your ${budget.name} budget with " +
                        "${formatCents(status.remaining)} remaining.",
                    category = TipCategory.BUDGET,
                    priority = TipPriority.MEDIUM,
                    amountCents = status.remaining,
                    relatedCategoryId = budget.categoryId,
                    actionHint = "navigate:budgets",
                )
                BudgetHealth.HEALTHY -> null
            }
        }
    }

    // ── Rule 3 & 4: Goal tips ────────────────────────────────────────

    internal fun goalTips(
        goals: List<Goal>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        for (goal in goals.filter { it.status == GoalStatus.ACTIVE && it.deletedAt == null }) {
            // Rule 3: Almost complete
            if (goal.progress >= GOAL_ALMOST_COMPLETE_THRESHOLD && !goal.isComplete) {
                val remaining = Cents(goal.targetAmount.amount - goal.currentAmount.amount)
                tips.add(
                    FinancialTip(
                        id = "goal-almost-${goal.id.value}",
                        title = "Almost there: ${goal.name}",
                        description = "You're ${(goal.progress * 100).toInt()}% toward your " +
                            "${goal.name} goal! Just ${formatCents(remaining)} to go.",
                        category = TipCategory.SAVINGS,
                        priority = TipPriority.MEDIUM,
                        amountCents = remaining,
                        actionHint = "navigate:goals",
                    ),
                )
            }

            // Rule 4: Stale goal
            if (goal.accountId != null) {
                val recentContributions = transactions.filter { txn ->
                    txn.accountId == goal.accountId &&
                        txn.type == TransactionType.INCOME &&
                        txn.deletedAt == null &&
                        txn.date >= referenceDate.minus(GOAL_STALE_DAYS, DateTimeUnit.DAY)
                }
                if (recentContributions.isEmpty()) {
                    tips.add(
                        FinancialTip(
                            id = "goal-stale-${goal.id.value}",
                            title = "Keep momentum: ${goal.name}",
                            description = "No contributions to ${goal.name} in the last " +
                                "$GOAL_STALE_DAYS days. Even small amounts help!",
                            category = TipCategory.SAVINGS,
                            priority = TipPriority.LOW,
                            actionHint = "navigate:goals",
                        ),
                    )
                }
            }
        }

        return tips
    }

    // ── Rule 5: Spending spikes ──────────────────────────────────────

    internal fun spendingSpikeTips(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<FinancialTip> {
        val activeExpenses = transactions.filter {
            it.type == TransactionType.EXPENSE && it.deletedAt == null
        }

        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = endOfMonth(referenceDate)

        // Current month by category
        val currentByCategory = activeExpenses
            .filter { it.date in currentStart..currentEnd && it.categoryId != null }
            .groupBy { it.categoryId!! }
            .mapValues { (_, txns) -> Cents(txns.sumOf { it.amount.abs().amount }) }

        // 3-month average by category
        val historicalTotals = mutableMapOf<SyncId, Long>()
        for (offset in 1..3) {
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = endOfMonth(start)
            activeExpenses
                .filter { it.date in start..end && it.categoryId != null }
                .groupBy { it.categoryId!! }
                .forEach { (catId, txns) ->
                    historicalTotals[catId] =
                        (historicalTotals[catId] ?: 0L) + txns.sumOf { it.amount.abs().amount }
                }
        }
        val avgByCategory = historicalTotals.mapValues { Cents(it.value / 3) }

        return currentByCategory.mapNotNull { (categoryId, currentSpending) ->
            val avg = avgByCategory[categoryId] ?: return@mapNotNull null
            if (avg.isZero()) return@mapNotNull null

            val increasePercent = ((currentSpending.amount - avg.amount).toDouble() / avg.amount) * 100.0
            if (increasePercent >= SPIKE_THRESHOLD_PERCENT) {
                val overspend = Cents(currentSpending.amount - avg.amount)
                FinancialTip(
                    id = "spending-spike-${categoryId.value}",
                    title = "Spending spike detected",
                    description = "Spending in this category is ${increasePercent.toInt()}% " +
                        "above your 3-month average (${formatCents(overspend)} more).",
                    category = TipCategory.SPENDING,
                    priority = TipPriority.HIGH,
                    amountCents = overspend,
                    relatedCategoryId = categoryId,
                    actionHint = "navigate:transactions",
                )
            } else null
        }
    }

    // ── Rule 6: Unbudgeted top-spending categories ───────────────────

    internal fun noBudgetCategoryTips(
        transactions: List<Transaction>,
        budgets: List<Budget>,
        referenceDate: LocalDate,
    ): List<FinancialTip> {
        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = endOfMonth(referenceDate)

        val spendingByCategory = FinancialAggregator.spendingByCategory(
            transactions, currentStart, currentEnd,
        )

        val budgetedCategories = budgets.map { it.categoryId }.toSet()

        // Top 3 unbudgeted categories by spending
        return spendingByCategory
            .filterKeys { it != null && it !in budgetedCategories }
            .entries
            .sortedByDescending { it.value.amount }
            .take(3)
            .map { (categoryId, spent) ->
                FinancialTip(
                    id = "no-budget-${categoryId!!.value}",
                    title = "Consider setting a budget",
                    description = "You spent ${formatCents(spent)} this month in a category " +
                        "without a budget. A budget helps track and control spending.",
                    category = TipCategory.BUDGET,
                    priority = TipPriority.LOW,
                    amountCents = spent,
                    relatedCategoryId = categoryId,
                    actionHint = "navigate:budgets:create",
                )
            }
    }

    // ── Rule 7: Low savings rate ─────────────────────────────────────

    internal fun lowSavingsRateTip(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): FinancialTip? {
        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = endOfMonth(referenceDate)

        val savingsRate = FinancialAggregator.savingsRate(transactions, currentStart, currentEnd)
        val income = FinancialAggregator.totalIncome(transactions, currentStart, currentEnd)

        if (income.isZero()) return null
        if (savingsRate >= LOW_SAVINGS_RATE_PERCENT) return null

        return FinancialTip(
            id = "low-savings-rate",
            title = "Your savings rate needs attention",
            description = "Your savings rate this month is ${savingsRate.toInt()}%. " +
                "Financial experts recommend saving at least 10-20% of income.",
            category = TipCategory.SAVINGS,
            priority = TipPriority.HIGH,
            actionHint = "navigate:goals",
        )
    }

    // ── Rule 8: Positive savings streak ──────────────────────────────

    internal fun positiveSavingsStreakTip(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): FinancialTip? {
        var consecutivePositiveMonths = 0

        for (offset in 0 until 6) {
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = endOfMonth(start)

            val cashFlow = FinancialAggregator.netCashFlow(transactions, start, end)
            if (cashFlow.isPositive()) {
                consecutivePositiveMonths++
            } else {
                break
            }
        }

        if (consecutivePositiveMonths >= POSITIVE_STREAK_MONTHS) {
            return FinancialTip(
                id = "positive-streak-$consecutivePositiveMonths",
                title = "Great savings streak!",
                description = "You've had positive cash flow for $consecutivePositiveMonths " +
                    "consecutive months. Keep up the good work!",
                category = TipCategory.SAVINGS,
                priority = TipPriority.LOW,
            )
        }

        return null
    }

    // ── Rule 9: Large transactions ───────────────────────────────────

    internal fun largeTransactionTips(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): List<FinancialTip> {
        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = endOfMonth(referenceDate)

        val monthlyIncome = FinancialAggregator.totalIncome(
            transactions, currentStart, currentEnd,
        )
        if (monthlyIncome.isZero()) return emptyList()

        val threshold = Cents((monthlyIncome.amount * LARGE_TRANSACTION_INCOME_FRACTION).toLong())

        return transactions
            .filter {
                it.type == TransactionType.EXPENSE &&
                    it.deletedAt == null &&
                    it.date in currentStart..currentEnd &&
                    it.amount.abs().amount >= threshold.amount
            }
            .map { txn ->
                val pct = ((txn.amount.abs().amount.toDouble() / monthlyIncome.amount) * 100).toInt()
                FinancialTip(
                    id = "large-txn-${txn.id.value}",
                    title = "Large expense detected",
                    description = "A ${formatCents(txn.amount.abs())} expense represents " +
                        "$pct% of your monthly income." +
                        (txn.payee?.let { " Payee: $it." } ?: ""),
                    category = TipCategory.SPENDING,
                    priority = TipPriority.MEDIUM,
                    amountCents = txn.amount.abs(),
                    relatedCategoryId = txn.categoryId,
                    relatedAccountId = txn.accountId,
                    actionHint = "navigate:transactions",
                )
            }
    }

    // ── Rule 10: No emergency fund ───────────────────────────────────

    internal fun noEmergencyFundTip(
        accounts: List<Account>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): FinancialTip? {
        val currentStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val currentEnd = endOfMonth(referenceDate)

        val monthlyExpenses = FinancialAggregator.totalSpending(
            transactions, currentStart, currentEnd,
        )

        val savingsBalance = Cents(
            accounts
                .filter {
                    it.type == AccountType.SAVINGS &&
                        it.deletedAt == null &&
                        !it.isArchived
                }
                .sumOf { it.currentBalance.amount },
        )

        // No savings accounts, or savings < 1 month of expenses
        if (savingsBalance.amount < monthlyExpenses.amount && monthlyExpenses.isPositive()) {
            return FinancialTip(
                id = "no-emergency-fund",
                title = "Build an emergency fund",
                description = "Your savings balance (${formatCents(savingsBalance)}) is less " +
                    "than one month of expenses (${formatCents(monthlyExpenses)}). " +
                    "Aim for 3-6 months of expenses in an emergency fund.",
                category = TipCategory.SAVINGS,
                priority = TipPriority.MEDIUM,
                amountCents = Cents(monthlyExpenses.amount - savingsBalance.amount),
                actionHint = "navigate:accounts",
            )
        }

        return null
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

    private fun formatCents(cents: Cents): String {
        val dollars = cents.amount / 100
        val remainder = kotlin.math.abs(cents.amount % 100)
        return "$${dollars}.${remainder.toString().padStart(2, '0')}"
    }

    internal fun currentDate(): LocalDate =
        Clock.System.now().toLocalDateTime(TimeZone.UTC).date
}
