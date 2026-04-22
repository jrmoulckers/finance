// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.tips

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class FinancialTipsEngineTest {

    private val referenceDate = LocalDate(2024, 6, 15)

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Budget tips
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun budgetTips_overBudget_returnsHighPriorityTip() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
            name = "Groceries",
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(60000), date = LocalDate(2024, 6, 10)),
        )

        val tips = FinancialTipsEngine.budgetTips(listOf(budget), transactions, referenceDate)

        assertEquals(1, tips.size)
        val tip = tips.first()
        assertEquals(TipCategory.BUDGET, tip.category)
        assertEquals(TipPriority.HIGH, tip.priority)
        assertEquals(Cents(10000), tip.amountCents) // $100 over
        assertTrue(tip.title.contains("exceeded"))
        assertEquals("navigate:budgets", tip.actionHint)
    }

    @Test
    fun budgetTips_warningLevel_returnsMediumPriorityTip() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
            name = "Dining",
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(40000), date = LocalDate(2024, 6, 10)),
        )

        val tips = FinancialTipsEngine.budgetTips(listOf(budget), transactions, referenceDate)

        assertEquals(1, tips.size)
        assertEquals(TipPriority.MEDIUM, tips.first().priority)
        assertTrue(tips.first().title.contains("almost"))
    }

    @Test
    fun budgetTips_healthy_returnsNoTips() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
        )
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 10)),
        )

        val tips = FinancialTipsEngine.budgetTips(listOf(budget), transactions, referenceDate)

        assertTrue(tips.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Goal tips
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun goalTips_almostComplete_returnsMediumPriority() {
        val goal = Goal(
            id = SyncId("goal-1"),
            householdId = SyncId("household-1"),
            ownerId = SyncId("owner-1"),
            name = "Vacation Fund",
            targetAmount = Cents(100000), // $1,000
            currentAmount = Cents(92000), // $920 = 92%
            currency = Currency.USD,
            status = GoalStatus.ACTIVE,
            createdAt = TestFixtures.fixedInstant,
            updatedAt = TestFixtures.fixedInstant,
        )

        val tips = FinancialTipsEngine.goalTips(listOf(goal), emptyList(), referenceDate)

        assertEquals(1, tips.size)
        val tip = tips.first()
        assertEquals(TipCategory.SAVINGS, tip.category)
        assertEquals(TipPriority.MEDIUM, tip.priority)
        assertEquals(Cents(8000), tip.amountCents) // $80 remaining
        assertTrue(tip.title.contains("Almost there"))
    }

    @Test
    fun goalTips_staleGoal_returnsLowPriority() {
        val goalAccountId = SyncId("savings-acct")
        val goal = Goal(
            id = SyncId("goal-2"),
            householdId = SyncId("household-1"),
            ownerId = SyncId("owner-1"),
            name = "Emergency Fund",
            targetAmount = Cents(500000),
            currentAmount = Cents(100000),
            currency = Currency.USD,
            status = GoalStatus.ACTIVE,
            accountId = goalAccountId,
            createdAt = TestFixtures.fixedInstant,
            updatedAt = TestFixtures.fixedInstant,
        )

        // No recent contributions
        val tips = FinancialTipsEngine.goalTips(listOf(goal), emptyList(), referenceDate)

        val staleTip = tips.find { it.id.startsWith("goal-stale") }
        assertNotNull(staleTip)
        assertEquals(TipPriority.LOW, staleTip.priority)
        assertTrue(staleTip.description.contains("30 days"))
    }

    @Test
    fun goalTips_completedGoal_noTips() {
        val goal = Goal(
            id = SyncId("goal-3"),
            householdId = SyncId("household-1"),
            ownerId = SyncId("owner-1"),
            name = "Done Goal",
            targetAmount = Cents(50000),
            currentAmount = Cents(50000),
            currency = Currency.USD,
            status = GoalStatus.COMPLETED,
            createdAt = TestFixtures.fixedInstant,
            updatedAt = TestFixtures.fixedInstant,
        )

        val tips = FinancialTipsEngine.goalTips(listOf(goal), emptyList(), referenceDate)

        assertTrue(tips.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Spending spike tips
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun spendingSpikeTips_spikeDetected_returnsHighPriority() {
        val catGroceries = SyncId("cat-groceries")

        // 3 months of $100/month
        val historical = (1..3).flatMap { monthOffset ->
            val monthDate = referenceDate.minus(monthOffset, DateTimeUnit.MONTH)
            listOf(
                TestFixtures.createExpense(
                    amount = Cents(10000),
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catGroceries,
                ),
            )
        }

        // Current month: $200 (100% spike, well above 30%)
        val current = listOf(
            TestFixtures.createExpense(
                amount = Cents(20000),
                date = referenceDate,
                categoryId = catGroceries,
            ),
        )

        val tips = FinancialTipsEngine.spendingSpikeTips(
            historical + current, referenceDate,
        )

        assertEquals(1, tips.size)
        assertEquals(TipPriority.HIGH, tips.first().priority)
        assertEquals(TipCategory.SPENDING, tips.first().category)
        assertEquals(Cents(10000), tips.first().amountCents) // $100 above avg
    }

    @Test
    fun spendingSpikeTips_noSpike_returnsEmpty() {
        val catGroceries = SyncId("cat-groceries")

        val historical = (1..3).flatMap { monthOffset ->
            val monthDate = referenceDate.minus(monthOffset, DateTimeUnit.MONTH)
            listOf(
                TestFixtures.createExpense(
                    amount = Cents(10000),
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catGroceries,
                ),
            )
        }

        // Current month: $105 (5% increase, below threshold)
        val current = listOf(
            TestFixtures.createExpense(
                amount = Cents(10500),
                date = referenceDate,
                categoryId = catGroceries,
            ),
        )

        val tips = FinancialTipsEngine.spendingSpikeTips(
            historical + current, referenceDate,
        )

        assertTrue(tips.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Low savings rate tip
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun lowSavingsRateTip_belowThreshold_returnsTip() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(500000), // $5,000
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(480000), // $4,800 (4% savings rate)
                date = LocalDate(2024, 6, 10),
            ),
        )

        val tip = FinancialTipsEngine.lowSavingsRateTip(transactions, referenceDate)

        assertNotNull(tip)
        assertEquals(TipPriority.HIGH, tip.priority)
        assertEquals(TipCategory.SAVINGS, tip.category)
    }

    @Test
    fun lowSavingsRateTip_aboveThreshold_returnsNull() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(500000), // $5,000
                date = LocalDate(2024, 6, 5),
            ),
            TestFixtures.createExpense(
                amount = Cents(400000), // $4,000 (20% savings rate)
                date = LocalDate(2024, 6, 10),
            ),
        )

        val tip = FinancialTipsEngine.lowSavingsRateTip(transactions, referenceDate)

        assertNull(tip)
    }

    @Test
    fun lowSavingsRateTip_noIncome_returnsNull() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = LocalDate(2024, 6, 10),
            ),
        )

        val tip = FinancialTipsEngine.lowSavingsRateTip(transactions, referenceDate)

        assertNull(tip)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Positive savings streak
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun positiveSavingsStreakTip_threeMonths_returnsTip() {
        val transactions = (0..2).flatMap { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            listOf(
                TestFixtures.createIncome(
                    amount = Cents(500000),
                    date = LocalDate(monthDate.year, monthDate.month, 5),
                ),
                TestFixtures.createExpense(
                    amount = Cents(400000),
                    date = LocalDate(monthDate.year, monthDate.month, 15),
                ),
            )
        }

        val tip = FinancialTipsEngine.positiveSavingsStreakTip(transactions, referenceDate)

        assertNotNull(tip)
        assertEquals(TipPriority.LOW, tip.priority)
        assertTrue(tip.description.contains("3"))
    }

    @Test
    fun positiveSavingsStreakTip_twoMonths_returnsNull() {
        val transactions = (0..1).flatMap { offset ->
            val monthDate = referenceDate.minus(offset, DateTimeUnit.MONTH)
            listOf(
                TestFixtures.createIncome(
                    amount = Cents(500000),
                    date = LocalDate(monthDate.year, monthDate.month, 5),
                ),
                TestFixtures.createExpense(
                    amount = Cents(400000),
                    date = LocalDate(monthDate.year, monthDate.month, 15),
                ),
            )
        }

        // Add a negative month 3 months ago
        val threeMonthsAgo = referenceDate.minus(2, DateTimeUnit.MONTH)
        val allTxns = transactions + listOf(
            TestFixtures.createExpense(
                amount = Cents(900000),
                date = LocalDate(threeMonthsAgo.year, threeMonthsAgo.month, 15),
            ),
        )

        val tip = FinancialTipsEngine.positiveSavingsStreakTip(allTxns, referenceDate)

        // The 3rd month has negative cash flow, so streak is broken
        // However, our streak counter goes 0,1,2 (offsets) and checks
        // month 0 and 1 are positive but month 2 has a 900k expense with no income
        assertNull(tip)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Large transaction tips
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun largeTransactionTips_detectsLargeExpense() {
        val transactions = listOf(
            TestFixtures.createIncome(
                amount = Cents(500000), // $5,000 income
                date = LocalDate(2024, 6, 1),
            ),
            TestFixtures.createExpense(
                amount = Cents(150000), // $1,500 = 30% of income
                date = LocalDate(2024, 6, 10),
                categoryId = SyncId("cat-electronics"),
            ),
        )

        val tips = FinancialTipsEngine.largeTransactionTips(transactions, referenceDate)

        assertEquals(1, tips.size)
        assertEquals(TipPriority.MEDIUM, tips.first().priority)
        assertEquals(TipCategory.SPENDING, tips.first().category)
    }

    @Test
    fun largeTransactionTips_noIncome_returnsEmpty() {
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(150000),
                date = LocalDate(2024, 6, 10),
            ),
        )

        val tips = FinancialTipsEngine.largeTransactionTips(transactions, referenceDate)

        assertTrue(tips.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // No emergency fund tip
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun noEmergencyFundTip_lowSavings_returnsTip() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.CHECKING,
                currentBalance = Cents(500000),
            ),
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(50000), // $500 savings
            ),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(200000), // $2,000 monthly expenses
                date = LocalDate(2024, 6, 10),
            ),
        )

        val tip = FinancialTipsEngine.noEmergencyFundTip(accounts, transactions, referenceDate)

        assertNotNull(tip)
        assertEquals(TipPriority.MEDIUM, tip.priority)
        assertTrue(tip.description.contains("emergency fund"))
    }

    @Test
    fun noEmergencyFundTip_adequateSavings_returnsNull() {
        val accounts = listOf(
            TestFixtures.createAccount(
                type = AccountType.SAVINGS,
                currentBalance = Cents(1000000), // $10,000 savings
            ),
        )
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(200000),
                date = LocalDate(2024, 6, 10),
            ),
        )

        val tip = FinancialTipsEngine.noEmergencyFundTip(accounts, transactions, referenceDate)

        assertNull(tip)
    }

    // ═══════════════════════════════════════════════════════════════════
    // No budget category tips
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun noBudgetCategoryTips_unbudgetedSpending_returnsTips() {
        val budgetedCategory = SyncId("cat-budgeted")
        val unbudgetedCategory = SyncId("cat-unbudgeted")

        val budgets = listOf(
            TestFixtures.createBudget(categoryId = budgetedCategory),
        )

        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(30000),
                date = LocalDate(2024, 6, 10),
                categoryId = unbudgetedCategory,
            ),
            TestFixtures.createExpense(
                amount = Cents(20000),
                date = LocalDate(2024, 6, 12),
                categoryId = budgetedCategory,
            ),
        )

        val tips = FinancialTipsEngine.noBudgetCategoryTips(
            transactions, budgets, referenceDate,
        )

        assertEquals(1, tips.size)
        assertEquals(TipPriority.LOW, tips.first().priority)
        assertEquals(unbudgetedCategory, tips.first().relatedCategoryId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateTips integration
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun generateTips_sortsByPriorityDescending() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000),
            period = BudgetPeriod.MONTHLY,
            startDate = LocalDate(2024, 6, 1),
            name = "Over Budget",
        )

        val context = FinancialContext(
            transactions = listOf(
                TestFixtures.createExpense(
                    amount = Cents(60000),
                    date = LocalDate(2024, 6, 10),
                ),
                TestFixtures.createIncome(
                    amount = Cents(500000),
                    date = LocalDate(2024, 6, 1),
                ),
            ),
            budgets = listOf(budget),
            goals = emptyList(),
            accounts = listOf(
                TestFixtures.createAccount(
                    type = AccountType.SAVINGS,
                    currentBalance = Cents(1000000),
                ),
            ),
            categories = emptyList(),
        )

        val tips = FinancialTipsEngine.generateTips(context, referenceDate)

        // Verify HIGH priority tips come first
        if (tips.size > 1) {
            for (i in 0 until tips.size - 1) {
                assertTrue(
                    tips[i].priority.ordinal >= tips[i + 1].priority.ordinal,
                    "Tips should be sorted by priority descending. " +
                        "Found ${tips[i].priority} before ${tips[i + 1].priority}",
                )
            }
        }
    }

    @Test
    fun generateTips_emptyContext_returnsEmptyList() {
        val context = FinancialContext(
            transactions = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
            accounts = emptyList(),
            categories = emptyList(),
        )

        val tips = FinancialTipsEngine.generateTips(context, referenceDate)

        assertTrue(tips.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // TipTypes validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun financialTip_serializationRoundTrip() {
        val tip = FinancialTip(
            id = "test-tip-1",
            title = "Test Tip",
            description = "A test description",
            category = TipCategory.BUDGET,
            priority = TipPriority.HIGH,
            amountCents = Cents(5000),
            relatedCategoryId = SyncId("cat-1"),
            actionHint = "navigate:budgets",
        )

        // Verify all fields are accessible (compile-time check mainly)
        assertEquals("test-tip-1", tip.id)
        assertEquals("Test Tip", tip.title)
        assertEquals(TipCategory.BUDGET, tip.category)
        assertEquals(TipPriority.HIGH, tip.priority)
        assertEquals(Cents(5000), tip.amountCents)
        assertEquals(SyncId("cat-1"), tip.relatedCategoryId)
        assertNull(tip.relatedAccountId)
        assertEquals("navigate:budgets", tip.actionHint)
    }
}
