// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.prediction

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import com.finance.core.money.MoneyOperations
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Predicts end-of-month account balance using historical spending patterns,
 * recurring transaction schedules, and trend analysis.
 *
 * Pure commonMain — no platform dependencies.
 * All monetary values use [Cents] (Long-backed) for exact precision.
 */
object BalancePredictionEngine {

    /**
     * Predict the end-of-month balance for an account.
     *
     * Algorithm:
     * 1. Take the current account balance as the starting point.
     * 2. Add expected income for the remainder of the month (from recurring patterns).
     * 3. Subtract expected expenses for the remainder of the month (historical average).
     * 4. Apply trend adjustment based on recent spending velocity.
     *
     * @param currentBalance  The account's current balance in cents.
     * @param transactions    Historical transactions for this account.
     * @param referenceDate   The date from which to predict (defaults to today).
     * @param lookbackMonths  Number of months of history to analyse (default 3).
     * @return A [BalancePrediction] with the forecast and breakdown.
     */
    fun predictEndOfMonth(
        currentBalance: Cents,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
        lookbackMonths: Int = 3,
    ): BalancePrediction {
        require(lookbackMonths > 0) { "lookbackMonths must be > 0" }

        val monthEnd = endOfMonth(referenceDate)
        val daysRemaining = referenceDate.daysUntil(monthEnd).coerceAtLeast(0)

        if (daysRemaining == 0) {
            return BalancePrediction(
                predictedBalance = currentBalance,
                currentBalance = currentBalance,
                expectedIncome = Cents.ZERO,
                expectedExpenses = Cents.ZERO,
                trendAdjustment = Cents.ZERO,
                daysRemaining = 0,
                confidence = PredictionConfidence.HIGH,
                referenceDate = referenceDate,
                predictionDate = monthEnd,
            )
        }

        // Compute historical daily averages from lookback period
        val activeTransactions = transactions.filter {
            it.deletedAt == null &&
                it.type != TransactionType.TRANSFER
        }

        val dailyIncomeAvg = computeDailyAverage(
            activeTransactions,
            referenceDate,
            lookbackMonths,
            TransactionType.INCOME,
        )

        val dailyExpenseAvg = computeDailyAverage(
            activeTransactions,
            referenceDate,
            lookbackMonths,
            TransactionType.EXPENSE,
        )

        // Project remaining income and expenses
        val expectedIncome = Cents(dailyIncomeAvg.amount * daysRemaining)
        val expectedExpenses = Cents(dailyExpenseAvg.amount * daysRemaining)

        // Compute trend adjustment: compare current month's pace vs. historical
        val trendAdjustment = computeTrendAdjustment(
            activeTransactions,
            referenceDate,
            dailyExpenseAvg,
        )

        val predictedBalance = Cents(
            currentBalance.amount + expectedIncome.amount - expectedExpenses.amount + trendAdjustment.amount,
        )

        // Confidence depends on data availability
        val historicalTxnCount = activeTransactions.count { txn ->
            val lookbackStart = referenceDate.minus(lookbackMonths, DateTimeUnit.MONTH)
            txn.date >= lookbackStart && txn.date < referenceDate
        }
        val confidence = when {
            historicalTxnCount >= 30 -> PredictionConfidence.HIGH
            historicalTxnCount >= 10 -> PredictionConfidence.MEDIUM
            else -> PredictionConfidence.LOW
        }

        return BalancePrediction(
            predictedBalance = predictedBalance,
            currentBalance = currentBalance,
            expectedIncome = expectedIncome,
            expectedExpenses = expectedExpenses,
            trendAdjustment = trendAdjustment,
            daysRemaining = daysRemaining,
            confidence = confidence,
            referenceDate = referenceDate,
            predictionDate = monthEnd,
        )
    }

    /**
     * Predict balance at a specific future date (not just end of month).
     */
    fun predictAtDate(
        currentBalance: Cents,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
        targetDate: LocalDate,
        lookbackMonths: Int = 3,
    ): BalancePrediction {
        require(targetDate >= referenceDate) { "targetDate must be >= referenceDate" }
        require(lookbackMonths > 0) { "lookbackMonths must be > 0" }

        val daysRemaining = referenceDate.daysUntil(targetDate).coerceAtLeast(0)

        if (daysRemaining == 0) {
            return BalancePrediction(
                predictedBalance = currentBalance,
                currentBalance = currentBalance,
                expectedIncome = Cents.ZERO,
                expectedExpenses = Cents.ZERO,
                trendAdjustment = Cents.ZERO,
                daysRemaining = 0,
                confidence = PredictionConfidence.HIGH,
                referenceDate = referenceDate,
                predictionDate = targetDate,
            )
        }

        val activeTransactions = transactions.filter {
            it.deletedAt == null && it.type != TransactionType.TRANSFER
        }

        val dailyIncomeAvg = computeDailyAverage(
            activeTransactions, referenceDate, lookbackMonths, TransactionType.INCOME,
        )
        val dailyExpenseAvg = computeDailyAverage(
            activeTransactions, referenceDate, lookbackMonths, TransactionType.EXPENSE,
        )

        val expectedIncome = Cents(dailyIncomeAvg.amount * daysRemaining)
        val expectedExpenses = Cents(dailyExpenseAvg.amount * daysRemaining)

        val predictedBalance = Cents(
            currentBalance.amount + expectedIncome.amount - expectedExpenses.amount,
        )

        val historicalTxnCount = activeTransactions.count { txn ->
            val lookbackStart = referenceDate.minus(lookbackMonths, DateTimeUnit.MONTH)
            txn.date >= lookbackStart && txn.date < referenceDate
        }
        val confidence = when {
            daysRemaining <= 7 && historicalTxnCount >= 10 -> PredictionConfidence.HIGH
            historicalTxnCount >= 20 -> PredictionConfidence.MEDIUM
            else -> PredictionConfidence.LOW
        }

        return BalancePrediction(
            predictedBalance = predictedBalance,
            currentBalance = currentBalance,
            expectedIncome = expectedIncome,
            expectedExpenses = expectedExpenses,
            trendAdjustment = Cents.ZERO,
            daysRemaining = daysRemaining,
            confidence = confidence,
            referenceDate = referenceDate,
            predictionDate = targetDate,
        )
    }

