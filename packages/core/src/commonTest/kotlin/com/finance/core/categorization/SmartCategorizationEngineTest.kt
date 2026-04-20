// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.categorization

import com.finance.core.TestFixtures
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlin.test.*

class SmartCategorizationEngineTest {

    private lateinit var engine: SmartCategorizationEngine

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
        engine = SmartCategorizationEngine()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Keyword rules
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_keywordMatch_returnsCategory() {
        val groceryId = SyncId("cat-groceries")
        engine.addKeywordRule(
            KeywordRule(
                keywords = listOf("whole foods", "trader joe"),
                categoryId = groceryId,
                weight = 70,
            ),
        )

        val suggestion = engine.suggest("Whole Foods Market")
        assertNotNull(suggestion)
        assertEquals(groceryId, suggestion.categoryId)
        assertEquals(CategorizationStrategy.KEYWORD_MATCH, suggestion.strategy)
        assertEquals(Confidence.MEDIUM, suggestion.confidence)
    }

    @Test
    fun suggest_keywordMatch_caseInsensitive() {
        val diningId = SyncId("cat-dining")
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("pizza"), categoryId = diningId, weight = 50),
        )

        assertNotNull(engine.suggest("PIZZA HUT"))
        assertNotNull(engine.suggest("domino's pizza"))
    }

    @Test
    fun suggest_keywordMatch_higherWeightWins() {
        val groceryId = SyncId("cat-groceries")
        val diningId = SyncId("cat-dining")
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("food"), categoryId = diningId, weight = 30),
        )
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("whole foods"), categoryId = groceryId, weight = 90),
        )

        val suggestion = engine.suggest("Whole Foods")
        assertNotNull(suggestion)
        assertEquals(groceryId, suggestion.categoryId)
        assertEquals(Confidence.HIGH, suggestion.confidence)
    }

    @Test
    fun suggest_noKeywordMatch_returnsNull() {
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("starbucks"), categoryId = SyncId("cat-coffee"), weight = 50),
        )
        assertNull(engine.suggest("Target"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // User corrections
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_userCorrection_overridesEverything() {
        val groceryId = SyncId("cat-groceries")
        val diningId = SyncId("cat-dining")

        // Keyword rule says "food" → dining
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("food"), categoryId = diningId, weight = 90),
        )
        // User correction says "whole foods" → groceries
        engine.recordCorrection("Whole Foods", groceryId)

        val suggestion = engine.suggest("Whole Foods")
        assertNotNull(suggestion)
        assertEquals(groceryId, suggestion.categoryId)
        assertEquals(CategorizationStrategy.USER_CORRECTION, suggestion.strategy)
        assertEquals(Confidence.HIGH, suggestion.confidence)
    }

    @Test
    fun suggest_userCorrection_caseInsensitive() {
        val catId = SyncId("cat-1")
        engine.recordCorrection("Starbucks", catId)

        val suggestion = engine.suggest("STARBUCKS")
        assertNotNull(suggestion)
        assertEquals(catId, suggestion.categoryId)
    }

    @Test
    fun recordCorrection_blankPayee_ignored() {
        engine.recordCorrection("", SyncId("cat-1"))
        engine.recordCorrection("   ", SyncId("cat-1"))
        assertEquals(0, engine.getStats().userCorrectionCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Payee frequency learning
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_payeeFrequency_afterLearning() {
        val groceryId = SyncId("cat-groceries")

        // Simulate 4 transactions at "Whole Foods" → groceries
        val transactions = (1..4).map {
            TestFixtures.createExpense(
                categoryId = groceryId,
            ).copy(payee = "Whole Foods")
        }
        engine.learnFromTransactions(transactions)

        val suggestion = engine.suggest("Whole Foods")
        assertNotNull(suggestion)
        assertEquals(groceryId, suggestion.categoryId)
        assertEquals(CategorizationStrategy.PAYEE_FREQUENCY, suggestion.strategy)
        assertEquals(Confidence.HIGH, suggestion.confidence) // 100% ratio, 4 occurrences
    }

    @Test
    fun suggest_payeeFrequency_mediumConfidence() {
        val catA = SyncId("cat-a")
        val catB = SyncId("cat-b")

        // 2 transactions → catA, 1 → catB. Ratio 66%, count 3 → MEDIUM
        val transactions = listOf(
            TestFixtures.createExpense(categoryId = catA).copy(payee = "Store X"),
            TestFixtures.createExpense(categoryId = catA).copy(payee = "Store X"),
            TestFixtures.createExpense(categoryId = catB).copy(payee = "Store X"),
        )
        engine.learnFromTransactions(transactions)

        val suggestion = engine.suggest("Store X")
        assertNotNull(suggestion)
        assertEquals(catA, suggestion.categoryId)
        assertEquals(Confidence.MEDIUM, suggestion.confidence)
    }

    @Test
    fun learnFromTransactions_ignoresTransfers() {
        val catId = SyncId("cat-1")
        val transfer = TestFixtures.createTransaction(
            type = TransactionType.TRANSFER,
            categoryId = catId,
            transferAccountId = SyncId("acc-2"),
        ).copy(payee = "Savings")

        engine.learnFromTransactions(listOf(transfer))
        assertEquals(0, engine.getStats().knownPayeeCount)
    }

    @Test
    fun learnFromTransactions_ignoresDeletedAndNullPayee() {
        val catId = SyncId("cat-1")
        val deleted = TestFixtures.createExpense(categoryId = catId).copy(
            payee = "Deleted Payee",
            deletedAt = TestFixtures.fixedInstant,
        )
        val nullPayee = TestFixtures.createExpense(categoryId = catId).copy(payee = null)

        engine.learnFromTransactions(listOf(deleted, nullPayee))
        assertEquals(0, engine.getStats().knownPayeeCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Amount range rules
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_amountRange_whenNoOtherMatch() {
        val catId = SyncId("cat-groceries")
        engine.addAmountRangeRule(
            AmountRangeRule(
                minCents = Cents(2000), // $20
                maxCents = Cents(15000), // $150
                categoryId = catId,
            ),
        )

        // No payee, amount in range
        val suggestion = engine.suggest(null, Cents(5000))
        assertNotNull(suggestion)
        assertEquals(catId, suggestion.categoryId)
        assertEquals(CategorizationStrategy.AMOUNT_RANGE, suggestion.strategy)
        assertEquals(Confidence.LOW, suggestion.confidence)
    }

    @Test
    fun suggest_amountRange_outOfRange_returnsNull() {
        engine.addAmountRangeRule(
            AmountRangeRule(
                minCents = Cents(2000),
                maxCents = Cents(15000),
                categoryId = SyncId("cat-1"),
            ),
        )

        assertNull(engine.suggest(null, Cents(100))) // too low
        assertNull(engine.suggest(null, Cents(20000))) // too high
    }

    // ═══════════════════════════════════════════════════════════════════
    // Strategy priority ordering
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_priorityOrder_correctionBeatsFrequency() {
        val correctionCat = SyncId("cat-correction")
        val frequencyCat = SyncId("cat-frequency")

        // Learn frequency
        val transactions = (1..5).map {
            TestFixtures.createExpense(categoryId = frequencyCat).copy(payee = "Coffee Shop")
        }
        engine.learnFromTransactions(transactions)

        // Record correction
        engine.recordCorrection("Coffee Shop", correctionCat)

        val suggestion = engine.suggest("Coffee Shop")
        assertNotNull(suggestion)
        assertEquals(correctionCat, suggestion.categoryId)
        assertEquals(CategorizationStrategy.USER_CORRECTION, suggestion.strategy)
    }

    @Test
    fun suggest_priorityOrder_frequencyBeatsKeyword() {
        val keywordCat = SyncId("cat-keyword")
        val frequencyCat = SyncId("cat-frequency")

        engine.addKeywordRule(
            KeywordRule(keywords = listOf("coffee"), categoryId = keywordCat, weight = 90),
        )

        val transactions = (1..5).map {
            TestFixtures.createExpense(categoryId = frequencyCat).copy(payee = "Coffee Shop")
        }
        engine.learnFromTransactions(transactions)

        val suggestion = engine.suggest("Coffee Shop")
        assertNotNull(suggestion)
        assertEquals(frequencyCat, suggestion.categoryId)
        assertEquals(CategorizationStrategy.PAYEE_FREQUENCY, suggestion.strategy)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Batch suggestions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggestBatch_onlyUncategorizedTransactions() {
        val catId = SyncId("cat-coffee")
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("starbucks"), categoryId = catId, weight = 60),
        )

        val categorized = TestFixtures.createExpense(categoryId = SyncId("existing")).copy(
            payee = "Starbucks",
        )
        val uncategorized = TestFixtures.createExpense(categoryId = null).copy(
            payee = "Starbucks",
        )

        val results = engine.suggestBatch(listOf(categorized, uncategorized))
        assertEquals(1, results.size)
        assertTrue(uncategorized.id in results)
        assertEquals(catId, results[uncategorized.id]?.categoryId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Null / blank payee
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_nullPayee_noAmount_returnsNull() {
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("test"), categoryId = SyncId("cat-1"), weight = 50),
        )
        assertNull(engine.suggest(null))
    }

    @Test
    fun suggest_blankPayee_returnsNull() {
        engine.recordCorrection("test", SyncId("cat-1"))
        assertNull(engine.suggest(""))
        assertNull(engine.suggest("   "))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Engine stats
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getStats_reflectsEngineState() {
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("a"), categoryId = SyncId("cat-1"), weight = 50),
        )
        engine.addKeywordRule(
            KeywordRule(keywords = listOf("b"), categoryId = SyncId("cat-2"), weight = 50),
        )
        engine.addAmountRangeRule(
            AmountRangeRule(Cents(100), Cents(500), SyncId("cat-3")),
        )
        engine.recordCorrection("test", SyncId("cat-4"))

        val stats = engine.getStats()
        assertEquals(2, stats.keywordRuleCount)
        assertEquals(1, stats.amountRangeRuleCount)
        assertEquals(1, stats.userCorrectionCount)
        assertEquals(0, stats.knownPayeeCount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun keywordRule_emptyKeywords_throws() {
        assertFailsWith<IllegalArgumentException> {
            KeywordRule(keywords = emptyList(), categoryId = SyncId("cat-1"))
        }
    }

    @Test
    fun keywordRule_blankKeyword_throws() {
        assertFailsWith<IllegalArgumentException> {
            KeywordRule(keywords = listOf("valid", "  "), categoryId = SyncId("cat-1"))
        }
    }

    @Test
    fun keywordRule_weightOutOfRange_throws() {
        assertFailsWith<IllegalArgumentException> {
            KeywordRule(keywords = listOf("test"), categoryId = SyncId("cat-1"), weight = 101)
        }
        assertFailsWith<IllegalArgumentException> {
            KeywordRule(keywords = listOf("test"), categoryId = SyncId("cat-1"), weight = -1)
        }
    }

    @Test
    fun amountRangeRule_invalidRange_throws() {
        assertFailsWith<IllegalArgumentException> {
            AmountRangeRule(minCents = Cents(500), maxCents = Cents(100), categoryId = SyncId("cat-1"))
        }
    }
}
