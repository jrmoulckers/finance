// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.tips

import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Budget
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime

/**
 * Context for generating financial tips.
 *
 * Bundles the current financial state so the [TipsEngine] can produce
 * relevant, personalised advice without repeated repository access.
 */
data class TipsContext(
    val accounts: List<Account>,
    val transactions: List<Transaction>,
    val budgets: List<Budget>,
    val today: LocalDate = Clock.System.now()
        .toLocalDateTime(TimeZone.currentSystemDefault()).date,
)

/**
 * Severity / visual treatment for a tip.
 */
enum class TipPriority { INFO, SUGGESTION, WARNING, URGENT }

/**
 * A single financial tip to display to the user.
 *
 * @property id Stable identifier for dismiss / read tracking.
 * @property title Short headline (≤60 chars recommended).
 * @property description Extended explanation.
 * @property priority Controls visual styling and sort order.
 * @property category Grouping label (e.g. "Budget", "Savings").
 * @property actionLabel Optional CTA button text.
 */
data class FinancialTip(
    val id: String,
    val title: String,
    val description: String,
    val priority: TipPriority,
    val category: String,
    val actionLabel: String? = null,
)

/**
 * Pure-logic engine that analyses financial data and produces contextual tips.
 *
 * Stateless — call [generate] with a snapshot of the user's data and receive
 * an ordered list of [FinancialTip]s sorted by priority (urgent first).
 */
object TipsEngine {

    /**
     * Generate all applicable tips for the given [context].
     */
    fun generate(context: TipsContext): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        tips.addAll(budgetTips(context))
        tips.addAll(spendingTips(context))
        tips.addAll(savingsTips(context))
        tips.addAll(accountTips(context))
        tips.addAll(generalTips(context))

