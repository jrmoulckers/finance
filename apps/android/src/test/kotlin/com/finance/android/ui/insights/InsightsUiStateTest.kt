// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.insights

import com.finance.core.insights.HealthAssessment
import com.finance.core.insights.TrendDirection
import com.finance.models.types.Currency
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [InsightsUiState] and related UI models.
 */
class InsightsUiStateTest {

    @Test
    fun `default state is loading`() {
        val state = InsightsUiState()
        assertTrue(state.isLoading)
        assertTrue(state.categoryBreakdown.isEmpty())
        assertTrue(state.categoryTrends.isEmpty())
        assertNull(state.incomeExpense)
        assertEquals(0, state.healthScore)
        assertEquals(HealthAssessment.FAIR, state.healthAssessment)
    }

    @Test
    fun `CategorySpendingUi preserves percentage`() {
        val category = CategorySpendingUi(
            name = "Groceries",
            amountFormatted = "$500",
            percentage = 25.0,
            rank = 1,
            changePercent = -5.0,
            priorAmountFormatted = "$525",
            colorIndex = 0,
        )
        assertEquals(25.0, category.percentage, 0.01)
        assertEquals(1, category.rank)
    }

    @Test
    fun `IncomeExpenseUi tracks positive cash flow`() {
        val positive = IncomeExpenseUi(
            incomeFormatted = "$5000",
            expenseFormatted = "$3000",
            netCashFlowFormatted = "+$2000",
            savingsRateFormatted = "40%",
            isPositiveCashFlow = true,
        )
        assertTrue(positive.isPositiveCashFlow)

        val negative = positive.copy(isPositiveCashFlow = false)
        assertTrue(!negative.isPositiveCashFlow)
    }

    @Test
    fun `CategoryTrendUi captures direction`() {
        val trend = CategoryTrendUi(
            name = "Dining",
            direction = TrendDirection.INCREASING,
            averageFormatted = "$400",
            changePercent = 15.0,
        )
        assertEquals(TrendDirection.INCREASING, trend.direction)
    }

    @Test
    fun `HealthComponentUi stores score`() {
        val component = HealthComponentUi(
            name = "Savings Rate",
            score = 80,
            explanation = "Excellent savings",
        )
        assertEquals(80, component.score)
    }

    @Test
    fun `loaded state carries correct currency`() {
        val state = InsightsUiState(
            isLoading = false,
            currency = Currency.USD,
        )
        assertEquals(Currency.USD, state.currency)
    }
}
