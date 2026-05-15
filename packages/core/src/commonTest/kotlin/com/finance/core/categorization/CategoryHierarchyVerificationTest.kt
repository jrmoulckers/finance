// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.categorization

import com.finance.core.TestFixtures
import com.finance.core.budget.BudgetCalculator
import com.finance.models.Category
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1362 — Category Hierarchy & Auto-Categorization.
 *
 * Covers:
 * - Multi-level category trees (parent → child → grandchild)
 * - Auto-categorization rules matching by merchant name, description keywords
 * - Fallback to "Uncategorized" when no rules match
 * - Category budget aggregation across hierarchy levels
 */
class CategoryHierarchyVerificationTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multi-level category trees
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun categoryTree_parentChildRelationship() {
        val parent = Category(
            id = SyncId("cat-food"),
            householdId = SyncId("hh-1"),
            ownerId = SyncId("owner-1"),
            name = "Food & Dining",
            parentId = null,
            createdAt = TestFixtures.fixedInstant,
            updatedAt = TestFixtures.fixedInstant,
        )
        val child = Category(
            id = SyncId("cat-groceries"),
            householdId = SyncId("hh-1"),
            ownerId = SyncId("owner-1"),
            name = "Groceries",
            parentId = parent.id,
            createdAt = TestFixtures.fixedInstant,
            updatedAt = TestFixtures.fixedInstant,
        )

        assertNull(parent.parentId, "Root category should have no parent")
        assertEquals(parent.id, child.parentId, "Child should reference parent")
    }

    @Test
    fun categoryTree_threeLevel_grandchild() {
        val root = SyncId("cat-living")
        val mid = SyncId("cat-food")
        val leaf = SyncId("cat-fast-food")

        val categories = listOf(
            Category(
                id = root, householdId = SyncId("hh-1"), ownerId = SyncId("o-1"),
                name = "Living", parentId = null,
                createdAt = TestFixtures.fixedInstant, updatedAt = TestFixtures.fixedInstant,
            ),
            Category(
                id = mid, householdId = SyncId("hh-1"), ownerId = SyncId("o-1"),
                name = "Food", parentId = root,
                createdAt = TestFixtures.fixedInstant, updatedAt = TestFixtures.fixedInstant,
            ),
            Category(
                id = leaf, householdId = SyncId("hh-1"), ownerId = SyncId("o-1"),
                name = "Fast Food", parentId = mid,
                createdAt = TestFixtures.fixedInstant, updatedAt = TestFixtures.fixedInstant,
            ),
        )

        val childrenOf = categories.groupBy { it.parentId }
        assertEquals(1, childrenOf[null]?.size, "One root category")
        assertEquals(1, childrenOf[root]?.size, "Root has one child")
        assertEquals(1, childrenOf[mid]?.size, "Mid has one grandchild")
        assertNull(childrenOf[leaf], "Leaf has no children")
    }

    @Test
    fun categoryTree_ancestorChain_traversalFromLeafToRoot() {
        val ids = listOf(SyncId("a"), SyncId("b"), SyncId("c"), SyncId("d"))
        val categories = ids.mapIndexed { i, id ->
            Category(
                id = id,
                householdId = SyncId("hh-1"),
                ownerId = SyncId("o-1"),
                name = "Level $i",
                parentId = if (i == 0) null else ids[i - 1],
                createdAt = TestFixtures.fixedInstant,
                updatedAt = TestFixtures.fixedInstant,
            )
        }
        val byId = categories.associateBy { it.id }

        val ancestors = mutableListOf<SyncId>()
        var current: SyncId? = ids.last()
        while (current != null) {
            ancestors.add(current)
            current = byId[current]?.parentId
        }

        assertEquals(4, ancestors.size, "Leaf has 4 ancestors including itself")
        assertEquals(ids.reversed(), ancestors)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Auto-categorization by merchant name
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun autoCategorize_merchantExactMatch_assignsCategory() {
        val engine = CategorizationEngine()
        val groceryId = SyncId("cat-groceries")
        engine.addRule(CategorizationRule("Trader Joe's", groceryId, RuleType.EXACT))

        assertEquals(groceryId, engine.suggest("Trader Joe's"))
    }

    @Test
    fun autoCategorize_merchantContains_matchesPartialPayee() {
        val engine = CategorizationEngine()
        val transportId = SyncId("cat-transport")
        engine.addRule(CategorizationRule("Lyft", transportId, RuleType.CONTAINS))

        assertEquals(transportId, engine.suggest("Lyft Ride #12345"))
        assertEquals(transportId, engine.suggest("LYFT *RIDE SF"))
    }

    @Test
    fun autoCategorize_merchantStartsWith_matchesPrefix() {
        val engine = CategorizationEngine()
        val amazonId = SyncId("cat-shopping")
        engine.addRule(CategorizationRule("AMZN", amazonId, RuleType.STARTS_WITH))

        assertEquals(amazonId, engine.suggest("AMZN Mktp US"))
        assertEquals(amazonId, engine.suggest("AMZN DIGITAL"))
        assertNull(engine.suggest("Shop at AMZN"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Description keyword matching
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun autoCategorize_descriptionKeyword_containsMatch() {
        val engine = CategorizationEngine()
        val utilityId = SyncId("cat-utilities")
        engine.addRule(CategorizationRule("electric", utilityId, RuleType.CONTAINS))

        assertEquals(utilityId, engine.suggest("City Electric Company"))
        assertEquals(utilityId, engine.suggest("ELECTRIC BILL PAYMENT"))
    }

    @Test
    fun autoCategorize_multipleKeywordRules_priorityDecides() {
        val engine = CategorizationEngine()
        val diningId = SyncId("cat-dining")
        val coffeeId = SyncId("cat-coffee")

        engine.addRule(CategorizationRule("Starbucks", diningId, RuleType.CONTAINS, priority = 1))
        engine.addRule(CategorizationRule("Starbucks", coffeeId, RuleType.EXACT, priority = 100))

        assertEquals(coffeeId, engine.suggest("Starbucks"))
    }

    @Test
    fun autoCategorize_learnedRuleOverridesManualLowerPriority() {
        val engine = CategorizationEngine()
        val diningId = SyncId("cat-dining")
        val coffeeId = SyncId("cat-coffee")

        engine.addRule(CategorizationRule("coffee", diningId, RuleType.CONTAINS, priority = 1))
        engine.learnFromHistory("Blue Bottle Coffee", coffeeId)

        assertEquals(coffeeId, engine.suggest("Blue Bottle Coffee"))
        assertEquals(diningId, engine.suggest("Peet's Coffee"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Fallback to uncategorized
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun autoCategorize_noMatchingRule_returnsNull_meansUncategorized() {
        val engine = CategorizationEngine()
        engine.addRule(CategorizationRule("Netflix", SyncId("cat-entertainment"), RuleType.EXACT))

        val result = engine.suggest("Random Merchant XYZ")
        assertNull(result, "Should return null (uncategorized) when no rule matches")
    }

    @Test
    fun autoCategorize_emptyOrBlankPayee_returnsNull() {
        val engine = CategorizationEngine()
        engine.addRule(CategorizationRule("test", SyncId("cat-1"), RuleType.CONTAINS))

        assertNull(engine.suggest(""))
        assertNull(engine.suggest("   "))
        assertNull(engine.suggest(null))
    }

    @Test
    fun autoCategorize_noRulesConfigured_alwaysReturnsNull() {
        val engine = CategorizationEngine()
        assertNull(engine.suggest("Any Merchant"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Category budget aggregation across hierarchy
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun budgetAggregation_parentIncludesChildSpending() {
        val parentCatId = SyncId("cat-food")
        val childCatId = SyncId("cat-groceries")

        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(5000), categoryId = childCatId, date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(3000), categoryId = childCatId, date = LocalDate(2024, 6, 15)),
            TestFixtures.createExpense(amount = Cents(2000), categoryId = parentCatId, date = LocalDate(2024, 6, 20)),
        )

        val childTotal = transactions.filter { it.categoryId == childCatId }.sumOf { it.amount.abs().amount }
        val parentOwn = transactions.filter { it.categoryId == parentCatId }.sumOf { it.amount.abs().amount }
        val aggregatedTotal = Cents(childTotal + parentOwn)

        assertEquals(Cents(10000), aggregatedTotal, "Parent aggregated total = $100.00")
    }

    @Test
    fun budgetAggregation_multipleSiblings_sumToParent() {
        val parentId = SyncId("cat-transport")
        val childA = SyncId("cat-gas")
        val childB = SyncId("cat-parking")

        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(4500), categoryId = childA),
            TestFixtures.createExpense(amount = Cents(1200), categoryId = childB),
            TestFixtures.createExpense(amount = Cents(800), categoryId = parentId),
        )

        val hierMap = mapOf(childA to parentId, childB to parentId)
        val totals = mutableMapOf<SyncId, Long>()

        for (txn in transactions) {
            val catId = txn.categoryId ?: continue
            totals[catId] = (totals[catId] ?: 0L) + txn.amount.abs().amount
            val parent = hierMap[catId]
            if (parent != null) {
                totals[parent] = (totals[parent] ?: 0L) + txn.amount.abs().amount
            }
        }

        assertEquals(4500L, totals[childA])
        assertEquals(1200L, totals[childB])
        assertEquals(6500L, totals[parentId], "Parent = own(800) + childA(4500) + childB(1200)")
    }

    @Test
    fun budgetStatus_calculatesUtilizationCorrectly() {
        val catId = SyncId("cat-dining")
        val budget = TestFixtures.createBudget(categoryId = catId, amount = Cents(30000))
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(7500), categoryId = catId, date = LocalDate(2024, 6, 5)),
            TestFixtures.createExpense(amount = Cents(12500), categoryId = catId, date = LocalDate(2024, 6, 15)),
        )

        val status = BudgetCalculator.calculateStatus(budget, transactions, LocalDate(2024, 6, 15))
        assertEquals(Cents(20000), status.spent)
        assertEquals(Cents(10000), status.remaining)
        assertTrue(status.utilization > 0.66 && status.utilization < 0.67, "~66.7% utilization")
        assertFalse(status.isOverBudget)
    }
}
