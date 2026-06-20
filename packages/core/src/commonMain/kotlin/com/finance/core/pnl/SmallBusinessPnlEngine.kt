// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.pnl

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.isoDayNumber
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.serialization.Serializable

/**
 * Shared Kotlin Multiplatform small-business profit-and-loss aggregation.
 *
 * Money is represented as integer cents ([Long]) in every public model. Ratios
 * are represented in basis points where 10_000 = 100.00%; for example, 2_500
 * basis points means 25.00%. Ratio division truncates toward zero. When revenue
 * is zero, ratio fields return [ZERO_REVENUE_RATIO_BASIS_POINTS] instead of
 * dividing by zero.
 */
object SmallBusinessPnlEngine {
    const val BASIS_POINTS_PER_ONE = 10_000L
    const val ZERO_REVENUE_RATIO_BASIS_POINTS = 0L

    /** Aggregates dedicated revenue/COGS/labor/overhead inputs into a P&L report. */
    fun aggregate(
        inputs: PnlInputs,
        grouping: PnlPeriodGrouping,
        from: LocalDate? = null,
        to: LocalDate? = null,
    ): PnlReport = aggregate(inputs.toLineItems(), grouping, from, to)

    /** Aggregates normalized line items into a P&L report. */
    fun aggregate(
        lineItems: List<PnlLineItem>,
        grouping: PnlPeriodGrouping,
        from: LocalDate? = null,
        to: LocalDate? = null,
    ): PnlReport {
        require(from == null || to == null || from <= to) { "from ($from) must be <= to ($to)" }

        val filtered = lineItems
            .filter { item -> (from == null || item.date >= from) && (to == null || item.date <= to) }
            .sortedWith(compareBy<PnlLineItem> { it.date }.thenBy { it.id })

        val periods = filtered
            .groupBy { item -> periodFor(item.date, grouping) }
            .map { (period, items) ->
                PnlPeriodReport(
                    period = period,
                    summary = summarize(items),
                    lineItemIds = items.map { it.id },
                )
            }
            .sortedBy { report -> report.period.startDate }

        return PnlReport(
            grouping = grouping,
            summary = summarize(filtered),
            periods = periods,
        )
    }

    /** Summarizes a single ungrouped P&L bucket. */
    fun summarize(lineItems: List<PnlLineItem>): PnlSummary {
        val revenue = lineItems.sumByType(PnlLineItemType.REVENUE)
        val cogs = lineItems.sumByType(PnlLineItemType.COST_OF_GOODS_SOLD)
        val labor = lineItems.sumByType(PnlLineItemType.LABOR)
        val overhead = lineItems.sumByType(PnlLineItemType.OVERHEAD)
        val grossProfit = checkedSubtract(revenue, cogs)
        val operatingExpenses = checkedAdd(labor, overhead)
        val netProfit = checkedSubtract(grossProfit, operatingExpenses)

        return PnlSummary(
            revenueCents = revenue,
            cogsCents = cogs,
            laborCents = labor,
            overheadCents = overhead,
            grossProfitCents = grossProfit,
            operatingExpenseCents = operatingExpenses,
            netProfitCents = netProfit,
            grossMarginBasisPoints = ratioBasisPoints(grossProfit, revenue),
            netMarginBasisPoints = ratioBasisPoints(netProfit, revenue),
            foodCostBasisPoints = ratioBasisPoints(cogs, revenue),
            lineItemCount = lineItems.size,
        )
    }

    fun periodFor(date: LocalDate, grouping: PnlPeriodGrouping): PnlPeriod = when (grouping) {
        PnlPeriodGrouping.WEEKLY -> {
            val start = date.minus(date.dayOfWeek.isoDayNumber - 1, DateTimeUnit.DAY)
            PnlPeriod(
                key = "W-$start",
                grouping = grouping,
                startDate = start,
                endDate = start.plus(6, DateTimeUnit.DAY),
            )
        }
        PnlPeriodGrouping.MONTHLY -> {
            val start = LocalDate(date.year, date.month, 1)
            PnlPeriod(
                key = "${date.year}-${date.monthNumber.toString().padStart(2, '0')}",
                grouping = grouping,
                startDate = start,
                endDate = start.plus(1, DateTimeUnit.MONTH).minus(1, DateTimeUnit.DAY),
            )
        }
    }

    internal fun ratioBasisPoints(numeratorCents: Long, revenueCents: Long): Long {
        if (revenueCents == 0L) return ZERO_REVENUE_RATIO_BASIS_POINTS
        if (numeratorCents > Long.MAX_VALUE / BASIS_POINTS_PER_ONE ||
            numeratorCents < Long.MIN_VALUE / BASIS_POINTS_PER_ONE
        ) {
            throw ArithmeticException("Long overflow while scaling ratio to basis points")
        }
        return numeratorCents * BASIS_POINTS_PER_ONE / revenueCents
    }
}

