// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.core.aggregation.FinancialAggregator
import com.finance.models.Transaction
import com.finance.models.types.Cents
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime

/**
 * A single month in a cashflow trend, enriched with month-over-month deltas
 * and a running cumulative net.
 *
 * All monetary values are integer [Cents]; [momNetChangePercent] is the only
 * [Double]. [net] is always `income - expense`.
 *
 * @property year Calendar year.
 * @property month Calendar month.
 * @property income Total income for the month.
 * @property expense Total spending for the month.
 * @property net `income - expense` for the month.
 * @property momNetDelta Change in [net] versus the previous month. For the
 *   first month in the window this equals [net] (no prior month to diff against).
 * @property momNetChangePercent Percent change of [net] versus the previous
 *   month, computed relative to the magnitude of the prior month's net
 *   (`(net - priorNet) / |priorNet| * 100`). `null` for the first month and
 *   whenever the prior month's net is zero (division undefined).
 * @property cumulativeNet Running sum of [net] from the first month through this one.
 */
data class CashflowMonth(
    val year: Int,
    val month: Month,
    val income: Cents,
    val expense: Cents,
    val net: Cents,
    val momNetDelta: Cents,
    val momNetChangePercent: Double?,
    val cumulativeNet: Cents,
)

/**
 * Builds a month-over-month cashflow trend from raw transactions.
 *
 * Complements [ReportGenerator.incomeVsExpense] (which returns bare monthly
 * income/expense/net) by adding the deltas dashboards actually render: the
 * absolute MoM net change, the percent MoM change, and a running cumulative
 * net across the window. Centralising this avoids every caller re-deriving the
 * same rounding/percent conventions (#3740).
 *
 * Pure `commonMain` logic; delegates monthly income/expense to
 * [FinancialAggregator].
 */
object CashflowTrendAnalyzer {

    /**
     * Produce a chronologically ordered (oldest-first) cashflow trend for the
     * last [months] months ending at (and including) [referenceDate]'s month.
     *
     * @param transactions All available transactions.
     * @param months Number of months to include (must be > 0).
     * @param referenceDate Anchor date; its calendar month is the most recent
     *   month in the result. Defaults to today (UTC).
     */
    fun analyze(
        transactions: List<Transaction>,
        months: Int,
        referenceDate: LocalDate = currentDate(),
    ): List<CashflowMonth> {
        require(months > 0) { "months must be > 0" }

        // Compute each month's income/expense, oldest first.
        val monthly = (0 until months).map { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            val start = LocalDate(monthDate.year, monthDate.month, 1)
            val end = start.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY)
            val income = FinancialAggregator.totalIncome(transactions, start, end)
            val expense = FinancialAggregator.totalSpending(transactions, start, end)
            Triple(start, income, expense)
        }.reversed()

        var cumulative = Cents.ZERO
        var priorNet: Cents? = null

        return monthly.map { (start, income, expense) ->
            val net = income - expense
            cumulative += net

            val delta = priorNet?.let { net - it } ?: net
            val percent = priorNet?.let { prior ->
                if (prior.isZero()) {
                    null
                } else {
                    ((net.amount - prior.amount).toDouble() / kotlin.math.abs(prior.amount)) * 100.0
                }
            }

            priorNet = net

            CashflowMonth(
                year = start.year,
                month = start.month,
                income = income,
                expense = expense,
                net = net,
                momNetDelta = delta,
                momNetChangePercent = percent,
                cumulativeNet = cumulative,
            )
        }
    }

    /** Returns the current date in UTC. Centralised so tests can reason about it. */
    internal fun currentDate(): LocalDate =
        Clock.System.now().toLocalDateTime(TimeZone.UTC).date
}
