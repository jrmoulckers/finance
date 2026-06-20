// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.pnl

import kotlinx.datetime.LocalDate
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SmallBusinessPnlEngineTest {
    private val json = Json { encodeDefaults = true }

    @Test
    fun aggregate_calculatesPnlTotalsAndMarginsInBasisPoints() {
        val report = SmallBusinessPnlEngine.aggregate(
            inputs = PnlInputs(
                revenues = listOf(revenue("sales", 100_000L, LocalDate(2024, 6, 3))),
                costOfGoodsSold = listOf(cogs("food", 30_000L, LocalDate(2024, 6, 3))),
                laborCosts = listOf(labor("cook", 20_000L, LocalDate(2024, 6, 4))),
                overheadCosts = listOf(overhead("rent", 10_000L, LocalDate(2024, 6, 5))),
            ),
            grouping = PnlPeriodGrouping.MONTHLY,
        )

        assertEquals(100_000L, report.summary.revenueCents)
        assertEquals(30_000L, report.summary.cogsCents)
        assertEquals(20_000L, report.summary.laborCents)
        assertEquals(10_000L, report.summary.overheadCents)
        assertEquals(70_000L, report.summary.grossProfitCents)
        assertEquals(30_000L, report.summary.operatingExpenseCents)
        assertEquals(40_000L, report.summary.netProfitCents)
        assertEquals(7_000L, report.summary.grossMarginBasisPoints)
        assertEquals(4_000L, report.summary.netMarginBasisPoints)
        assertEquals(3_000L, report.summary.foodCostBasisPoints)
        assertTrue(report.summary.hasRevenue)
    }

    @Test
    fun aggregate_truncatesRatioMathTowardZeroWithoutFloats() {
        val report = SmallBusinessPnlEngine.aggregate(
            lineItems = listOf(
                item("revenue", PnlLineItemType.REVENUE, 3L, LocalDate(2024, 6, 3)),
                item("cogs", PnlLineItemType.COST_OF_GOODS_SOLD, 1L, LocalDate(2024, 6, 3)),
            ),
            grouping = PnlPeriodGrouping.MONTHLY,
        )

        assertEquals(6_666L, report.summary.grossMarginBasisPoints)
        assertEquals(6_666L, report.summary.netMarginBasisPoints)
        assertEquals(3_333L, report.summary.foodCostBasisPoints)
    }

    @Test
    fun aggregate_groupsWeeklyUsingMondayStartAndSundayEnd() {
        val report = SmallBusinessPnlEngine.aggregate(
            lineItems = listOf(
                item("mon-sale", PnlLineItemType.REVENUE, 10_000L, LocalDate(2024, 6, 3)),
                item("sun-cogs", PnlLineItemType.COST_OF_GOODS_SOLD, 2_500L, LocalDate(2024, 6, 9)),
                item("next-mon-sale", PnlLineItemType.REVENUE, 20_000L, LocalDate(2024, 6, 10)),
                item("next-mon-labor", PnlLineItemType.LABOR, 5_000L, LocalDate(2024, 6, 10)),
            ),
            grouping = PnlPeriodGrouping.WEEKLY,
        )

        assertEquals(listOf("W-2024-06-03", "W-2024-06-10"), report.periods.map { it.period.key })
        assertEquals(LocalDate(2024, 6, 3), report.periods[0].period.startDate)
        assertEquals(LocalDate(2024, 6, 9), report.periods[0].period.endDate)
        assertEquals(10_000L, report.periods[0].summary.revenueCents)
        assertEquals(2_500L, report.periods[0].summary.cogsCents)
        assertEquals(7_500L, report.periods[0].summary.netProfitCents)
        assertEquals(listOf("mon-sale", "sun-cogs"), report.periods[0].lineItemIds)
        assertEquals(20_000L, report.periods[1].summary.revenueCents)
        assertEquals(15_000L, report.periods[1].summary.netProfitCents)
    }

    @Test
    fun aggregate_groupsMonthlyAndCanFilterDateRange() {
        val report = SmallBusinessPnlEngine.aggregate(
            lineItems = listOf(
                item("may-sale", PnlLineItemType.REVENUE, 50_000L, LocalDate(2024, 5, 31)),
                item("june-sale", PnlLineItemType.REVENUE, 100_000L, LocalDate(2024, 6, 1)),
                item("june-cogs", PnlLineItemType.COST_OF_GOODS_SOLD, 35_000L, LocalDate(2024, 6, 30)),
                item("july-sale", PnlLineItemType.REVENUE, 999_999L, LocalDate(2024, 7, 1)),
            ),
            grouping = PnlPeriodGrouping.MONTHLY,
            from = LocalDate(2024, 5, 1),
            to = LocalDate(2024, 6, 30),
        )

        assertEquals(listOf("2024-05", "2024-06"), report.periods.map { it.period.key })
        assertEquals(LocalDate(2024, 6, 1), report.periods[1].period.startDate)
        assertEquals(LocalDate(2024, 6, 30), report.periods[1].period.endDate)
        assertEquals(150_000L, report.summary.revenueCents)
        assertEquals(35_000L, report.summary.cogsCents)
        assertFalse(report.periods.any { it.period.key == "2024-07" })
    }

    @Test
    fun aggregate_zeroRevenueReturnsDocumentedZeroRatioSentinel() {
        val report = SmallBusinessPnlEngine.aggregate(
            lineItems = listOf(
                item("food", PnlLineItemType.COST_OF_GOODS_SOLD, 7_500L, LocalDate(2024, 6, 3)),
                item("labor", PnlLineItemType.LABOR, 12_500L, LocalDate(2024, 6, 3)),
                item("utilities", PnlLineItemType.OVERHEAD, 2_000L, LocalDate(2024, 6, 3)),
            ),
            grouping = PnlPeriodGrouping.WEEKLY,
        )

        assertEquals(0L, report.summary.revenueCents)
        assertEquals(-22_000L, report.summary.netProfitCents)
        assertEquals(SmallBusinessPnlEngine.ZERO_REVENUE_RATIO_BASIS_POINTS, report.summary.grossMarginBasisPoints)
        assertEquals(SmallBusinessPnlEngine.ZERO_REVENUE_RATIO_BASIS_POINTS, report.summary.netMarginBasisPoints)
        assertEquals(SmallBusinessPnlEngine.ZERO_REVENUE_RATIO_BASIS_POINTS, report.summary.foodCostBasisPoints)
        assertFalse(report.summary.hasRevenue)
    }

    @Test
    fun aggregate_negativeProfitProducesNegativeNetMargin() {
        val report = SmallBusinessPnlEngine.aggregate(
            lineItems = listOf(
                item("sales", PnlLineItemType.REVENUE, 10_000L, LocalDate(2024, 6, 3)),
                item("food", PnlLineItemType.COST_OF_GOODS_SOLD, 8_000L, LocalDate(2024, 6, 3)),
                item("labor", PnlLineItemType.LABOR, 3_000L, LocalDate(2024, 6, 3)),
                item("rent", PnlLineItemType.OVERHEAD, 1_000L, LocalDate(2024, 6, 3)),
            ),
            grouping = PnlPeriodGrouping.WEEKLY,
        )

        assertEquals(2_000L, report.summary.grossProfitCents)
        assertEquals(-2_000L, report.summary.netProfitCents)
        assertEquals(2_000L, report.summary.grossMarginBasisPoints)
        assertEquals(-2_000L, report.summary.netMarginBasisPoints)
        assertEquals(8_000L, report.summary.foodCostBasisPoints)
    }

    @Test
    fun aggregate_acceptsNegativeRevenueAndCostAdjustments() {
        val report = SmallBusinessPnlEngine.aggregate(
            inputs = PnlInputs(
                revenues = listOf(
                    revenue("sale", 25_000L, LocalDate(2024, 6, 3)),
                    revenue("refund", -5_000L, LocalDate(2024, 6, 4)),
                ),
                costOfGoodsSold = listOf(
                    cogs("food", 10_000L, LocalDate(2024, 6, 3)),
                    cogs("vendor-credit", -2_000L, LocalDate(2024, 6, 5)),
                ),
            ),
            grouping = PnlPeriodGrouping.MONTHLY,
        )

        assertEquals(20_000L, report.summary.revenueCents)
        assertEquals(8_000L, report.summary.cogsCents)
        assertEquals(12_000L, report.summary.netProfitCents)
        assertEquals(4_000L, report.summary.foodCostBasisPoints)
    }

    @Test
    fun serialization_roundTripsInputsLineItemsAndReport() {
        val inputs = PnlInputs(
            revenues = listOf(revenue("sales", 100_000L, LocalDate(2024, 6, 3), source = "counter")),
            costOfGoodsSold = listOf(cogs("food", 30_000L, LocalDate(2024, 6, 3), category = "ingredients")),
            laborCosts = listOf(labor("payroll", 20_000L, LocalDate(2024, 6, 4), role = "kitchen")),
            overheadCosts = listOf(overhead("rent", 10_000L, LocalDate(2024, 6, 5), category = "facility")),
        )
        val lineItem = item("manual", PnlLineItemType.OVERHEAD, 1_234L, LocalDate(2024, 6, 6), memo = "manual")
        val report = SmallBusinessPnlEngine.aggregate(inputs, PnlPeriodGrouping.MONTHLY)

        assertEquals(inputs, json.decodeFromString<PnlInputs>(json.encodeToString(inputs)))
        assertEquals(lineItem, json.decodeFromString<PnlLineItem>(json.encodeToString(lineItem)))
        assertEquals(report, json.decodeFromString<PnlReport>(json.encodeToString(report)))
    }

    @Test
    fun validation_rejectsBlankIdsAndInvalidDateRange() {
        assertFailsWith<IllegalArgumentException> {
            PnlRevenue(id = " ", amountCents = 1L, date = LocalDate(2024, 6, 3))
        }
        assertFailsWith<IllegalArgumentException> {
            PnlLineItem(id = "", type = PnlLineItemType.REVENUE, amountCents = 1L, date = LocalDate(2024, 6, 3))
        }
        assertFailsWith<IllegalArgumentException> {
            SmallBusinessPnlEngine.aggregate(
                lineItems = emptyList(),
                grouping = PnlPeriodGrouping.MONTHLY,
                from = LocalDate(2024, 6, 30),
                to = LocalDate(2024, 6, 1),
            )
        }
    }

    private fun revenue(
        id: String,
        amountCents: Long,
        date: LocalDate,
        source: String? = null,
    ): PnlRevenue = PnlRevenue(id, amountCents, date, source)

    private fun cogs(
        id: String,
        amountCents: Long,
        date: LocalDate,
        category: String? = null,
    ): PnlCostOfGoodsSold = PnlCostOfGoodsSold(id, amountCents, date, category)

    private fun labor(
        id: String,
        amountCents: Long,
        date: LocalDate,
        role: String? = null,
    ): PnlLaborCost = PnlLaborCost(id, amountCents, date, role)

    private fun overhead(
        id: String,
        amountCents: Long,
        date: LocalDate,
        category: String? = null,
    ): PnlOverheadCost = PnlOverheadCost(id, amountCents, date, category)

    private fun item(
        id: String,
        type: PnlLineItemType,
        amountCents: Long,
        date: LocalDate,
        memo: String? = null,
    ): PnlLineItem = PnlLineItem(id, type, amountCents, date, memo)
}