/** The supported P&L period groupings. Weekly periods start on Monday and end on Sunday. */
@Serializable
enum class PnlPeriodGrouping { WEEKLY, MONTHLY }

/** Normalized line-item category used by the aggregation engine. */
@Serializable
enum class PnlLineItemType { REVENUE, COST_OF_GOODS_SOLD, LABOR, OVERHEAD }

/** A normalized P&L line item. Amounts are integer cents and may be negative for refunds/credits. */
@Serializable
data class PnlLineItem(
    val id: String,
    val type: PnlLineItemType,
    val amountCents: Long,
    val date: LocalDate,
    val memo: String? = null,
) {
    init {
        require(id.isNotBlank()) { "id cannot be blank" }
    }
}

/** Small-business revenue input owned by the P&L package. */
@Serializable
data class PnlRevenue(
    val id: String,
    val amountCents: Long,
    val date: LocalDate,
    val source: String? = null,
) {
    init {
        require(id.isNotBlank()) { "id cannot be blank" }
    }
}

/** Cost-of-goods-sold input owned by the P&L package. */
@Serializable
data class PnlCostOfGoodsSold(
    val id: String,
    val amountCents: Long,
    val date: LocalDate,
    val category: String? = null,
) {
    init {
        require(id.isNotBlank()) { "id cannot be blank" }
    }
}

/** Labor cost input owned by the P&L package. */
@Serializable
data class PnlLaborCost(
    val id: String,
    val amountCents: Long,
    val date: LocalDate,
    val role: String? = null,
) {
    init {
        require(id.isNotBlank()) { "id cannot be blank" }
    }
}

/** Overhead cost input owned by the P&L package. */
@Serializable
data class PnlOverheadCost(
    val id: String,
    val amountCents: Long,
    val date: LocalDate,
    val category: String? = null,
) {
    init {
        require(id.isNotBlank()) { "id cannot be blank" }
    }
}

/** Dedicated package-local inputs so callers do not depend on receipt/COGS contracts. */
@Serializable
data class PnlInputs(
    val revenues: List<PnlRevenue> = emptyList(),
    val costOfGoodsSold: List<PnlCostOfGoodsSold> = emptyList(),
    val laborCosts: List<PnlLaborCost> = emptyList(),
    val overheadCosts: List<PnlOverheadCost> = emptyList(),
) {
    fun toLineItems(): List<PnlLineItem> =
        revenues.map { revenue ->
            PnlLineItem(revenue.id, PnlLineItemType.REVENUE, revenue.amountCents, revenue.date, revenue.source)
        } + costOfGoodsSold.map { cogs ->
            PnlLineItem(
                cogs.id,
                PnlLineItemType.COST_OF_GOODS_SOLD,
                cogs.amountCents,
                cogs.date,
                cogs.category,
            )
        } + laborCosts.map { labor ->
            PnlLineItem(labor.id, PnlLineItemType.LABOR, labor.amountCents, labor.date, labor.role)
        } + overheadCosts.map { overhead ->
            PnlLineItem(overhead.id, PnlLineItemType.OVERHEAD, overhead.amountCents, overhead.date, overhead.category)
        }
}

/** Inclusive period bounds for one P&L bucket. */
@Serializable
data class PnlPeriod(
    val key: String,
    val grouping: PnlPeriodGrouping,
    val startDate: LocalDate,
    val endDate: LocalDate,
)

/** P&L totals and basis-point ratios for one bucket. */
@Serializable
data class PnlSummary(
    val revenueCents: Long,
    val cogsCents: Long,
    val laborCents: Long,
    val overheadCents: Long,
    val grossProfitCents: Long,
    val operatingExpenseCents: Long,
    val netProfitCents: Long,
    val grossMarginBasisPoints: Long,
    val netMarginBasisPoints: Long,
    val foodCostBasisPoints: Long,
    val lineItemCount: Int,
) {
    val hasRevenue: Boolean
        get() = revenueCents != 0L
}

/** One period within a grouped P&L report. */
@Serializable
data class PnlPeriodReport(
    val period: PnlPeriod,
    val summary: PnlSummary,
    val lineItemIds: List<String>,
)

/** Overall P&L report plus weekly/monthly period details. */
@Serializable
data class PnlReport(
    val grouping: PnlPeriodGrouping,
    val summary: PnlSummary,
    val periods: List<PnlPeriodReport>,
)

private fun List<PnlLineItem>.sumByType(type: PnlLineItemType): Long =
    filter { item -> item.type == type }
        .fold(0L) { total, item -> checkedAdd(total, item.amountCents) }

private fun checkedAdd(left: Long, right: Long): Long {
    val result = left + right
    if ((left xor right) >= 0 && (left xor result) < 0) {
        throw ArithmeticException("Long overflow in P&L cents addition")
    }
    return result
}

private fun checkedSubtract(left: Long, right: Long): Long {
    val result = left - right
    if ((left xor right) < 0 && (left xor result) < 0) {
        throw ArithmeticException("Long overflow in P&L cents subtraction")
    }
    return result
}
