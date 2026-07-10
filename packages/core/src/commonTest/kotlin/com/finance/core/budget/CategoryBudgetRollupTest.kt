// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.Category
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Tests for #3662 — hierarchical / category-group budget rollup.
 */
class CategoryBudgetRollupTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    private val food = SyncId("cat-food")
    private val groceries = SyncId("cat-groceries")
    private val restaurants = SyncId("cat-restaurants")
    private val fastFood = SyncId("cat-fastfood")
    private val rent = SyncId("cat-rent")

    private fun tree(): List<Category> = listOf(
        TestFixtures.createCategory(id = food, name = "Food"),
        TestFixtures.createCategory(id = groceries, name = "Groceries", parentId = food),
        TestFixtures.createCategory(id = restaurants, name = "Restaurants", parentId = food),
        TestFixtures.createCategory(id = fastFood, name = "Fast Food", parentId = restaurants),
        TestFixtures.createCategory(id = rent, name = "Rent"),
    )

    // ── resolveCategoryGroup ───────────────────────────────────────────

    @Test
    fun resolve_singleLevel() {
        val group = CategoryBudgetRollup.resolveCategoryGroup(restaurants, tree())
        assertEquals(setOf(restaurants, fastFood), group)
    }

    @Test
    fun resolve_multiLevel_includesAllDescendantsAndRoot() {
        val group = CategoryBudgetRollup.resolveCategoryGroup(food, tree())
        assertEquals(setOf(food, groceries, restaurants, fastFood), group)
    }

    @Test
    fun resolve_leaf_returnsOnlyItself() {
        val group = CategoryBudgetRollup.resolveCategoryGroup(rent, tree())
        assertEquals(setOf(rent), group)
    }

    @Test
    fun resolve_cyclicParents_terminatesSafely() {
        // A → B → A cycle plus a self-loop C → C.
        val a = SyncId("A")
        val b = SyncId("B")
        val c = SyncId("C")
        val cyclic = listOf(
            TestFixtures.createCategory(id = a, name = "A", parentId = b),
            TestFixtures.createCategory(id = b, name = "B", parentId = a),
            TestFixtures.createCategory(id = c, name = "C", parentId = c),
        )
        val group = CategoryBudgetRollup.resolveCategoryGroup(a, cyclic)
        // Must include A and its descendant B, and must not loop forever.
        assertTrue(a in group)
        assertTrue(b in group)
    }

    // ── calculateGroupStatus ───────────────────────────────────────────

    @Test
    fun groupStatus_rollsUpSpendFromDescendants() {
        val budget = TestFixtures.createBudget(
            categoryId = food,
            amount = Cents(50000),
            startDate = LocalDate(2024, 6, 1),
        )
        val txns = listOf(
            TestFixtures.createExpense(amount = Cents(10000), date = LocalDate(2024, 6, 5), categoryId = groceries),
            TestFixtures.createExpense(amount = Cents(6000), date = LocalDate(2024, 6, 8), categoryId = restaurants),
            TestFixtures.createExpense(amount = Cents(4000), date = LocalDate(2024, 6, 9), categoryId = fastFood),
            TestFixtures.createExpense(amount = Cents(3000), date = LocalDate(2024, 6, 10), categoryId = food),
            // Unrelated category → excluded
            TestFixtures.createExpense(amount = Cents(9999), date = LocalDate(2024, 6, 11), categoryId = rent),
        )

        val status = CategoryBudgetRollup.calculateGroupStatus(budget, tree(), txns, LocalDate(2024, 6, 15))
        assertEquals(Cents(23000), status.spent, "groceries + restaurants + fastfood + food")
        assertEquals(Cents(27000), status.remaining)
    }

    @Test
    fun groupStatus_noChildren_matchesPlainStatus() {
        val budget = TestFixtures.createBudget(
            categoryId = rent,
            amount = Cents(50000),
            startDate = LocalDate(2024, 6, 1),
        )
        val txns = listOf(
            TestFixtures.createExpense(amount = Cents(12000), date = LocalDate(2024, 6, 5), categoryId = rent),
        )
        val group = CategoryBudgetRollup.calculateGroupStatus(budget, tree(), txns, LocalDate(2024, 6, 15))
        val plain = BudgetCalculator.calculateStatus(budget, txns, LocalDate(2024, 6, 15))
        assertEquals(plain.spent, group.spent)
    }
}
