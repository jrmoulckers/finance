// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.savings

import com.finance.core.TestFixtures
import com.finance.core.subscription.DetectedSubscription
import com.finance.core.subscription.SubscriptionConfidence
import com.finance.core.subscription.SubscriptionFrequency
import com.finance.models.BudgetPeriod
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlin.test.*

class SavingsEngineTest {

    private val referenceDate = LocalDate(2024, 6, 15)

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Spending spike detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detectSpendingSpikes_flagsSpike() {
        val catGroceries = SyncId("cat-groceries")

        // Historical: 3 months of $100/month groceries
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

        // Current month: $150 groceries (50% spike)
        val current = listOf(
            TestFixtures.createExpense(
                amount = Cents(15000),
                date = referenceDate,
                categoryId = catGroceries,
            ),
        )

        val suggestions = SavingsEngine.detectSpendingSpikes(historical + current, referenceDate)

        assertEquals(1, suggestions.size)
        assertEquals(SuggestionType.SPENDING_SPIKE, suggestions.first().type)
        assertEquals(catGroceries, suggestions.first().categoryId)
        assertEquals(SuggestionPriority.HIGH, suggestions.first().priority)
        // Savings = current ($150) - avg ($100) = $50
        assertEquals(Cents(5000), suggestions.first().estimatedMonthlySavings)
    }

    @Test
    fun detectSpendingSpikes_noSpike_noSuggestion() {
        val catId = SyncId("cat-dining")
        val transactions = (0..3).map { monthOffset ->
            val monthDate = referenceDate.minus(monthOffset, DateTimeUnit.MONTH)
            TestFixtures.createExpense(
                amount = Cents(5000), // consistent $50
                date = LocalDate(monthDate.year, monthDate.month, 10),
                categoryId = catId,
            )
        }

        val suggestions = SavingsEngine.detectSpendingSpikes(transactions, referenceDate)
        assertTrue(suggestions.isEmpty())
    }

    @Test
    fun detectSpendingSpikes_ignoresNullCategories() {
        val transactions = (0..3).map { monthOffset ->
            val monthDate = referenceDate.minus(monthOffset, DateTimeUnit.MONTH)
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = LocalDate(monthDate.year, monthDate.month, 10),
                categoryId = null,
            )
        }

        val suggestions = SavingsEngine.detectSpendingSpikes(transactions, referenceDate)
        assertTrue(suggestions.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Unused budget detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detectUnusedBudgets_flagsUnderused() {
        val budget = TestFixtures.createBudget(
            amount = Cents(50000), // $500 budget
            categoryId = SyncId("cat-dining"),
        )

        // Only $100 spent (20% utilization)
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(10000),
                date = referenceDate,
                categoryId = SyncId("cat-dining"),
            ),
        )

        val suggestions = SavingsEngine.detectUnusedBudgets(
            listOf(budget), transactions, referenceDate,
        )

