// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.money.MoneyOperations
import com.finance.models.types.Cents

/**
 * A single named allocation within a [BudgetTemplate] (#3684).
 *
 * @property name Human-readable name for the allocation (e.g. "Needs").
 * @property ratio Relative weight used to split income across allocations.
 *   Must be positive. Absolute percentages are expressed as weights too
 *   (e.g. 50/30/20).
 */
data class BudgetAllocation(
    val name: String,
    val ratio: Int,
) {
    init {
        require(name.isNotBlank()) { "Allocation name cannot be blank" }
        require(ratio > 0) { "Allocation ratio must be positive, was $ratio" }
    }
}

/**
 * A proposed budget amount produced by applying a [BudgetTemplate] to an income
 * figure (#3684).
 *
 * @property name The allocation name this amount corresponds to.
 * @property amount The proposed budget amount in [Cents].
 */
data class BudgetProposal(
    val name: String,
    val amount: Cents,
)

/**
 * A reusable budget template describing how to split an income figure into named
 * allocations by ratio (#3684).
 *
 * Applying a template ([applyTemplate]) uses [MoneyOperations.allocateByRatio],
 * so the proposed amounts always sum **exactly** to the input income — no cents
 * are lost or created, and any indivisible remainder is distributed
 * deterministically to the largest-weight allocations first.
 *
 * @property name Template name (e.g. "50/30/20").
 * @property allocations Ordered allocations; must be non-empty.
 */
data class BudgetTemplate(
    val name: String,
    val allocations: List<BudgetAllocation>,
) {
    init {
        require(name.isNotBlank()) { "Template name cannot be blank" }
        require(allocations.isNotEmpty()) { "Template must have at least one allocation" }
    }

    /**
     * Split [income] across this template's [allocations] by ratio.
     *
     * @param income The income to allocate; must be positive.
     * @return One [BudgetProposal] per allocation, in the same order as
     *   [allocations]. The proposed [BudgetProposal.amount]s sum exactly to
     *   [income].
     * @throws IllegalArgumentException if [income] is not positive.
     */
    fun applyTemplate(income: Cents): List<BudgetProposal> {
        require(income.isPositive()) { "Income must be positive to apply a template, was ${income.amount}" }
        val amounts = MoneyOperations.allocateByRatio(income, allocations.map { it.ratio })
        return allocations.mapIndexed { index, allocation ->
            BudgetProposal(name = allocation.name, amount = amounts[index])
        }
    }

    companion object {
        /**
         * The classic 50/30/20 rule: 50% needs, 30% wants, 20% savings/debt.
         */
        val FIFTY_THIRTY_TWENTY = BudgetTemplate(
            name = "50/30/20",
            allocations = listOf(
                BudgetAllocation(name = "Needs", ratio = 50),
                BudgetAllocation(name = "Wants", ratio = 30),
                BudgetAllocation(name = "Savings", ratio = 20),
            ),
        )

        /**
         * Build a **zero-based** template from explicit named weights, where every
         * dollar of income is assigned to a category (the allocations sum to the
         * whole income by construction). Order is preserved.
         *
         * @param allocations Ordered (name, weight) pairs; must be non-empty and
         *   every weight must be positive.
         * @param name Optional template name.
         * @throws IllegalArgumentException if [allocations] is empty.
         */
        fun zeroBased(
            allocations: List<Pair<String, Int>>,
            name: String = "Zero-based",
        ): BudgetTemplate {
            require(allocations.isNotEmpty()) { "Zero-based template needs at least one allocation" }
            return BudgetTemplate(
                name = name,
                allocations = allocations.map { (label, weight) -> BudgetAllocation(label, weight) },
            )
        }
    }
}
