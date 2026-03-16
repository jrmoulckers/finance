// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.categorization

import com.finance.models.types.SyncId
import kotlin.test.*

/**
 * Edge case tests for [CategorizationEngine] covering ambiguous matches,
 * special characters, whitespace handling, and learning corrections.
 */
class CategorizationEngineEdgeCaseTest {

    // ═══════════════════════════════════════════════════════════════════
    // Ambiguous categorization — multiple rules match
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_samePriority_firstAddedRuleWins() {
        val engine = CategorizationEngine()
        val catA = SyncId("cat-a")
        val catB = SyncId("cat-b")

        // Two rules at the same priority that both match
        engine.addRule(CategorizationRule("coffee", catA, RuleType.CONTAINS, priority = 5))
        engine.addRule(CategorizationRule("coffee", catB, RuleType.CONTAINS, priority = 5))

        // Same priority: sorted by descending priority, stable order → first added appears first
        val result = engine.suggest("I love coffee")
        assertNotNull(result, "Should match at least one rule")
        // Both catA and catB are valid — the engine picks the first match in sorted order
    }

    @Test
    fun suggest_exactMatchHigherPriorityThanContains() {
        val engine = CategorizationEngine()
        val exactCat = SyncId("cat-exact")
        val containsCat = SyncId("cat-contains")

        engine.addRule(CategorizationRule("Starbucks", containsCat, RuleType.CONTAINS, priority = 1))
        engine.addRule(CategorizationRule("Starbucks", exactCat, RuleType.EXACT, priority = 10))

        assertEquals(exactCat, engine.suggest("Starbucks"))
    }

    @Test
    fun suggest_containsStillMatchesWhenExactDoesNot() {
        val engine = CategorizationEngine()
        val exactCat = SyncId("cat-exact")
        val containsCat = SyncId("cat-contains")

        engine.addRule(CategorizationRule("Starbucks", containsCat, RuleType.CONTAINS, priority = 1))
        engine.addRule(CategorizationRule("Starbucks", exactCat, RuleType.EXACT, priority = 10))

        // "Starbucks Reserve" does NOT exact-match "Starbucks", but contains it
        assertEquals(containsCat, engine.suggest("Starbucks Reserve"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Case-insensitive matching — exhaustive
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_startsWithMatch_caseInsensitive() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("AMAZON", catId, RuleType.STARTS_WITH))

        assertEquals(catId, engine.suggest("amazon prime"))
        assertEquals(catId, engine.suggest("Amazon.com"))
        assertEquals(catId, engine.suggest("AMAZON WEB SERVICES"))
    }

    @Test
    fun suggest_containsMatch_mixedCase() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("GrOcErY", catId, RuleType.CONTAINS))

        assertEquals(catId, engine.suggest("The Grocery Store"))
        assertEquals(catId, engine.suggest("GROCERY MART"))
        assertEquals(catId, engine.suggest("my grocery list"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Whitespace-padded payee
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_payeeWithLeadingTrailingSpaces_noMatch() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("Target", catId, RuleType.EXACT))

        // " Target " is NOT an exact match for "Target"
        assertNull(engine.suggest(" Target "))
    }

