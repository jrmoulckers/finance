// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.Budget
import com.finance.models.Category
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate

/**
 * Hierarchical (category-group) budget rollup (#3662).
 *
 * `Category` models a tree via [Category.parentId]. A budget defined on a parent
 * category (e.g. "Food") should account for spend categorised against any of its
 * descendants ("Groceries", "Restaurants"). These helpers resolve the descendant
 * set (cycle-safe) and sum spend across the whole group.
 *
 * All money math stays in [Cents]; no floating point is used for spend totals.
 */
object CategoryBudgetRollup {

    /**
     * Resolve the set of category ids in the subtree rooted at [rootId] —
     * including [rootId] itself — following [Category.parentId] links.
     *
     * Guards against cycles in the parent references: each category is visited
     * at most once, so a malformed tree (A→B→A) terminates instead of looping
     * forever. Soft-deleted categories are excluded from the resolved set.
     *
     * @param rootId The budget category whose group is being resolved.
     * @param categories All known categories (any household/order).
     * @return The [rootId] plus every non-deleted descendant id.
     */
    fun resolveCategoryGroup(rootId: SyncId, categories: List<Category>): Set<SyncId> {
        val childrenByParent = HashMap<SyncId, MutableList<SyncId>>()
        for (category in categories) {
            val parent = category.parentId
            if (parent == null || category.deletedAt != null) continue
            childrenByParent.getOrPut(parent) { mutableListOf() }.add(category.id)
        }

        val resolved = LinkedHashSet<SyncId>()
        val stack = ArrayDeque<SyncId>()
        stack.addLast(rootId)
        while (stack.isNotEmpty()) {
            val current = stack.removeLast()
            // `add` returns false when already present → prevents cyclic re-visits.
            if (!resolved.add(current)) continue
            childrenByParent[current]?.forEach { stack.addLast(it) }
        }
        return resolved
    }

    /**
     * Calculate a [BudgetStatus] whose spend rolls up across the budget's
     * category and all of its descendants (#3662).
     *
     * Uses the same currency / date-window / soft-delete / expense-only filters
     * as [BudgetCalculator.calculateStatus], but matches any transaction whose
     * `categoryId` is in the resolved [resolveCategoryGroup] set instead of the
     * single budget category. When the budget category has no children the
     * result is equivalent to [BudgetCalculator.calculateStatus].
     */
    fun calculateGroupStatus(
        budget: Budget,
        categories: List<Category>,
        transactions: List<Transaction>,
        referenceDate: LocalDate,
    ): BudgetStatus {
        val period = BudgetCalculator.getCurrentPeriod(budget.period, budget.startDate, referenceDate)
        val groupIds = resolveCategoryGroup(budget.categoryId, categories)

        val spentAmount = transactions
            .filter { txn ->
                txn.categoryId in groupIds &&
                    txn.currency == budget.currency &&
                    txn.date >= period.start && txn.date <= period.end &&
                    txn.deletedAt == null &&
                    txn.type == TransactionType.EXPENSE
            }
            .sumOf { it.amount.abs().amount }

        val spent = Cents(spentAmount)
        val remaining = budget.amount - spent
        val utilization = if (budget.amount.amount > 0) {
            (spent.amount.toDouble() / budget.amount.amount).coerceIn(0.0, Double.MAX_VALUE)
        } else 0.0

        return BudgetStatus(
            budget = budget,
            period = period,
            spent = spent,
            remaining = remaining,
            utilization = utilization,
            isOverBudget = spent.amount > budget.amount.amount,
            isWithinBudgetDates = BudgetCalculator.isActiveOn(budget, referenceDate),
        )
    }
}
