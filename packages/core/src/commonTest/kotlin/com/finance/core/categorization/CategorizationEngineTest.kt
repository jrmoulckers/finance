// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.categorization

import com.finance.models.types.SyncId
import kotlin.test.*

class CategorizationEngineTest {

    // ═══════════════════════════════════════════════════════════════════
    // Exact match
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_exactMatch() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")
        engine.addRule(CategorizationRule("Whole Foods", groceryId, RuleType.EXACT))

        assertEquals(groceryId, engine.suggest("Whole Foods"))
    }

    @Test
    fun suggest_exactMatch_caseInsensitive() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")
        engine.addRule(CategorizationRule("Whole Foods", groceryId, RuleType.EXACT))

        assertEquals(groceryId, engine.suggest("whole foods"))
        assertEquals(groceryId, engine.suggest("WHOLE FOODS"))
        assertEquals(groceryId, engine.suggest("Whole foods"))
    }

    @Test
    fun suggest_exactMatch_noPartialMatch() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")
        engine.addRule(CategorizationRule("Whole Foods", groceryId, RuleType.EXACT))

        assertNull(engine.suggest("Whole Foods Market"))
        assertNull(engine.suggest("Whole"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Contains match
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_containsMatch() {
        val engine = CategorizationEngine()
        val diningId = SyncId("cat-dining")
        engine.addRule(CategorizationRule("Pizza", diningId, RuleType.CONTAINS))

        assertEquals(diningId, engine.suggest("Domino's Pizza"))
        assertEquals(diningId, engine.suggest("Pizza Hut"))
        assertEquals(diningId, engine.suggest("Best Pizza Place"))
    }

    @Test
    fun suggest_containsMatch_caseInsensitive() {
        val engine = CategorizationEngine()
        val diningId = SyncId("cat-dining")
        engine.addRule(CategorizationRule("coffee", diningId, RuleType.CONTAINS))

        assertEquals(diningId, engine.suggest("Starbucks COFFEE"))
        assertEquals(diningId, engine.suggest("The Coffee Shop"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Starts with match
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_startsWithMatch() {
        val engine = CategorizationEngine()
        val transportId = SyncId("cat-transport")
        engine.addRule(CategorizationRule("UBER", transportId, RuleType.STARTS_WITH))

        assertEquals(transportId, engine.suggest("UBER EATS"))
        assertEquals(transportId, engine.suggest("UBER TRIP"))
        assertEquals(transportId, engine.suggest("Uber"))
    }

    @Test
    fun suggest_startsWithMatch_doesNotMatchMiddle() {
        val engine = CategorizationEngine()
        val transportId = SyncId("cat-transport")
        engine.addRule(CategorizationRule("UBER", transportId, RuleType.STARTS_WITH))

        assertNull(engine.suggest("My UBER trip"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Priority ordering
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_higherPriorityWins() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")
        val diningId = SyncId("cat-dining")

        // Low-priority: any payee containing "food" -> dining
        engine.addRule(CategorizationRule("food", diningId, RuleType.CONTAINS, priority = 1))
        // High-priority: exact "Whole Foods" -> groceries
        engine.addRule(CategorizationRule("Whole Foods", groceryId, RuleType.EXACT, priority = 10))

        // "Whole Foods" matches both rules, but higher priority wins
        assertEquals(groceryId, engine.suggest("Whole Foods"))
        // "Fast Food Place" only matches the contains rule
        assertEquals(diningId, engine.suggest("Fast Food Place"))
    }

    @Test
    fun suggest_rulesAddedInAnyOrder_priorityStillWins() {
        val engine = CategorizationEngine()
        val catA = SyncId("cat-a")
        val catB = SyncId("cat-b")
        val catC = SyncId("cat-c")

        // Add in random order
        engine.addRule(CategorizationRule("test", catA, RuleType.CONTAINS, priority = 5))
        engine.addRule(CategorizationRule("test", catC, RuleType.CONTAINS, priority = 1))
        engine.addRule(CategorizationRule("test", catB, RuleType.CONTAINS, priority = 10))

        assertEquals(catB, engine.suggest("test"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // No match
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_noMatch_returnsNull() {
        val engine = CategorizationEngine()
        engine.addRule(CategorizationRule("Starbucks", SyncId("cat-coffee"), RuleType.EXACT))

        assertNull(engine.suggest("Target"))
    }

    @Test
    fun suggest_noRules_returnsNull() {
        val engine = CategorizationEngine()
        assertNull(engine.suggest("Anything"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Null/blank payee
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun suggest_nullPayee_returnsNull() {
        val engine = CategorizationEngine()
        engine.addRule(CategorizationRule("test", SyncId("cat-1"), RuleType.CONTAINS))
        assertNull(engine.suggest(null))
    }

    @Test
    fun suggest_blankPayee_returnsNull() {
        val engine = CategorizationEngine()
        engine.addRule(CategorizationRule("test", SyncId("cat-1"), RuleType.CONTAINS))
        assertNull(engine.suggest(""))
        assertNull(engine.suggest("   "))
    }

    // ═══════════════════════════════════════════════════════════════════
    // learnFromHistory()
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun learnFromHistory_createsExactRule() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")

        engine.learnFromHistory("Whole Foods", groceryId)

        assertEquals(groceryId, engine.suggest("Whole Foods"))
        assertEquals(groceryId, engine.suggest("whole foods")) // case insensitive
    }

    @Test
    fun learnFromHistory_updatesExistingRuleForSamePayee() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")
        val diningId = SyncId("cat-dining")

        engine.learnFromHistory("Whole Foods", groceryId)
        assertEquals(groceryId, engine.suggest("Whole Foods"))

        // User recategorizes — should update
        engine.learnFromHistory("Whole Foods", diningId)
        assertEquals(diningId, engine.suggest("Whole Foods"))
    }

    @Test
    fun learnFromHistory_doesNotAffectOtherPayees() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")
        val diningId = SyncId("cat-dining")

        engine.learnFromHistory("Whole Foods", groceryId)
        engine.learnFromHistory("Chipotle", diningId)

        assertEquals(groceryId, engine.suggest("Whole Foods"))
        assertEquals(diningId, engine.suggest("Chipotle"))
    }

    @Test
    fun learnFromHistory_coexistsWithManualRules() {
        val engine = CategorizationEngine()
        val diningId = SyncId("cat-dining")
        val coffeeId = SyncId("cat-coffee")

        // Manual CONTAINS rule
        engine.addRule(CategorizationRule("coffee", diningId, RuleType.CONTAINS, priority = 1))

        // Learned exact rule with higher default priority (10)
        engine.learnFromHistory("Starbucks Coffee", coffeeId)

        // Exact match wins due to higher priority
        assertEquals(coffeeId, engine.suggest("Starbucks Coffee"))
        // Non-exact still matches contains rule
        assertEquals(diningId, engine.suggest("Local Coffee House"))
    }

    @Test
    fun learnFromHistory_caseInsensitiveRemoval() {
        val engine = CategorizationEngine()
        val catA = SyncId("cat-a")
        val catB = SyncId("cat-b")

        engine.learnFromHistory("Starbucks", catA)
        // Learning again with different case should replace
        engine.learnFromHistory("STARBUCKS", catB)

        assertEquals(catB, engine.suggest("Starbucks"))
    }
}
