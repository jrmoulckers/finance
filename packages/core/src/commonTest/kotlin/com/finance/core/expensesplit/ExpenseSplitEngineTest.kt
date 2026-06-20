// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.expensesplit

import kotlinx.datetime.LocalDate
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith

class ExpenseSplitEngineTest {
    private val tx1 = ExpenseSplitTransaction(
        id = "t1",
        merchant = "Office Depot",
        category = "Office Supplies",
        amountCents = 5_000L,
        date = LocalDate.parse("2024-02-15"),
    )
    private val tx2 = ExpenseSplitTransaction(
        id = "t2",
        merchant = "Whole Foods",
        category = "Groceries",
        amountCents = 8_000L,
        date = LocalDate.parse("2024-05-20"),
    )
    private val tx3 = ExpenseSplitTransaction(
        id = "t3",
        merchant = "WeWork",
        category = "Office Rent",
        amountCents = 200_000L,
        date = LocalDate.parse("2024-07-01"),
    )

    @Test
    fun businessPortion_matchesWebFixtures() {
        assertEquals(10_000L, ExpenseSplitEngine.businessPortion(10_000L, ExpenseType.BUSINESS))
        assertEquals(0L, ExpenseSplitEngine.businessPortion(10_000L, ExpenseType.PERSONAL))
        assertEquals(
            6_000L,
            ExpenseSplitEngine.businessPortion(10_000L, ExpenseType.SPLIT, SplitRatio(60, 40)),
        )
        assertEquals(
            3_300L,
            ExpenseSplitEngine.businessPortion(10_001L, ExpenseType.SPLIT, SplitRatio(33, 67)),
        )
    }

    @Test
    fun splitAmounts_alwaysSumExactlyAndAssignRemainderToPersonal() {
        for (amount in -10_003L..10_003L) {
            for (businessPercent in 0..100) {
                val split = ExpenseSplitEngine.splitAmounts(
                    totalCents = amount,
                    expenseType = ExpenseType.SPLIT,
                    splitRatio = SplitRatio(businessPercent, 100 - businessPercent),
                )

                assertEquals(amount, split.businessCents + split.personalCents)
                if (split.remainderAssignedTo == RemainderTarget.PERSONAL) {
                    val directPersonal = ExpenseSplitEngine.businessPortion(
                        amount,
                        ExpenseType.SPLIT,
                        SplitRatio(100 - businessPercent, businessPercent),
                    )
                    assertFalse(split.personalCents == directPersonal)
                }
            }
        }

        val halfCent = ExpenseSplitEngine.splitAmounts(1L, ExpenseType.SPLIT, SplitRatio(50, 50))
        assertEquals(0L, halfCent.businessCents)
        assertEquals(1L, halfCent.personalCents)
        assertEquals(RemainderTarget.PERSONAL, halfCent.remainderAssignedTo)
    }

    @Test
    fun classifyTransaction_derivesPersonalAsNonDeductibleAndKeepsSplitRatio() {
        val business = ExpenseSplitEngine.classifyTransaction(
            tx1,
            ExpenseType.BUSINESS,
            isDeductible = true,
            deductionCategory = "Supplies",
        )
        assertEquals(ExpenseType.BUSINESS, business.expenseType)
        assertTrue(business.isDeductible)
        assertEquals("Supplies", business.deductionCategory)
        assertNull(business.splitRatio)

        val personal = ExpenseSplitEngine.classifyTransaction(tx2, ExpenseType.PERSONAL, isDeductible = true)
        assertEquals(ExpenseType.PERSONAL, personal.expenseType)
        assertFalse(personal.isDeductible)

        val split = ExpenseSplitEngine.classifyTransaction(
            tx3,
            ExpenseType.SPLIT,
            splitRatio = SplitRatio(70, 30),
            isDeductible = true,
        )
        assertEquals(ExpenseType.SPLIT, split.expenseType)
        assertEquals(SplitRatio(70, 30), split.splitRatio)
        assertTrue(split.isDeductible)
    }

    @Test
    fun classifyTransaction_rejectsInvalidSplitRatio() {
        val error = assertFailsWith<IllegalArgumentException> {
            ExpenseSplitEngine.classifyTransaction(tx1, ExpenseType.SPLIT, SplitRatio(60, 60))
        }
        assertTrue(error.message!!.contains("Split ratio must sum to 100"))
    }