    /**
     * Generate a daily balance forecast from [referenceDate] to the end of the month.
     * Useful for rendering prediction charts.
     */
    fun dailyForecast(
        currentBalance: Cents,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
        lookbackMonths: Int = 3,
    ): List<DailyBalanceForecast> {
        val monthEnd = endOfMonth(referenceDate)
        val daysRemaining = referenceDate.daysUntil(monthEnd).coerceAtLeast(0)
        if (daysRemaining == 0) return emptyList()

        val activeTransactions = transactions.filter {
            it.deletedAt == null && it.type != TransactionType.TRANSFER
        }

        val dailyIncomeAvg = computeDailyAverage(
            activeTransactions, referenceDate, lookbackMonths, TransactionType.INCOME,
        )
        val dailyExpenseAvg = computeDailyAverage(
            activeTransactions, referenceDate, lookbackMonths, TransactionType.EXPENSE,
        )

        val dailyNet = Cents(dailyIncomeAvg.amount - dailyExpenseAvg.amount)

        return (1..daysRemaining).map { dayOffset ->
            val date = referenceDate.plus(dayOffset, DateTimeUnit.DAY)
            val projected = Cents(currentBalance.amount + dailyNet.amount * dayOffset)
            DailyBalanceForecast(date = date, projectedBalance = projected)
        }
    }

    // ── Internal helpers ─────────────────────────────────────────────

    internal fun computeDailyAverage(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
        lookbackMonths: Int,
        type: TransactionType,
    ): Cents {
        val lookbackStart = referenceDate.minus(lookbackMonths, DateTimeUnit.MONTH)
        val relevantTxns = transactions.filter { txn ->
            txn.type == type &&
                txn.date >= lookbackStart &&
                txn.date < referenceDate
        }
        val totalDays = lookbackStart.daysUntil(referenceDate).coerceAtLeast(1)
        val totalAmount = relevantTxns.sumOf { it.amount.abs().amount }
        return Cents(totalAmount / totalDays)
    }

    internal fun computeTrendAdjustment(
        transactions: List<Transaction>,
        referenceDate: LocalDate,
        historicalDailyExpense: Cents,
    ): Cents {
        // Compare this month's spending pace to historical average
        val monthStart = LocalDate(referenceDate.year, referenceDate.month, 1)
        val daysElapsed = monthStart.daysUntil(referenceDate).coerceAtLeast(1)

        val thisMonthExpenses = transactions
            .filter {
                it.type == TransactionType.EXPENSE &&
                    it.date >= monthStart &&
                    it.date < referenceDate
            }
            .sumOf { it.amount.abs().amount }

        val currentDailyRate = Cents(thisMonthExpenses / daysElapsed)

        // If current pace is faster than historical, adjust prediction downward
        // (more spending = lower balance)
        val dailyDifference = Cents(historicalDailyExpense.amount - currentDailyRate.amount)
        val monthEnd = endOfMonth(referenceDate)
        val daysRemaining = referenceDate.daysUntil(monthEnd).coerceAtLeast(0)

        // Apply half the trend difference as adjustment (dampen volatility)
        return Cents((dailyDifference.amount * daysRemaining) / 2)
    }

    private fun endOfMonth(date: LocalDate): LocalDate {
        val nextMonth = if (date.month == Month.DECEMBER) {
            LocalDate(date.year + 1, Month.JANUARY, 1)
        } else {
            LocalDate(date.year, Month.entries[date.month.ordinal + 1], 1)
        }
        return nextMonth.minus(1, DateTimeUnit.DAY)
    }
}

// ── Data classes ─────────────────────────────────────────────────────

@Serializable
enum class PredictionConfidence { LOW, MEDIUM, HIGH }

/**
 * A predicted balance at a future date with breakdown of contributing factors.
 */
@Serializable
data class BalancePrediction(
    val predictedBalance: Cents,
    val currentBalance: Cents,
    val expectedIncome: Cents,
    val expectedExpenses: Cents,
    /** Adjustment based on spending trend vs. historical average. */
    val trendAdjustment: Cents,
    val daysRemaining: Int,
    val confidence: PredictionConfidence,
    val referenceDate: LocalDate,
    val predictionDate: LocalDate,
) {
    /** The net change from current balance to predicted balance. */
    val projectedChange: Cents get() = Cents(predictedBalance.amount - currentBalance.amount)

    /** Whether the prediction indicates a negative balance. */
    val isNegativeProjection: Boolean get() = predictedBalance.isNegative()
}

/**
 * A single day's projected balance for chart rendering.
 */
@Serializable
data class DailyBalanceForecast(
    val date: LocalDate,
    val projectedBalance: Cents,
)
