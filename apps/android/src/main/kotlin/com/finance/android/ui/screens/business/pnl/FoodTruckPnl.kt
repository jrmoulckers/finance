// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.pnl

import com.finance.android.ui.screens.business.ScopedTransaction
import com.finance.models.types.Cents

/**
 * The four lines of a small-business profit-and-loss statement (#2184).
 *
 * Ordering matters: revenue minus COGS is gross profit; minus labor and
 * overhead is net profit.
 */
enum class PnlBucket(val label: String) {
    REVENUE("Revenue"),
    COGS("Cost of goods sold"),
    LABOR("Labor"),
    OVERHEAD("Overhead"),
}

/** How a [FoodTruckPnl] groups periods. */
enum class PnlGrouping(val label: String, val days: Int) {
    WEEKLY("Weekly", 7),
    MONTHLY("Monthly", 30),
}

/** A single revenue or cost line with its share of the period total. */
data class PnlLine(
    val label: String,
    val amount: Cents,
    /** Percent of period revenue this line represents (0..n, may exceed 100). */
    val percentOfRevenue: Double,
)

/**
 * A computed profit-and-loss statement for one period.
 *
 * Margins are expressed as percentages so the owner can answer "what was my
 * food-cost % last week?" and "did labor erase my profit?" without exporting
 * data (#2184).
 */
data class ProfitLoss(
    val periodLabel: String,
    val grouping: PnlGrouping,
    val revenue: Cents,
    val cogs: Cents,
    val labor: Cents,
    val overhead: Cents,
    val revenueLines: List<PnlLine>,
    val expenseLines: List<PnlLine>,
) {
    /** Revenue minus cost of goods sold. */
    val grossProfit: Cents = revenue - cogs

    /** Gross profit minus labor and overhead. */
    val netProfit: Cents = grossProfit - labor - overhead

    /** Food cost as a percent of revenue (COGS ÷ revenue). */
    val foodCostPercent: Double = percent(cogs, revenue)

    val laborPercent: Double = percent(labor, revenue)

    val grossMarginPercent: Double = percent(grossProfit, revenue)

    val netMarginPercent: Double = percent(netProfit, revenue)

    val isProfitable: Boolean = netProfit.amount > 0

    private fun percent(part: Cents, whole: Cents): Double =
        if (whole.amount == 0L) 0.0 else part.amount.toDouble() / whole.amount.toDouble() * 100.0
}

/**
 * Pure, edge-first profit-and-loss calculator for a food truck (#2184).
 *
 * All arithmetic stays in [Cents] to avoid floating-point drift; only the final
 * margin percentages are computed as doubles for display.
 */
object FoodTruckPnl {

    /**
     * Build a [ProfitLoss] from [transactions] for a period labelled
     * [periodLabel] grouped by [grouping].
     */
    fun compute(
        periodLabel: String,
        grouping: PnlGrouping,
        transactions: List<ScopedTransaction>,
    ): ProfitLoss {
        val business = transactions.filter { it.businessCategory != null }

        val revenue = sumBucket(business, PnlBucket.REVENUE)
        val cogs = sumBucket(business, PnlBucket.COGS)
        val labor = sumBucket(business, PnlBucket.LABOR)
        val overhead = sumBucket(business, PnlBucket.OVERHEAD)

        val revenueLines = lineItems(business, PnlBucket.REVENUE, revenue)
        val expenseLines = listOf(PnlBucket.COGS, PnlBucket.LABOR, PnlBucket.OVERHEAD)
            .flatMap { lineItems(business, it, revenue) }

        return ProfitLoss(
            periodLabel = periodLabel,
            grouping = grouping,
            revenue = revenue,
            cogs = cogs,
            labor = labor,
            overhead = overhead,
            revenueLines = revenueLines,
            expenseLines = expenseLines,
        )
    }

    private fun sumBucket(transactions: List<ScopedTransaction>, bucket: PnlBucket): Cents =
        transactions
            .filter { it.businessCategory?.pnlBucket == bucket }
            .fold(Cents.ZERO) { acc, t -> acc + t.amount }

    private fun lineItems(
        transactions: List<ScopedTransaction>,
        bucket: PnlBucket,
        revenue: Cents,
    ): List<PnlLine> =
        transactions
            .filter { it.businessCategory?.pnlBucket == bucket }
            .groupBy { it.businessCategory!! }
            .map { (category, items) ->
                val amount = items.fold(Cents.ZERO) { acc, t -> acc + t.amount }
                PnlLine(
                    label = category.label,
                    amount = amount,
                    percentOfRevenue = if (revenue.amount == 0L) {
                        0.0
                    } else {
                        amount.amount.toDouble() / revenue.amount.toDouble() * 100.0
                    },
                )
            }
            .sortedByDescending { it.amount.amount }
}