        return tips.sortedByDescending { it.priority.ordinal }
    }

    // ── Budget tips ──────────────────────────────────────────────────

    private fun budgetTips(ctx: TipsContext): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        ctx.budgets.forEach { budget ->
            val catTxns = ctx.transactions.filter { it.categoryId == budget.categoryId }
            val status = BudgetCalculator.calculateStatus(budget, catTxns, ctx.today)

            when (status.healthLevel) {
                BudgetHealth.OVER -> tips.add(
                    FinancialTip(
                        id = "budget-over-${budget.id.value}",
                        title = "${budget.name} budget exceeded",
                        description = "You've spent more than your ${budget.name} budget allows. " +
                            "Consider reviewing recent purchases and finding areas to cut back.",
                        priority = TipPriority.URGENT,
                        category = "Budget",
                        actionLabel = "View Budget",
                    ),
                )
                BudgetHealth.WARNING -> tips.add(
                    FinancialTip(
                        id = "budget-warn-${budget.id.value}",
                        title = "${budget.name} is nearing its limit",
                        description = "Your ${budget.name} budget is at " +
                            "${(status.utilization * 100).toInt()}%. " +
                            "Pace your spending to stay within budget this period.",
                        priority = TipPriority.WARNING,
                        category = "Budget",
                        actionLabel = "View Budget",
                    ),
                )
                BudgetHealth.HEALTHY -> { /* no tip needed */ }
            }
        }

        if (ctx.budgets.isEmpty()) {
            tips.add(
                FinancialTip(
                    id = "no-budgets",
                    title = "Start budgeting today",
                    description = "Creating budgets helps you track spending and reach your " +
                        "financial goals. Set up your first budget to get started.",
                    priority = TipPriority.SUGGESTION,
                    category = "Budget",
                    actionLabel = "Create Budget",
                ),
            )
        }

        return tips
    }

    // ── Spending tips ────────────────────────────────────────────────

    private fun spendingTips(ctx: TipsContext): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        val weekAgo = ctx.today.minus(7, DateTimeUnit.DAY)
        val twoWeeksAgo = ctx.today.minus(14, DateTimeUnit.DAY)

        val thisWeek = ctx.transactions.filter {
            it.type == TransactionType.EXPENSE && it.date >= weekAgo && it.date <= ctx.today
        }
        val lastWeek = ctx.transactions.filter {
            it.type == TransactionType.EXPENSE && it.date >= twoWeeksAgo && it.date < weekAgo
        }

        val thisWeekTotal = thisWeek.sumOf { it.amount.abs().amount }
        val lastWeekTotal = lastWeek.sumOf { it.amount.abs().amount }

        if (lastWeekTotal > 0 && thisWeekTotal > lastWeekTotal * 1.3) {
            val pctIncrease = ((thisWeekTotal - lastWeekTotal) * 100 / lastWeekTotal).toInt()
            tips.add(
                FinancialTip(
                    id = "spending-spike",
                    title = "Spending is up ${pctIncrease}% this week",
                    description = "Your spending has increased compared to last week. " +
                        "Review your recent transactions to identify discretionary expenses.",
                    priority = TipPriority.WARNING,
                    category = "Spending",
                    actionLabel = "View Transactions",
                ),
            )
        }

        // Large single transaction tip
        val recentExpenses = ctx.transactions.filter {
            it.type == TransactionType.EXPENSE && it.date >= weekAgo
        }
        val avgExpense = if (recentExpenses.isNotEmpty()) {
            recentExpenses.sumOf { it.amount.abs().amount } / recentExpenses.size
        } else 0L

        recentExpenses.filter { it.amount.abs().amount > avgExpense * 3 && avgExpense > 0 }
            .take(1)
            .forEach { txn ->
                tips.add(
                    FinancialTip(
                        id = "large-txn-${txn.id.value}",
                        title = "Large expense detected",
                        description = "A recent transaction of ${txn.payee ?: "unknown"} " +
                            "was significantly higher than your average. Was this planned?",
                        priority = TipPriority.INFO,
                        category = "Spending",
                    ),
                )
            }

        return tips
    }

    // ── Savings tips ─────────────────────────────────────────────────

    private fun savingsTips(ctx: TipsContext): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        val savingsAccounts = ctx.accounts.filter {
            it.type == AccountType.SAVINGS && !it.isArchived
        }

        if (savingsAccounts.isEmpty()) {
            tips.add(
                FinancialTip(
                    id = "no-savings-account",
                    title = "Consider opening a savings account",
                    description = "A dedicated savings account helps separate your spending " +
                        "money from your savings, making it easier to build an emergency fund.",
                    priority = TipPriority.SUGGESTION,
                    category = "Savings",
                ),
            )
        }

        // Emergency fund check
        val monthlyExpenses = ctx.transactions.filter {
            it.type == TransactionType.EXPENSE &&
                it.date >= ctx.today.minus(1, DateTimeUnit.MONTH)
        }.sumOf { it.amount.abs().amount }

        val totalSavings = savingsAccounts.sumOf { it.currentBalance.amount }
        if (monthlyExpenses > 0 && totalSavings < monthlyExpenses * 3) {
            val monthsCovered = if (monthlyExpenses > 0) totalSavings / monthlyExpenses else 0
            tips.add(
                FinancialTip(
                    id = "emergency-fund-low",
                    title = "Build your emergency fund",
                    description = "Your savings cover about $monthsCovered month(s) of expenses. " +
                        "Financial experts recommend 3–6 months. Consider setting aside a little " +
                        "extra each pay period.",
                    priority = if (monthsCovered == 0L) TipPriority.URGENT else TipPriority.SUGGESTION,
                    category = "Savings",
                ),
            )
        }

        return tips
    }

    // ── Account tips ─────────────────────────────────────────────────

    private fun accountTips(ctx: TipsContext): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        // Credit card balance warning
        ctx.accounts.filter {
            it.type == AccountType.CREDIT_CARD && !it.isArchived
        }.forEach { cc ->
            if (cc.currentBalance.amount > 0) {
                tips.add(
                    FinancialTip(
                        id = "cc-balance-${cc.id.value}",
                        title = "Pay down ${cc.name}",
                        description = "Carrying a credit card balance costs you in interest. " +
                            "Try to pay more than the minimum to reduce your balance faster.",
                        priority = TipPriority.SUGGESTION,
                        category = "Debt",
                        actionLabel = "View Account",
                    ),
                )
            }
        }

        return tips
    }

    // ── General tips ─────────────────────────────────────────────────

    private fun generalTips(ctx: TipsContext): List<FinancialTip> {
        val tips = mutableListOf<FinancialTip>()

        val monthStart = LocalDate(ctx.today.year, ctx.today.month, 1)
        val incomeThisMonth = ctx.transactions.filter {
            it.type == TransactionType.INCOME && it.date >= monthStart
        }.sumOf { it.amount.abs().amount }

        val expenseThisMonth = ctx.transactions.filter {
            it.type == TransactionType.EXPENSE && it.date >= monthStart
        }.sumOf { it.amount.abs().amount }

        if (incomeThisMonth > 0 && expenseThisMonth > incomeThisMonth * 0.8) {
            tips.add(
                FinancialTip(
                    id = "high-expense-ratio",
                    title = "Watch your expense ratio",
                    description = "You've spent over 80% of this month's income. " +
                        "Consider the 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
                    priority = TipPriority.WARNING,
                    category = "General",
                ),
            )
        }

        // Always include a positive tip
        if (ctx.budgets.any { budget ->
                val catTxns = ctx.transactions.filter { it.categoryId == budget.categoryId }
                val status = BudgetCalculator.calculateStatus(budget, catTxns, ctx.today)
                status.healthLevel == BudgetHealth.HEALTHY && status.utilization < 0.5
            }
        ) {
            tips.add(
                FinancialTip(
                    id = "good-budget-habits",
                    title = "Great budget discipline! \uD83C\uDF1F",
                    description = "You're well under budget in one or more categories. " +
                        "Keep up the great work — consider moving the surplus to savings.",
                    priority = TipPriority.INFO,
                    category = "General",
                ),
            )
        }

        return tips
    }
}
