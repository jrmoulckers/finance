// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.affordability

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [AffordabilityCalculator] (#377).
 *
 * Validates the pure calculation logic that determines whether a user
 * can afford a planned purchase, covering all verdict thresholds and
 * budget impact scenarios.
 */
class AffordabilityCalculatorTest {

    // ── Verdict tests ───────────────────────────────────────────────────

    @Test
    fun `comfortable verdict when remaining funds exceed 20 percent`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(100_00),
            purchaseAmount = Cents(50_00),
        )
        assertEquals(AffordabilityVerdict.COMFORTABLE, result.verdict)
        assertEquals(Cents(50_00), result.remainingAfterPurchase)
    }

    @Test
    fun `tight verdict when remaining funds between 5 and 20 percent`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(100_00),
            purchaseAmount = Cents(85_00),
        )
        assertEquals(AffordabilityVerdict.TIGHT, result.verdict)
        assertEquals(Cents(15_00), result.remainingAfterPurchase)
    }

    @Test
    fun `risky verdict when remaining funds below 5 percent`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(100_00),
            purchaseAmount = Cents(97_00),
        )
        assertEquals(AffordabilityVerdict.RISKY, result.verdict)
        assertEquals(Cents(3_00), result.remainingAfterPurchase)
    }

    @Test
    fun `cannot afford verdict when purchase exceeds available funds`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(50_00),
            purchaseAmount = Cents(75_00),
        )
        assertEquals(AffordabilityVerdict.CANNOT_AFFORD, result.verdict)
        assertEquals(Cents(-25_00), result.remainingAfterPurchase)
    }

    @Test
    fun `cannot afford when funds are zero`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents.ZERO,
            purchaseAmount = Cents(10_00),
        )
        assertEquals(AffordabilityVerdict.CANNOT_AFFORD, result.verdict)
    }

    @Test
    fun `exact threshold at 20 percent boundary is comfortable`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(100_00),
            purchaseAmount = Cents(80_00),
        )
        assertEquals(AffordabilityVerdict.COMFORTABLE, result.verdict)
    }

    @Test
    fun `exact threshold at 5 percent boundary is tight`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(100_00),
            purchaseAmount = Cents(95_00),
        )
        assertEquals(AffordabilityVerdict.TIGHT, result.verdict)
    }

    // ── Budget impact tests ─────────────────────────────────────────────

    @Test
    fun `budget impact detected when purchase exceeds budget limit`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(1000_00),
            purchaseAmount = Cents(200_00),
            budgetName = "Shopping",
            budgetSpent = Cents(350_00),
            budgetLimit = Cents(500_00),
        )
        assertTrue(result.budgetImpact.wouldExceedBudget)
        assertEquals("Shopping", result.budgetImpact.affectedBudgetName)
        assertEquals(Cents(550_00), result.budgetImpact.spentAfterPurchase)
    }

    @Test
    fun `budget impact within limit when purchase fits`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(1000_00),
            purchaseAmount = Cents(50_00),
            budgetName = "Groceries",
            budgetSpent = Cents(200_00),
            budgetLimit = Cents(500_00),
        )
        assertFalse(result.budgetImpact.wouldExceedBudget)
        assertEquals(Cents(250_00), result.budgetImpact.spentAfterPurchase)
    }

    @Test
    fun `no budget impact when no budget specified`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(1000_00),
            purchaseAmount = Cents(50_00),
        )
        assertFalse(result.budgetImpact.wouldExceedBudget)
        assertEquals(null, result.budgetImpact.affectedBudgetName)
    }

    // ── Recommendation tests ────────────────────────────────────────────

    @Test
    fun `comfortable verdict produces positive recommendation`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(1000_00),
            purchaseAmount = Cents(100_00),
        )
        assertTrue(result.recommendations.any { it.contains("comfortably") })
    }

    @Test
    fun `cannot afford verdict produces saving recommendation`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(50_00),
            purchaseAmount = Cents(100_00),
        )
        assertTrue(result.recommendations.any { it.contains("exceeds") })
    }

    @Test
    fun `budget exceed adds budget warning recommendation`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(1000_00),
            purchaseAmount = Cents(200_00),
            budgetName = "Shopping",
            budgetSpent = Cents(400_00),
            budgetLimit = Cents(500_00),
        )
        assertTrue(result.recommendations.any { it.contains("exceed your budget") })
    }

    @Test
    fun `purchase larger than monthly income adds income warning`() {
        val result = AffordabilityCalculator.evaluate(
            availableFunds = Cents(10000_00),
            purchaseAmount = Cents(5000_00),
            monthlyIncome = Cents(4000_00),
        )
        assertTrue(result.recommendations.any { it.contains("monthly income") })
    }
}