    @Test
    fun validationReportsBoundsAndConsistencyEdges() {
        val missing = ExpenseSplitEngine.validateSplitRatio(null)
        assertFalse(missing.isValid)
        assertTrue(missing.errors.any { it.contains("required") })

        val invalidRatio = ExpenseSplitEngine.validateSplitRatio(SplitRatio(-1, 102))
        assertFalse(invalidRatio.isValid)
        assertEquals(3, invalidRatio.errors.size)

        val nonSplitWithRatio = ExpenseSplitEngine.validateClassification(
            ClassifiedExpense(tx1, ExpenseType.BUSINESS, splitRatio = SplitRatio(50, 50)),
        )
        assertFalse(nonSplitWithRatio.isValid)
        assertTrue(nonSplitWithRatio.errors.any { it.contains("only allowed") })

        val personalDeductible = ExpenseSplitEngine.validateClassification(
            ClassifiedExpense(tx2, ExpenseType.PERSONAL, isDeductible = true),
        )
        assertFalse(personalDeductible.isValid)
        assertTrue(personalDeductible.errors.any { it.contains("Personal expenses") })
    }

    @Test
    fun reportingFilters_returnExpectedExpenseSets() {
        val classified = listOf(
            ExpenseSplitEngine.classifyTransaction(tx1, ExpenseType.BUSINESS, isDeductible = true),
            ExpenseSplitEngine.classifyTransaction(tx2, ExpenseType.PERSONAL),
            ExpenseSplitEngine.classifyTransaction(tx3, ExpenseType.SPLIT, SplitRatio(50, 50), true),
        )

        assertEquals(listOf("t1", "t3"), ExpenseSplitEngine.businessExpenses(classified).map { it.transaction.id })
        assertEquals(listOf("t2"), ExpenseSplitEngine.personalExpenses(classified).map { it.transaction.id })
        assertEquals(listOf("t1", "t3"), ExpenseSplitEngine.taxDeductibleExpenses(classified).map { it.transaction.id })
        assertEquals(
            listOf("t1", "t2"),
            ExpenseSplitEngine.filterByDateRange(
                classified,
                LocalDate.parse("2024-01-01"),
                LocalDate.parse("2024-06-30"),
            ).map { it.transaction.id },
        )
    }

    @Test
    fun generateBusinessExpenseReport_matchesWebTotals() {
        val classified = listOf(
            ExpenseSplitEngine.classifyTransaction(tx1, ExpenseType.BUSINESS, isDeductible = true, deductionCategory = "Supplies"),
            ExpenseSplitEngine.classifyTransaction(tx2, ExpenseType.PERSONAL),
            ExpenseSplitEngine.classifyTransaction(tx3, ExpenseType.SPLIT, SplitRatio(50, 50), true),
        )

        val report = ExpenseSplitEngine.generateBusinessExpenseReport(
            classified,
            LocalDate.parse("2024-01-01"),
            LocalDate.parse("2024-12-31"),
        )

        assertEquals(2, report.transactions.size)
        assertEquals(105_000L, report.totalBusinessCents)
        assertEquals(105_000L, report.totalDeductibleCents)
        assertEquals(100_000L, report.totalSplitBusinessPortionCents)
        assertEquals(5_000L, report.categoryBreakdown["Office Supplies"])
        assertEquals(100_000L, report.categoryBreakdown["Office Rent"])
    }

    @Test
    fun quarterlyBusinessSummary_matchesWebFixtures() {
        val classified = listOf(
            ExpenseSplitEngine.classifyTransaction(tx1, ExpenseType.BUSINESS, isDeductible = true),
            ExpenseSplitEngine.classifyTransaction(tx3, ExpenseType.BUSINESS, isDeductible = false),
        )

        val summaries = ExpenseSplitEngine.quarterlyBusinessSummary(classified, 2024)
        assertEquals(4, summaries.size)
        assertEquals(5_000L, summaries.single { it.quarter == Quarter.Q1 }.totalBusinessCents)
        assertEquals(5_000L, summaries.single { it.quarter == Quarter.Q1 }.totalDeductibleCents)
        assertEquals(200_000L, summaries.single { it.quarter == Quarter.Q3 }.totalBusinessCents)
        assertEquals(0L, summaries.single { it.quarter == Quarter.Q3 }.totalDeductibleCents)
        assertEquals(0L, summaries.single { it.quarter == Quarter.Q2 }.totalBusinessCents)
        assertEquals(0L, summaries.single { it.quarter == Quarter.Q4 }.totalBusinessCents)
    }

