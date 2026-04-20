// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.widgets

import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.Transaction
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.first
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Snapshot of financial data prepared for widget rendering.
 *
 * Each field is pre-formatted for display — widgets should not perform
 * calculations or formatting themselves.
 */
data class WidgetData(
    val netWorthFormatted: String = "",
    val todaySpendingFormatted: String = "",
    val monthlySpendingFormatted: String = "",
    val budgetSummaries: List<WidgetBudgetSummary> = emptyList(),
    val recentTransactions: List<WidgetTransaction> = emptyList(),
    val lastUpdated: String = "",
)

/**
 * Budget status formatted for widget display.
 */
data class WidgetBudgetSummary(
    val name: String,
    val spentFormatted: String,
    val limitFormatted: String,
    val utilizationPercent: Int,
    val health: BudgetHealth,
)

/**
 * Transaction summary formatted for widget display.
 */
data class WidgetTransaction(
    val description: String,
    val amountFormatted: String,
    val dateFormatted: String,
    val isExpense: Boolean,
)

/**
 * Aggregates financial data from repositories into [WidgetData] snapshots
 * suitable for rendering in Windows 11 Widget Board Adaptive Cards.
 *
 * This provider bridges the app's repository layer with the widget rendering
 * pipeline. It performs the same aggregation as [DashboardViewModel] but
 * returns a lightweight, pre-formatted data object instead of a full UI state.
 *
 * ## Thread Safety
 *
 * All methods are suspend functions safe to call from any coroutine context.
 * Repository access is delegated to the thread-safe repository implementations.
 */
class WidgetDataProvider(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
) {
    companion object {
        private val logger: Logger = Logger.getLogger(WidgetDataProvider::class.java.name)

        /** Maximum number of recent transactions shown in the widget. */
        private const val MAX_RECENT_TRANSACTIONS = 5

        /** Maximum number of budget summaries shown in the widget. */
        private const val MAX_BUDGET_SUMMARIES = 4
    }

    /**
     * Fetches and aggregates current financial data into a [WidgetData] snapshot.
     *
     * Returns a snapshot with empty/default values if any repository operation
     * fails, ensuring the widget always has something to render.
     */
    suspend fun fetchWidgetData(): WidgetData {
        return try {
            val hid = SyncId("d1")
            val currency = Currency.USD
            val now = Clock.System.now()
            val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date

            val accounts = accountRepository.observeAll(hid).first()
            val transactions = transactionRepository.observeAll(hid).first()
            val budgets = budgetRepository.observeAll(hid).first()

            val netWorth = FinancialAggregator.netWorth(accounts)
            val todaySpending = FinancialAggregator.totalSpending(transactions, today, today)
            val monthStart = LocalDate(today.year, today.month, 1)
            val monthlySpending = FinancialAggregator.totalSpending(transactions, monthStart, today)

            val budgetSummaries = budgets.take(MAX_BUDGET_SUMMARIES).map { budget ->
                val catTxns = transactions.filter { it.categoryId == budget.categoryId }
                val status = BudgetCalculator.calculateStatus(budget, catTxns, today)
                WidgetBudgetSummary(
                    name = budget.name,
                    spentFormatted = CurrencyFormatter.format(status.spent, currency),
                    limitFormatted = CurrencyFormatter.format(budget.amount, currency),
                    utilizationPercent = (status.utilization * 100).toInt().coerceIn(0, 150),
                    health = status.healthLevel,
                )
            }

            val recentTransactions = transactions
                .sortedByDescending { it.date }
                .take(MAX_RECENT_TRANSACTIONS)
                .map { tx -> tx.toWidgetTransaction(currency) }

            val timeFormatted = "%02d:%02d".format(
                now.toLocalDateTime(TimeZone.currentSystemDefault()).hour,
                now.toLocalDateTime(TimeZone.currentSystemDefault()).minute,
            )

            WidgetData(
                netWorthFormatted = CurrencyFormatter.format(netWorth, currency),
                todaySpendingFormatted = CurrencyFormatter.format(todaySpending, currency),
                monthlySpendingFormatted = CurrencyFormatter.format(monthlySpending, currency),
                budgetSummaries = budgetSummaries,
                recentTransactions = recentTransactions,
                lastUpdated = "Updated at $timeFormatted",
            )
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Failed to fetch widget data — returning defaults", e)
            WidgetData(lastUpdated = "Update failed")
        }
    }
}

/**
 * Maps a [Transaction] to a [WidgetTransaction] for display.
 */
private fun Transaction.toWidgetTransaction(currency: Currency): WidgetTransaction {
    val isExpense = amount.isNegative()
    return WidgetTransaction(
        description = (payee ?: note ?: "Transaction").take(40),
        amountFormatted = CurrencyFormatter.format(amount, currency),
        dateFormatted = date.toString(),
        isExpense = isExpense,
    )
}