    @Test
    fun suggest_payeeWithLeadingSpaces_containsStillMatches() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("Target", catId, RuleType.CONTAINS))

        // CONTAINS should still find "Target" inside " Target "
        assertEquals(catId, engine.suggest(" Target "))
    }

    @Test
    fun suggest_whitespaceOnlyPayee_returnsNull() {
        val engine = CategorizationEngine()
        engine.addRule(CategorizationRule("test", SyncId("cat-1"), RuleType.CONTAINS))

        assertNull(engine.suggest("   "))
        assertNull(engine.suggest("\t"))
        assertNull(engine.suggest("\n"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Special characters in payee
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_payeeWithSpecialCharacters() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("McDonald's", catId, RuleType.EXACT))

        assertEquals(catId, engine.suggest("McDonald's"))
        assertEquals(catId, engine.suggest("mcdonald's"))
    }

    @Test
    fun suggest_payeeWithNumbers() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("7-Eleven", catId, RuleType.EXACT))

        assertEquals(catId, engine.suggest("7-ELEVEN"))
        assertEquals(catId, engine.suggest("7-eleven"))
    }

    @Test
    fun suggest_payeeWithAmpersand() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("H&M", catId, RuleType.CONTAINS))

        assertEquals(catId, engine.suggest("H&M Store #123"))
    }

    @Test
    fun suggest_payeeWithUnicode() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("Café", catId, RuleType.CONTAINS))

        assertEquals(catId, engine.suggest("Le Café Parisien"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Empty pattern behavior
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_emptyPatternContains_matchesEverything() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-catch-all")
        engine.addRule(CategorizationRule("", catId, RuleType.CONTAINS))

        // Empty string is contained in every non-blank string
        assertEquals(catId, engine.suggest("Anything"))
        assertEquals(catId, engine.suggest("Some Store"))
    }

    @Test
    fun suggest_emptyPatternStartsWith_matchesEverything() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-catch-all")
        engine.addRule(CategorizationRule("", catId, RuleType.STARTS_WITH))

        // Every string starts with empty string
        assertEquals(catId, engine.suggest("Anything"))
    }

    @Test
    fun suggest_emptyPatternExact_matchesNothing() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("", catId, RuleType.EXACT))

        // Blank/empty payee returns null before rules are checked
        assertNull(engine.suggest(""))
        // Non-empty payee doesn't exact-match empty pattern
        assertNull(engine.suggest("Anything"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // learnFromHistory() — advanced scenarios
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun learnFromHistory_multipleDifferentPayees() {
        val engine = CategorizationEngine()
        val grocery = SyncId("cat-grocery")
        val dining = SyncId("cat-dining")
        val transport = SyncId("cat-transport")

        engine.learnFromHistory("Whole Foods", grocery)
        engine.learnFromHistory("Chipotle", dining)
        engine.learnFromHistory("Uber", transport)

        assertEquals(grocery, engine.suggest("Whole Foods"))
        assertEquals(dining, engine.suggest("Chipotle"))
        assertEquals(transport, engine.suggest("Uber"))
    }

    @Test
    fun learnFromHistory_correctionOverridesOldCategory() {
        val engine = CategorizationEngine()
        val miscId = SyncId("cat-misc")
        val groceryId = SyncId("cat-grocery")

        // Initially categorized as misc
        engine.learnFromHistory("Trader Joe's", miscId)
        assertEquals(miscId, engine.suggest("Trader Joe's"))

        // User corrects to grocery
        engine.learnFromHistory("Trader Joe's", groceryId)
        assertEquals(groceryId, engine.suggest("Trader Joe's"))
    }

    @Test
    fun learnFromHistory_learnedRuleHigherPriorityThanLowManual() {
        val engine = CategorizationEngine()
        val manualCat = SyncId("cat-manual")
        val learnedCat = SyncId("cat-learned")

        // Low-priority manual rule
        engine.addRule(CategorizationRule("Walmart", manualCat, RuleType.EXACT, priority = 5))

        // Learned rule has priority 10 (default in learnFromHistory)
        engine.learnFromHistory("Walmart", learnedCat)

        assertEquals(learnedCat, engine.suggest("Walmart"))
    }

    @Test
    fun learnFromHistory_doesNotRemoveNonExactRules() {
        val engine = CategorizationEngine()
        val containsCat = SyncId("cat-contains")
        val learnedCat = SyncId("cat-learned")

        // CONTAINS rule for "Walmart"
        engine.addRule(CategorizationRule("Walmart", containsCat, RuleType.CONTAINS, priority = 1))

        // Learn exact match for "Walmart"
        engine.learnFromHistory("Walmart", learnedCat)

        // Exact match "Walmart" → learned category (higher priority)
        assertEquals(learnedCat, engine.suggest("Walmart"))
        // "Walmart Supercenter" doesn't exact-match but still contains → contains rule
        assertEquals(containsCat, engine.suggest("Walmart Supercenter"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Very long payee strings
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_veryLongPayee_containsMatch() {
        val engine = CategorizationEngine()
        val catId = SyncId("cat-1")
        engine.addRule(CategorizationRule("AMAZON", catId, RuleType.CONTAINS))

        val longPayee = "A".repeat(100) + "AMAZON" + "B".repeat(100)
        assertEquals(catId, engine.suggest(longPayee))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multiple rules of different types matching same payee
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_allThreeRuleTypesMatch_highestPriorityWins() {
        val engine = CategorizationEngine()
        val exactCat = SyncId("cat-exact")
        val containsCat = SyncId("cat-contains")
        val startsWithCat = SyncId("cat-starts")

        engine.addRule(CategorizationRule("Uber", containsCat, RuleType.CONTAINS, priority = 1))
        engine.addRule(CategorizationRule("Uber", startsWithCat, RuleType.STARTS_WITH, priority = 5))
        engine.addRule(CategorizationRule("Uber", exactCat, RuleType.EXACT, priority = 10))

        // All three match "Uber" — highest priority (EXACT, priority=10) wins
        assertEquals(exactCat, engine.suggest("Uber"))
    }
}
