// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.report

import com.finance.core.TestFixtures
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.*

class ReportBuilderEngineTest {

    @BeforeTest fun setup() { TestFixtures.reset() }

    @Test fun generate_default() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(1000), categoryId = SyncId("food")), TestFixtures.createExpense(amount = Cents(2000), categoryId = SyncId("transport")), TestFixtures.createIncome(amount = Cents(5000), categoryId = SyncId("salary")))
        val r = ReportBuilderEngine.generate(ReportConfig(), txns)
        assertEquals(3, r.summary.transactionCount); assertEquals(Cents(5000), r.summary.totalIncome); assertEquals(Cents(3000), r.summary.totalExpenses); assertEquals(Cents(2000), r.summary.netAmount)
    }

    @Test fun generate_dateFilter() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 5, 1)), TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 6, 15)), TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 7, 1)))
        val r = ReportBuilderEngine.generate(ReportConfig(startDate = LocalDate(2024, 6, 1), endDate = LocalDate(2024, 6, 30)), txns)
        assertEquals(1, r.summary.transactionCount); assertEquals(Cents(2000), r.summary.totalExpenses)
    }

    @Test fun generate_typeFilter() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(1000)), TestFixtures.createIncome(amount = Cents(5000)))
        assertEquals(1, ReportBuilderEngine.generate(ReportConfig(transactionTypes = setOf(TransactionType.EXPENSE)), txns).summary.transactionCount)
    }

    @Test fun groupByCategory() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(1000), categoryId = SyncId("food")), TestFixtures.createExpense(amount = Cents(1500), categoryId = SyncId("food")), TestFixtures.createExpense(amount = Cents(2000), categoryId = SyncId("transport")))
        val r = ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.CATEGORY), txns)
        assertEquals(2, r.groups.size); assertNotNull(r.groups.find { it.key == "food" }); assertEquals(2, r.groups.find { it.key == "food" }!!.transactionCount)
    }

    @Test fun groupByAccount() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(1000), accountId = SyncId("checking")), TestFixtures.createExpense(amount = Cents(2000), accountId = SyncId("savings")))
        assertEquals(2, ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.ACCOUNT), txns).groups.size)
    }

    @Test fun groupByPeriod_monthly() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 5, 10)), TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 5, 20)), TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 6, 15)))
        val r = ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.PERIOD, periodGrouping = PeriodGrouping.MONTHLY), txns)
        assertEquals(2, r.groups.size); assertEquals("2024-05", r.groups[0].key); assertEquals("2024-06", r.groups[1].key); assertEquals(2, r.groups[0].transactionCount)
    }

    @Test fun groupByPeriod_quarterly() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 1, 15)), TestFixtures.createExpense(amount = Cents(2000), date = LocalDate(2024, 4, 15)), TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 7, 15)))
        val r = ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.PERIOD, periodGrouping = PeriodGrouping.QUARTERLY), txns)
        assertEquals(3, r.groups.size); assertEquals("2024-Q1", r.groups[0].key); assertEquals("2024-Q2", r.groups[1].key); assertEquals("2024-Q3", r.groups[2].key)
    }

    @Test fun groupByPayee() {
        val txns = listOf(TestFixtures.createExpense(amount = Cents(500)).copy(payee = "Starbucks"), TestFixtures.createExpense(amount = Cents(600)).copy(payee = "Starbucks"), TestFixtures.createExpense(amount = Cents(2000)).copy(payee = "Amazon"))
        assertEquals(2, ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.PAYEE), txns).groups.size)
    }

    @Test fun groupByNone() { val r = ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.NONE), listOf(TestFixtures.createExpense(amount = Cents(1000)), TestFixtures.createExpense(amount = Cents(2000)))); assertEquals(1, r.groups.size); assertEquals("all", r.groups[0].key) }

    @Test fun excludesDeleted() { assertEquals(1, ReportBuilderEngine.generate(ReportConfig(), listOf(TestFixtures.createExpense(amount = Cents(1000)), TestFixtures.createExpense(amount = Cents(2000), deletedAt = TestFixtures.fixedInstant))).summary.transactionCount) }

    @Test fun jsonStructure() {
        val r = ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.NONE), listOf(TestFixtures.createExpense(amount = Cents(1000))))
        val json = ReportBuilderEngine.formatAsJsonStructure(r)
        assertTrue(json.containsKey("summary")); assertTrue(json.containsKey("groups"))
        @Suppress("UNCHECKED_CAST") assertEquals(1000L, (json["summary"] as Map<String, Any>)["totalExpenses"])
    }

    @Test fun csvRows() {
        val r = ReportBuilderEngine.generate(ReportConfig(groupBy = GroupBy.NONE), listOf(TestFixtures.createExpense(amount = Cents(1000)), TestFixtures.createExpense(amount = Cents(2000))))
        val rows = ReportBuilderEngine.formatAsCsvRows(r)
        assertEquals(3, rows.size); assertEquals("Group", rows[0][0])
    }

    @Test fun emptyTransactions() { val r = ReportBuilderEngine.generate(ReportConfig(), emptyList()); assertEquals(0, r.summary.transactionCount); assertEquals(Cents.ZERO, r.summary.totalIncome); assertNull(r.summary.dateRange) }
}
