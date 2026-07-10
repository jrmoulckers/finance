// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.core.TestFixtures
import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * Tests for #3678 — configurable over-budget warning thresholds.
 */
class BudgetThresholdsTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    private fun statusAtUtilization(spent: Long): BudgetStatus {
        val budget = TestFixtures.createBudget(amount = Cents(10000), startDate = LocalDate(2024, 6, 1))
        val txns = listOf(TestFixtures.createExpense(amount = Cents(spent), date = LocalDate(2024, 6, 10)))
        return BudgetCalculator.calculateStatus(budget, txns, LocalDate(2024, 6, 15))
    }

    // ── Default behaviour unchanged ────────────────────────────────────

    @Test
    fun default_thresholds_matchLegacyBehaviour() {
        assertEquals(BudgetHealth.HEALTHY, statusAtUtilization(7500).healthLevel, "exactly 75% is healthy")
        assertEquals(BudgetHealth.WARNING, statusAtUtilization(7501).healthLevel, "just over 75% warns")
        assertEquals(BudgetHealth.WARNING, statusAtUtilization(10000).healthLevel, "exactly 100% is warning")
        assertEquals(BudgetHealth.OVER, statusAtUtilization(10001).healthLevel, "just over 100% is over")
    }

    @Test
    fun defaultThresholds_classifyMatchesProperty() {
        val status = statusAtUtilization(8000)
        assertEquals(status.healthLevel, status.healthLevel(BudgetThresholds.DEFAULT))
    }

    // ── Custom thresholds change classification ────────────────────────

    @Test
    fun conservativeThreshold_warnsEarlier() {
        // Warn at 50% for discretionary spend.
        val thresholds = BudgetThresholds(warning = 0.5)
        assertEquals(BudgetHealth.HEALTHY, statusAtUtilization(4900).healthLevel(thresholds))
        assertEquals(BudgetHealth.WARNING, statusAtUtilization(5001).healthLevel(thresholds))
    }

    @Test
    fun lenientThreshold_warnsLater() {
        // Warn at 90% for rent.
        val thresholds = BudgetThresholds(warning = 0.9)
        assertEquals(BudgetHealth.HEALTHY, statusAtUtilization(8000).healthLevel(thresholds))
        assertEquals(BudgetHealth.WARNING, statusAtUtilization(9500).healthLevel(thresholds))
    }

    @Test
    fun customOverThreshold_belowOne() {
        // Treat 80% as "over".
        val thresholds = BudgetThresholds(warning = 0.5, over = 0.8)
        assertEquals(BudgetHealth.WARNING, statusAtUtilization(7000).healthLevel(thresholds))
        assertEquals(BudgetHealth.OVER, statusAtUtilization(8100).healthLevel(thresholds))
    }

    // ── Validation ─────────────────────────────────────────────────────

    @Test
    fun invalid_warningNotLessThanOver_rejected() {
        assertFailsWith<IllegalArgumentException> { BudgetThresholds(warning = 1.0, over = 1.0) }
        assertFailsWith<IllegalArgumentException> { BudgetThresholds(warning = 0.9, over = 0.8) }
    }

    @Test
    fun invalid_warningOutOfRange_rejected() {
        assertFailsWith<IllegalArgumentException> { BudgetThresholds(warning = -0.1) }
        assertFailsWith<IllegalArgumentException> { BudgetThresholds(warning = 1.5, over = 2.0) }
    }

    @Test
    fun invalid_overOutOfRange_rejected() {
        assertFailsWith<IllegalArgumentException> { BudgetThresholds(warning = 0.5, over = 1.5) }
    }

    @Test
    fun classify_directly() {
        val thresholds = BudgetThresholds(warning = 0.6, over = 0.95)
        assertEquals(BudgetHealth.HEALTHY, thresholds.classify(0.6))
        assertEquals(BudgetHealth.WARNING, thresholds.classify(0.61))
        assertEquals(BudgetHealth.WARNING, thresholds.classify(0.95))
        assertEquals(BudgetHealth.OVER, thresholds.classify(0.96))
    }
}
