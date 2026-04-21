// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.widget

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * Unit tests for the Budget Summary and Goal Progress widget data models.
 */
class WidgetEnhancedDataTest {

    // ── Budget Summary Widget ────────────────────────────────────────

    @Test
    fun `WidgetBudgetData holds all required fields`() {
        val data = WidgetBudgetData(
            totalBudgets = 5,
            onTrack = 3,
            warning = 1,
            overBudget = 1,
            totalSpentFormatted = "$1,200.00",
            totalBudgetedFormatted = "$2,500.00",
            lastUpdated = "5 min ago",
        )

        assertEquals(5, data.totalBudgets)
        assertEquals(3, data.onTrack)
        assertEquals(1, data.warning)
        assertEquals(1, data.overBudget)
        assertEquals("$1,200.00", data.totalSpentFormatted)
        assertEquals("$2,500.00", data.totalBudgetedFormatted)
    }

    @Test
    fun `WidgetBudgetData with zero budgets`() {
        val data = WidgetBudgetData(
            totalBudgets = 0,
            onTrack = 0,
            warning = 0,
            overBudget = 0,
            totalSpentFormatted = "$0.00",
            totalBudgetedFormatted = "$0.00",
            lastUpdated = "Just now",
        )

        assertEquals(0, data.totalBudgets)
        assertEquals(0, data.onTrack + data.warning + data.overBudget)
    }

    @Test
    fun `WidgetBudgetData counts sum to total`() {
        val data = WidgetBudgetData(
            totalBudgets = 6,
            onTrack = 4,
            warning = 1,
            overBudget = 1,
            totalSpentFormatted = "$3,000",
            totalBudgetedFormatted = "$5,000",
            lastUpdated = "Now",
        )

        assertEquals(data.totalBudgets, data.onTrack + data.warning + data.overBudget)
    }

    // ── Goal Progress Widget ─────────────────────────────────────────

    @Test
    fun `WidgetGoalData holds all required fields`() {
        val data = WidgetGoalData(
            goalName = "Vacation Fund",
            currentFormatted = "$6,700",
            targetFormatted = "$10,000",
            remainingFormatted = "$3,300",
            progressPercent = 67,
            totalGoals = 3,
            lastUpdated = "2 min ago",
        )

        assertEquals("Vacation Fund", data.goalName)
        assertEquals(67, data.progressPercent)
        assertEquals(3, data.totalGoals)
        assertEquals("$6,700", data.currentFormatted)
    }

    @Test
    fun `WidgetGoalData with no goals`() {
        val data = WidgetGoalData(
            goalName = "No goals yet",
            currentFormatted = "$0.00",
            targetFormatted = "$0.00",
            remainingFormatted = "$0.00",
            progressPercent = 0,
            totalGoals = 0,
            lastUpdated = "Just now",
        )

        assertEquals(0, data.totalGoals)
        assertEquals(0, data.progressPercent)
    }

    @Test
    fun `WidgetGoalData with completed goal`() {
        val data = WidgetGoalData(
            goalName = "Emergency Fund",
            currentFormatted = "$10,000",
            targetFormatted = "$10,000",
            remainingFormatted = "$0.00",
            progressPercent = 100,
            totalGoals = 2,
            lastUpdated = "Now",
        )

        assertEquals(100, data.progressPercent)
        assertEquals("$0.00", data.remainingFormatted)
    }

    @Test
    fun `goal count pluralization helper`() {
        val single = 1
        val multiple = 3

        assertEquals("1 active goal", "$single active goal${if (single != 1) "s" else ""}")
        assertEquals("3 active goals", "$multiple active goal${if (multiple != 1) "s" else ""}")
    }
}