        assertEquals(1, suggestions.size)
        assertEquals(SuggestionType.UNUSED_BUDGET, suggestions.first().type)
        assertEquals(SuggestionPriority.MEDIUM, suggestions.first().priority)
    }

    @Test
    fun detectUnusedBudgets_wellUsedBudget_noSuggestion() {
        val budget = TestFixtures.createBudget(
            amount = Cents(20000), // $200 budget
            categoryId = SyncId("cat-dining"),
        )

        // $150 spent (75% utilization)
        val transactions = listOf(
            TestFixtures.createExpense(
                amount = Cents(15000),
                date = referenceDate,
                categoryId = SyncId("cat-dining"),
            ),
        )

        val suggestions = SavingsEngine.detectUnusedBudgets(
            listOf(budget), transactions, referenceDate,
        )

        assertTrue(suggestions.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Subscription savings detection
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detectSubscriptionSavings_flagsAllSubscriptions() {
        val subscriptions = listOf(
            createTestSubscription("Netflix", Cents(1599), SubscriptionFrequency.MONTHLY),
            createTestSubscription("Gym Membership", Cents(4999), SubscriptionFrequency.MONTHLY),
        )

        val suggestions = SavingsEngine.detectSubscriptionSavings(subscriptions)

        assertEquals(2, suggestions.size)
        assertTrue(suggestions.all { it.type == SuggestionType.SUBSCRIPTION_REVIEW })
    }

    @Test
    fun detectSubscriptionSavings_highPriorityForExpensive() {
        val subscriptions = listOf(
            createTestSubscription("Expensive SaaS", Cents(9999), SubscriptionFrequency.MONTHLY),
        )

        val suggestions = SavingsEngine.detectSubscriptionSavings(subscriptions)

        assertEquals(1, suggestions.size)
        assertEquals(SuggestionPriority.HIGH, suggestions.first().priority) // $99.99 > $50
    }

    @Test
    fun detectSubscriptionSavings_lowPriorityForCheap() {
        val subscriptions = listOf(
            createTestSubscription("Cheap App", Cents(299), SubscriptionFrequency.MONTHLY),
        )

        val suggestions = SavingsEngine.detectSubscriptionSavings(subscriptions)

        assertEquals(SuggestionPriority.LOW, suggestions.first().priority) // $2.99 < $10
    }

    // ═══════════════════════════════════════════════════════════════════
    // Income allocation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detectIncomeAllocation_lowSavingsRate_suggests() {
        val transactions = listOf(
            // $5000 income
            TestFixtures.createIncome(
                amount = Cents(500000),
                date = referenceDate,
            ),
            // $4500 expenses (10% savings rate)
            TestFixtures.createExpense(
                amount = Cents(450000),
                date = referenceDate,
            ),
        )

        val suggestion = SavingsEngine.detectIncomeAllocationOpportunity(
            transactions, referenceDate,
        )

        assertNotNull(suggestion)
        assertEquals(SuggestionType.INCOME_ALLOCATION, suggestion.type)
        assertEquals(SuggestionPriority.HIGH, suggestion.priority)
        // Gap = 20% target ($1000) - actual savings ($500) = $500
        assertEquals(Cents(50000), suggestion.estimatedMonthlySavings)
    }

    @Test
    fun detectIncomeAllocation_goodSavingsRate_noSuggestion() {
        val transactions = listOf(
            TestFixtures.createIncome(amount = Cents(500000), date = referenceDate),
            // Only $3000 expenses (40% savings rate)
            TestFixtures.createExpense(amount = Cents(300000), date = referenceDate),
        )

        val suggestion = SavingsEngine.detectIncomeAllocationOpportunity(
            transactions, referenceDate,
        )

        assertNull(suggestion)
    }

    @Test
    fun detectIncomeAllocation_noIncome_noSuggestion() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(100000), date = referenceDate),
        )

        val suggestion = SavingsEngine.detectIncomeAllocationOpportunity(
            transactions, referenceDate,
        )

        assertNull(suggestion)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Round-up savings
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun detectRoundUpSavings_calculatesCorrectly() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(350), date = referenceDate), // round up 50¢
            TestFixtures.createExpense(amount = Cents(725), date = referenceDate), // round up 75¢
            TestFixtures.createExpense(amount = Cents(1000), date = referenceDate), // round up 0¢
        )

        val suggestion = SavingsEngine.detectRoundUpSavings(transactions, referenceDate)

        assertNotNull(suggestion)
        assertEquals(SuggestionType.ROUND_UP, suggestion.type)
        assertEquals(Cents(125), suggestion.estimatedMonthlySavings) // 50 + 75 = 125
        assertEquals(SuggestionPriority.LOW, suggestion.priority)
    }

    @Test
    fun detectRoundUpSavings_allEvenDollars_noSuggestion() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = referenceDate),
            TestFixtures.createExpense(amount = Cents(2500), date = referenceDate),
        )

        // $25.00 has no remainder, $10.00 has no remainder
        val suggestion = SavingsEngine.detectRoundUpSavings(transactions, referenceDate)
        // $25.00 → remainder = 0, $10.00 → remainder = 0 → total roundup = 0
        assertNull(suggestion)
    }

    @Test
    fun detectRoundUpSavings_noExpenses_noSuggestion() {
        val suggestion = SavingsEngine.detectRoundUpSavings(emptyList(), referenceDate)
        assertNull(suggestion)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Full suggestion pipeline
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun generateSuggestions_sortedByEstimatedSavings() {
        val catA = SyncId("cat-a")
        val catB = SyncId("cat-b")

        // Create spending spike (big savings)
        val spikeTransactions = (1..3).flatMap { monthOffset ->
            val monthDate = referenceDate.minus(monthOffset, DateTimeUnit.MONTH)
            listOf(
                TestFixtures.createExpense(
                    amount = Cents(10000),
                    date = LocalDate(monthDate.year, monthDate.month, 10),
                    categoryId = catA,
                ),
            )
        } + listOf(
            TestFixtures.createExpense(
                amount = Cents(20000),
                date = referenceDate,
                categoryId = catA,
            ),
        )

        val suggestions = SavingsEngine.generateSuggestions(
            transactions = spikeTransactions,
            referenceDate = referenceDate,
        )

        // Should be sorted by estimatedMonthlySavings descending
        if (suggestions.size > 1) {
            for (i in 0 until suggestions.size - 1) {
                assertTrue(
                    suggestions[i].estimatedMonthlySavings.amount >=
                        suggestions[i + 1].estimatedMonthlySavings.amount,
                    "Suggestions should be sorted by estimated savings descending",
                )
            }
        }
    }

    @Test
    fun generateSuggestions_emptyData_returnsEmpty() {
        val suggestions = SavingsEngine.generateSuggestions(
            transactions = emptyList(),
            referenceDate = referenceDate,
        )

        assertTrue(suggestions.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // SavingsSuggestion properties
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun savingsSuggestion_annualEstimate() {
        val suggestion = SavingsSuggestion(
            type = SuggestionType.SPENDING_SPIKE,
            title = "Test",
            description = "Test",
            estimatedMonthlySavings = Cents(5000), // $50/mo
        )

        assertEquals(Cents(60000), suggestion.estimatedAnnualSavings) // $600/yr
    }

    // ── Helper ───────────────────────────────────────────────────────

    private fun createTestSubscription(
        payee: String,
        monthlyCost: Cents,
        frequency: SubscriptionFrequency,
    ): DetectedSubscription {
        return DetectedSubscription(
            payee = payee,
            frequency = frequency,
            averageAmount = monthlyCost,
            estimatedMonthlyCost = monthlyCost,
            estimatedAnnualCost = Cents(monthlyCost.amount * 12),
            occurrenceCount = 6,
            firstSeen = LocalDate(2024, 1, 1),
            lastSeen = LocalDate(2024, 6, 1),
            confidence = SubscriptionConfidence.HIGH,
            transactions = emptyList(),
        )
    }
}