    @Test
    fun quarterAndYearFromDate_matchWebFixtures() {
        assertEquals(Quarter.Q1, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-01-15")))
        assertEquals(Quarter.Q1, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-03-31")))
        assertEquals(Quarter.Q2, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-04-01")))
        assertEquals(Quarter.Q2, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-06-30")))
        assertEquals(Quarter.Q3, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-07-01")))
        assertEquals(Quarter.Q3, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-09-30")))
        assertEquals(Quarter.Q4, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-10-01")))
        assertEquals(Quarter.Q4, ExpenseSplitEngine.quarterFromDate(LocalDate.parse("2024-12-31")))
        assertEquals(2024, ExpenseSplitEngine.yearFromDate(LocalDate.parse("2024-07-01")))
    }

    @Test
    fun calculateAllocation_matchesWebFixtures() {
        assertEquals(67_000L, ExpenseSplitEngine.calculateAllocation(AllocationConfig(AllocationType.MILEAGE, 67, 1_000)))
        assertEquals(
            50_000L,
            ExpenseSplitEngine.calculateAllocation(AllocationConfig(AllocationType.HOME_OFFICE, 25, 200_000)),
        )
        assertEquals(0L, ExpenseSplitEngine.calculateAllocation(AllocationConfig(AllocationType.MILEAGE, 67, 0)))
        assertEquals(0L, ExpenseSplitEngine.calculateAllocation(AllocationConfig(AllocationType.HOME_OFFICE, 0, 100_000)))
    }

    @Test
    fun businessExpenseRules_matchWebInferenceAndDeductionFixture() {
        val baseTransaction = BusinessExpenseTransactionInput(
            id = "txn-1",
            date = LocalDate.parse("2024-06-10"),
            payee = "Downtown Restaurant",
            note = "Client lunch",
            amountCents = -10_000L,
            type = TransactionKind.EXPENSE,
            categoryName = "Restaurants",
        )

        val defaults = BusinessExpenseRules.getBusinessExpenseDefaults(baseTransaction)
        assertEquals(ExpenseCategory.MEALS, defaults.category)
        assertEquals(50, defaults.deductiblePercent)

        val classified = BusinessExpenseRules.classifyBusinessExpense(
            baseTransaction.copy(
                tags = listOf(BUSINESS_EXPENSE_TAG),
                customFields = mapOf(
                    BusinessExpenseFields.CATEGORY to "meals",
                    BusinessExpenseFields.BUSINESS_USE_PERCENT to "80",
                    BusinessExpenseFields.DEDUCTIBLE_PERCENT to "50",
                    BusinessExpenseFields.NOTE to "Lunch with client after onsite workshop",
                    BusinessExpenseFields.SOURCE to "manual",
                ),
            ),
        )

        assertNotNull(classified)
        assertEquals(ExpenseCategory.MEALS, classified.category)
        assertEquals(4_000L, classified.deductibleAmountCents)
        assertTrue(classified.note.contains("onsite workshop"))
        assertEquals("Meals (50%)", classified.categoryLabel)
    }

    @Test
    fun businessExpenseRules_ignoreNonExpenseAndUntaggedTransactions() {
        val income = BusinessExpenseTransactionInput(
            id = "income-1",
            date = LocalDate.parse("2024-06-10"),
            payee = "Client",
            amountCents = 10_000L,
            type = TransactionKind.INCOME,
            tags = listOf(BUSINESS_EXPENSE_TAG),
            customFields = mapOf(BusinessExpenseFields.CATEGORY to "travel"),
        )
        assertNull(BusinessExpenseRules.classifyBusinessExpense(income))

        val untagged = income.copy(id = "expense-1", type = TransactionKind.EXPENSE, tags = emptyList(), customFields = null)
        assertNull(BusinessExpenseRules.classifyBusinessExpense(untagged))
        assertFalse(BusinessExpenseRules.isBusinessExpenseTransaction(untagged))
    }

    @Test
    fun serializesClassifiedExpenseRoundTrip() {
        val json = Json { encodeDefaults = true }
        val classified = ExpenseSplitEngine.classifyTransaction(
            tx3,
            ExpenseType.SPLIT,
            splitRatio = SplitRatio(33, 67),
            isDeductible = true,
            deductionCategory = "Office Rent",
        )

        assertEquals(classified, json.decodeFromString<ClassifiedExpense>(json.encodeToString(classified)))
    }

    @Test
    fun serializesReportsAndBusinessExpenseClassificationRoundTrip() {
        val json = Json { encodeDefaults = true }
        val classified = listOf(
            ExpenseSplitEngine.classifyTransaction(tx1, ExpenseType.BUSINESS, isDeductible = true),
            ExpenseSplitEngine.classifyTransaction(tx3, ExpenseType.SPLIT, SplitRatio(50, 50), true),
        )
        val report = ExpenseSplitEngine.generateBusinessExpenseReport(
            classified,
            LocalDate.parse("2024-01-01"),
            LocalDate.parse("2024-12-31"),
        )
        assertEquals(report, json.decodeFromString<BusinessExpenseReport>(json.encodeToString(report)))

        val businessClassification = BusinessExpenseClassification(
            transactionId = "txn-1",
            date = LocalDate.parse("2024-06-10"),
            payee = "Downtown Restaurant",
            amountCents = 10_000L,
            deductibleAmountCents = 4_000L,
            categoryLabel = "Meals (50%)",
            category = ExpenseCategory.MEALS,
            businessUsePercent = 80,
            deductiblePercent = 50,
            note = "Client lunch",
        )
        assertEquals(
            businessClassification,
            json.decodeFromString<BusinessExpenseClassification>(json.encodeToString(businessClassification)),
        )
    }
}
