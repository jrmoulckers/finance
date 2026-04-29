// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.report

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Report Builder Engine — configurable financial report generation.
 * Supports grouping by category, account, period, payee.
 * Pure commonMain. All monetary values use [Cents].
 */
object ReportBuilderEngine {

    fun generate(config: ReportConfig, transactions: List<Transaction>): Report {
        val filtered = filterTransactions(transactions, config)
        val groups = when (config.groupBy) {
            GroupBy.CATEGORY -> groupByCategory(filtered)
            GroupBy.ACCOUNT -> groupByAccount(filtered)
            GroupBy.PERIOD -> groupByPeriod(filtered, config.periodGrouping ?: PeriodGrouping.MONTHLY)
            GroupBy.PAYEE -> groupByPayee(filtered)
            GroupBy.NONE -> listOf(ReportGroup("all", "All Transactions", Cents(filtered.sumOf { signedAmount(it).amount }), filtered.size, filtered.map { it.toReportItem() }))
        }
        val totalIncome = Cents(filtered.filter { it.type == TransactionType.INCOME }.sumOf { it.amount.abs().amount })
        val totalExpenses = Cents(filtered.filter { it.type == TransactionType.EXPENSE }.sumOf { it.amount.abs().amount })
        return Report(config, groups, ReportSummary(totalIncome, totalExpenses, totalIncome - totalExpenses, filtered.size,
            if (filtered.isNotEmpty()) { val dates = filtered.map { it.date }; DateRange(dates.min(), dates.max()) } else null), Clock.System.now())
    }

    internal fun filterTransactions(transactions: List<Transaction>, config: ReportConfig): List<Transaction> {
        return transactions.filter { txn ->
            txn.deletedAt == null &&
                (config.startDate == null || txn.date >= config.startDate) &&
                (config.endDate == null || txn.date <= config.endDate) &&
                (config.transactionTypes.isEmpty() || txn.type in config.transactionTypes) &&
                (config.accountIds.isEmpty() || txn.accountId in config.accountIds) &&
                (config.categoryIds.isEmpty() || txn.categoryId in config.categoryIds)
        }
    }

    internal fun groupByCategory(transactions: List<Transaction>): List<ReportGroup> {
        return transactions.groupBy { it.categoryId?.value ?: "uncategorized" }.map { (key, txns) ->
            ReportGroup(key, if (key == "uncategorized") "Uncategorized" else key, Cents(txns.sumOf { signedAmount(it).amount }), txns.size, txns.map { it.toReportItem() })
        }.sortedByDescending { it.totalAmount.abs().amount }
    }

    internal fun groupByAccount(transactions: List<Transaction>): List<ReportGroup> {
        return transactions.groupBy { it.accountId.value }.map { (key, txns) ->
            ReportGroup(key, key, Cents(txns.sumOf { signedAmount(it).amount }), txns.size, txns.map { it.toReportItem() })
        }.sortedByDescending { it.totalAmount.abs().amount }
    }

    internal fun groupByPeriod(transactions: List<Transaction>, grouping: PeriodGrouping): List<ReportGroup> {
        return transactions.groupBy { periodKey(it.date, grouping) }.map { (key, txns) ->
            ReportGroup(key, key, Cents(txns.sumOf { signedAmount(it).amount }), txns.size, txns.map { it.toReportItem() })
        }.sortedBy { it.key }
    }

    internal fun groupByPayee(transactions: List<Transaction>): List<ReportGroup> {
        return transactions.groupBy { it.payee?.trim()?.lowercase() ?: "unknown" }.map { (key, txns) ->
            ReportGroup(key, txns.firstNotNullOfOrNull { it.payee } ?: "Unknown", Cents(txns.sumOf { signedAmount(it).amount }), txns.size, txns.map { it.toReportItem() })
        }.sortedByDescending { it.totalAmount.abs().amount }
    }

    fun formatAsJsonStructure(report: Report): Map<String, Any> {
        return mapOf(
            "summary" to mapOf("totalIncome" to report.summary.totalIncome.amount, "totalExpenses" to report.summary.totalExpenses.amount, "netAmount" to report.summary.netAmount.amount, "transactionCount" to report.summary.transactionCount),
            "groups" to report.groups.map { group -> mapOf("key" to group.key, "label" to group.label, "totalAmount" to group.totalAmount.amount, "transactionCount" to group.transactionCount,
                "items" to group.items.map { item -> mapOf("id" to item.transactionId.value, "date" to item.date.toString(), "amount" to item.amount.amount, "payee" to (item.payee ?: ""), "type" to item.type.name) }) },
        )
    }

    fun formatAsCsvRows(report: Report): List<List<String>> {
        val header = listOf("Group", "Date", "Payee", "Type", "Amount (cents)", "Category", "Account")
        val rows = report.groups.flatMap { group -> group.items.map { item -> listOf(group.label, item.date.toString(), item.payee ?: "", item.type.name, item.amount.amount.toString(), item.categoryId?.value ?: "", item.accountId.value) } }
        return listOf(header) + rows
    }

    private fun signedAmount(txn: Transaction): Cents = when (txn.type) {
        TransactionType.EXPENSE -> Cents(-txn.amount.abs().amount)
        TransactionType.INCOME -> txn.amount.abs()
        TransactionType.TRANSFER -> txn.amount
    }

    private fun periodKey(date: LocalDate, grouping: PeriodGrouping): String = when (grouping) {
        PeriodGrouping.DAILY -> date.toString()
        PeriodGrouping.WEEKLY -> "W-${date.minus(date.dayOfWeek.isoDayNumber - 1, DateTimeUnit.DAY)}"
        PeriodGrouping.MONTHLY -> "${date.year}-${date.monthNumber.toString().padStart(2, '0')}"
        PeriodGrouping.QUARTERLY -> "${date.year}-Q${(date.monthNumber - 1) / 3 + 1}"
        PeriodGrouping.YEARLY -> date.year.toString()
    }

    private fun Transaction.toReportItem() = ReportItem(id, date, amount, payee, type, categoryId, accountId, note)
}

@Serializable
data class ReportConfig(val name: String = "Financial Report", val groupBy: GroupBy = GroupBy.CATEGORY, val periodGrouping: PeriodGrouping? = null, val startDate: LocalDate? = null, val endDate: LocalDate? = null, val transactionTypes: Set<TransactionType> = emptySet(), val accountIds: Set<SyncId> = emptySet(), val categoryIds: Set<SyncId> = emptySet(), val currency: Currency = Currency.USD)
@Serializable enum class GroupBy { CATEGORY, ACCOUNT, PERIOD, PAYEE, NONE }
@Serializable enum class PeriodGrouping { DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY }

data class Report(val config: ReportConfig, val groups: List<ReportGroup>, val summary: ReportSummary, val generatedAt: Instant)
data class ReportGroup(val key: String, val label: String, val totalAmount: Cents, val transactionCount: Int, val items: List<ReportItem>)
data class ReportItem(val transactionId: SyncId, val date: LocalDate, val amount: Cents, val payee: String?, val type: TransactionType, val categoryId: SyncId?, val accountId: SyncId, val note: String?)
data class ReportSummary(val totalIncome: Cents, val totalExpenses: Cents, val netAmount: Cents, val transactionCount: Int, val dateRange: DateRange?)
@Serializable data class DateRange(val start: LocalDate, val endInclusive: LocalDate) { init { require(start <= endInclusive) { "start ($start) must be <= endInclusive ($endInclusive)" } } }
