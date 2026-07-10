// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * Tests for #3684 — budget templates (50/30/20, zero-based).
 */
class BudgetTemplateTest {

    @Test
    fun fiftyThirtyTwenty_divisibleIncome_exactSplit() {
        val proposals = BudgetTemplate.FIFTY_THIRTY_TWENTY.applyTemplate(Cents(1_000_000)) // $10,000
        assertEquals(3, proposals.size)
        assertEquals(Cents(500_000), proposals[0].amount) // Needs 50%
        assertEquals(Cents(300_000), proposals[1].amount) // Wants 30%
        assertEquals(Cents(200_000), proposals[2].amount) // Savings 20%
        assertEquals(listOf("Needs", "Wants", "Savings"), proposals.map { it.name })
    }

    @Test
    fun applyTemplate_allocationsSumExactlyToIncome() {
        // Non-divisible income exercises remainder distribution.
        val income = Cents(100_001)
        val proposals = BudgetTemplate.FIFTY_THIRTY_TWENTY.applyTemplate(income)
        val total = proposals.fold(Cents.ZERO) { acc, p -> acc + p.amount }
        assertEquals(income, total, "no cents lost or created")
    }

    @Test
    fun fiftyThirtyTwenty_nonDivisible_remainderIsDeterministic() {
        // income = 101 cents; 50/30/20 → 50/30/20 base = 50,30,20 (sum 100),
        // remainder 1 goes to the largest ratio (Needs).
        val proposals = BudgetTemplate.FIFTY_THIRTY_TWENTY.applyTemplate(Cents(101))
        assertEquals(Cents(51), proposals[0].amount)
        assertEquals(Cents(30), proposals[1].amount)
        assertEquals(Cents(20), proposals[2].amount)
        assertEquals(Cents(101), proposals.fold(Cents.ZERO) { a, p -> a + p.amount })
    }

    @Test
    fun zeroBased_customAllocations_sumExactly() {
        val template = BudgetTemplate.zeroBased(
            listOf("Rent" to 40, "Food" to 20, "Transport" to 15, "Fun" to 10, "Savings" to 15),
        )
        val income = Cents(333_333)
        val proposals = template.applyTemplate(income)
        assertEquals(5, proposals.size)
        assertEquals(income, proposals.fold(Cents.ZERO) { a, p -> a + p.amount })
    }

    @Test
    fun applyTemplate_nonPositiveIncome_rejected() {
        assertFailsWith<IllegalArgumentException> {
            BudgetTemplate.FIFTY_THIRTY_TWENTY.applyTemplate(Cents.ZERO)
        }
        assertFailsWith<IllegalArgumentException> {
            BudgetTemplate.FIFTY_THIRTY_TWENTY.applyTemplate(Cents(-100))
        }
    }

    @Test
    fun template_validation() {
        assertFailsWith<IllegalArgumentException> { BudgetTemplate(name = "", allocations = listOf(BudgetAllocation("A", 1))) }
        assertFailsWith<IllegalArgumentException> { BudgetTemplate(name = "x", allocations = emptyList()) }
        assertFailsWith<IllegalArgumentException> { BudgetAllocation(name = "A", ratio = 0) }
        assertFailsWith<IllegalArgumentException> { BudgetAllocation(name = "", ratio = 1) }
        assertFailsWith<IllegalArgumentException> { BudgetTemplate.zeroBased(emptyList()) }
    }
}
