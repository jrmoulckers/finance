// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.aggregation

import com.finance.models.*
import com.finance.models.types.*
import com.finance.core.money.MoneyOperations
import kotlinx.datetime.*

/**
 * Computes financial aggregations from transaction data.
 * All aggregations operate on in-memory data (edge-first — no server calls).
 */
object FinancialAggregator {

    /**
     * Calculate net worth: sum of all account balances.
     * Credit cards and loans count as negative.
     */
    fun netWorth(accounts: List<Account>): Cents {
        return Cents(accounts
            .filter { it.deletedAt == null && !it.isArchived }
            .sumOf { account ->
                when (account.type) {
                    AccountType.CREDIT_CARD, AccountType.LOAN -> -account.currentBalance.amount
                    else -> account.currentBalance.amount
                }
            })
    }

    /**
     * Calculate net worth with first-class liabilities included explicitly.
     */
    fun netWorth(accounts: List<Account>, liabilities: List<Liability>): Cents {
        val explicitLiabilities = liabilities
            .filter { it.isActive }
            .sumOf { it.remainingBalance.amount }
        return netWorth(accounts) - Cents(explicitLiabilities)
    }

    /**
     * Total scheduled liability payments due in a date range.
     */
    fun totalScheduledLiabilityPayments(
        installments: List<LiabilityInstallment>,
        from: LocalDate,
        to: LocalDate,
    ): Cents {
        return Cents(installments
            .filter { it.isOutstanding && it.dueDate >= from && it.dueDate <= to }
            .sumOf { it.amount.amount })
    }

    /**
     * Net cash flow with scheduled liability installments subtracted from free cash flow.
     */
    fun netCashFlow(
        transactions: List<Transaction>,
        installments: List<LiabilityInstallment>,
        from: LocalDate,
        to: LocalDate,
    ): Cents {
        return netCashFlow(transactions, from, to) - totalScheduledLiabilityPayments(installments, from, to)
    }

    /**
     * Total spending in a date range (sum of expense transactions).
     */
    fun totalSpending(transactions: List<Transaction>, from: LocalDate, to: LocalDate): Cents {
        return Cents(transactions
            .filter {
                it.type == TransactionType.EXPENSE &&
                    it.date >= from && it.date <= to &&
                    it.deletedAt == null &&
                    it.status != TransactionStatus.VOID
            }
            .sumOf { it.amount.abs().amount })
    }

    /**
     * Total income in a date range.
     */
    fun totalIncome(transactions: List<Transaction>, from: LocalDate, to: LocalDate): Cents {
        return Cents(transactions
            .filter {
                it.type == TransactionType.INCOME &&
                    it.date >= from && it.date <= to &&
                    it.deletedAt == null &&
                    it.status != TransactionStatus.VOID
            }
            .sumOf { it.amount.abs().amount })
    }

    /**
     * Net cash flow: income - expenses.
     */
    fun netCashFlow(transactions: List<Transaction>, from: LocalDate, to: LocalDate): Cents {
        val income = totalIncome(transactions, from, to)
        val spending = totalSpending(transactions, from, to)
        return income - spending
    }

    /**
     * Spending grouped by category for a date range.
     * Returns map of categoryId -> total spent.
     */
    fun spendingByCategory(
        transactions: List<Transaction>,
        from: LocalDate,
        to: LocalDate,
    ): Map<SyncId?, Cents> {
        return transactions
            .filter {
                it.type == TransactionType.EXPENSE &&
                    it.date >= from && it.date <= to &&
                    it.deletedAt == null &&
                    it.status != TransactionStatus.VOID
            }
            .groupBy { it.categoryId }
            .mapValues { (_, txns) -> Cents(txns.sumOf { it.amount.abs().amount }) }
    }

    /**
     * Spending grouped by day for trend analysis.
     */
    fun dailySpending(
        transactions: List<Transaction>,
        from: LocalDate,
        to: LocalDate,
    ): Map<LocalDate, Cents> {
        return transactions
            .filter {
                it.type == TransactionType.EXPENSE &&
                    it.date >= from && it.date <= to &&
                    it.deletedAt == null &&
                    it.status != TransactionStatus.VOID
            }
            .groupBy { it.date }
            .mapValues { (_, txns) -> Cents(txns.sumOf { it.amount.abs().amount }) }
    }

    /**
     * Monthly spending totals for the last N months (for trend charts).
     */
    fun monthlySpendingTrend(
        transactions: List<Transaction>,
        months: Int,
        referenceDate: LocalDate,
    ): List<MonthlyTotal> {
        return (0 until months).map { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = start.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY)
            MonthlyTotal(
                year = start.year,
                month = start.month,
                total = totalSpending(transactions, start, end),
            )
        }.reversed()
    }

    /**
     * Savings rate: (income - expenses) / income * 100.
     * Returns percentage as Double.
     */
    fun savingsRate(transactions: List<Transaction>, from: LocalDate, to: LocalDate): Double {
        val income = totalIncome(transactions, from, to)
        if (income.isZero()) return 0.0
        val expenses = totalSpending(transactions, from, to)
        return ((income.amount - expenses.amount).toDouble() / income.amount) * 100.0
    }

    /**
     * Average daily spending in a date range.
     */
    fun averageDailySpending(
        transactions: List<Transaction>,
        from: LocalDate,
        to: LocalDate,
    ): Cents {
        val days = from.daysUntil(to) + 1
        if (days <= 0) return Cents.ZERO
        val total = totalSpending(transactions, from, to)
        return MoneyOperations.divide(total, days)
    }

    /**
     * Spending velocity: current period spending compared to same period last month.
     * Returns a multiplier (1.0 = same, 1.5 = 50% more, 0.5 = 50% less).
     */
    fun spendingVelocity(
        transactions: List<Transaction>,
        currentPeriodStart: LocalDate,
        currentPeriodEnd: LocalDate,
    ): Double {
        val currentSpending = totalSpending(transactions, currentPeriodStart, currentPeriodEnd)
        val previousStart = currentPeriodStart.minus(1, DateTimeUnit.MONTH)
        val previousEnd = currentPeriodEnd.minus(1, DateTimeUnit.MONTH)
        val previousSpending = totalSpending(transactions, previousStart, previousEnd)

        if (previousSpending.isZero()) return if (currentSpending.isZero()) 1.0 else Double.MAX_VALUE
        return currentSpending.amount.toDouble() / previousSpending.amount
    }
}

data class MonthlyTotal(
    val year: Int,
    val month: Month,
    val total: Cents,
)
