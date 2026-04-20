// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.prediction

import com.finance.core.TestFixtures
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.*
import kotlin.test.*

class BalancePredictionEngineTest {

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // predictEndOfMonth — basic scenarios
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictEndOfMonth_noTransactions_returnsCurrentBalance() {
        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000), // $1000
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(100000), prediction.currentBalance)
        assertEquals(PredictionConfidence.LOW, prediction.confidence)
        assertTrue(prediction.daysRemaining > 0)
    }

    @Test
    fun predictEndOfMonth_lastDayOfMonth_noDaysRemaining() {
        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(50000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 30), // last day of June
        )

        assertEquals(0, prediction.daysRemaining)
        assertEquals(Cents(50000), prediction.predictedBalance)
        assertEquals(PredictionConfidence.HIGH, prediction.confidence)
    }

    @Test
    fun predictEndOfMonth_withHistoricalExpenses_predictLowerBalance() {
        // Create 3 months of expense history: ~$30/day in expenses
        val transactions = buildList {
            for (monthOffset in 1..3) {
                val monthDate = LocalDate(2024, 6, 15).minus(monthOffset, DateTimeUnit.MONTH)
                for (day in 1..28) {
                    add(
                        TestFixtures.createExpense(
                            amount = Cents(3000), // $30
                            date = LocalDate(monthDate.year, monthDate.month, day),
                        ),
                    )
                }
            }
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(200000), // $2000
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        // Should predict lower balance due to expected expenses
        assertTrue(prediction.predictedBalance.amount < prediction.currentBalance.amount)
        assertTrue(prediction.expectedExpenses.amount > 0)
        assertEquals(15, prediction.daysRemaining) // June 15 → June 30
    }

    @Test
    fun predictEndOfMonth_withIncomeAndExpenses_balancedPrediction() {
        val transactions = buildList {
            for (monthOffset in 1..3) {
                val monthDate = LocalDate(2024, 6, 15).minus(monthOffset, DateTimeUnit.MONTH)
                // Daily income
                for (day in 1..28) {
                    add(
                        TestFixtures.createIncome(
                            amount = Cents(5000), // $50/day income
                            date = LocalDate(monthDate.year, monthDate.month, day),
                        ),
                    )
                }
                // Daily expenses
                for (day in 1..28) {
                    add(
                        TestFixtures.createExpense(
                            amount = Cents(3000), // $30/day expenses
                            date = LocalDate(monthDate.year, monthDate.month, day),
                        ),
                    )
                }
            }
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000), // $1000
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        // With net positive daily cash flow, predicted should be >= current
        assertTrue(prediction.expectedIncome.amount > 0)
        assertTrue(prediction.expectedExpenses.amount > 0)
        assertTrue(prediction.expectedIncome.amount > prediction.expectedExpenses.amount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // predictEndOfMonth — confidence levels
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictEndOfMonth_highConfidence_manyTransactions() {
        val transactions = (1..40).map {
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(PredictionConfidence.HIGH, prediction.confidence)
    }

    @Test
    fun predictEndOfMonth_mediumConfidence_moderateTransactions() {
        val transactions = (1..15).map {
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictEndOfMonth(
            currentBalance = Cents(100000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
        )

        assertEquals(PredictionConfidence.MEDIUM, prediction.confidence)
    }

    // ═══════════════════════════════════════════════════════════════════
    // predictAtDate
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictAtDate_sameDay_returnsCurrentBalance() {
        val prediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 6, 15),
        )

        assertEquals(Cents(100000), prediction.predictedBalance)
        assertEquals(0, prediction.daysRemaining)
    }

    @Test
    fun predictAtDate_futureDate_projectsBalance() {
        val transactions = (1..20).map {
            TestFixtures.createExpense(
                amount = Cents(2000),
                date = LocalDate(2024, 5, (it % 28) + 1),
            )
        }

        val prediction = BalancePredictionEngine.predictAtDate(
            currentBalance = Cents(200000),
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            targetDate = LocalDate(2024, 7, 15), // 30 days ahead
        )

        assertEquals(30, prediction.daysRemaining)
        assertTrue(prediction.predictedBalance.amount < 200000)
    }

    @Test
    fun predictAtDate_pastDate_throws() {
        assertFailsWith<IllegalArgumentException> {
            BalancePredictionEngine.predictAtDate(
                currentBalance = Cents(100000),
                transactions = emptyList(),
                referenceDate = LocalDate(2024, 6, 15),
                targetDate = LocalDate(2024, 6, 1), // before reference
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // dailyForecast
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun dailyForecast_generatesCorrectNumberOfDays() {
        val forecast = BalancePredictionEngine.dailyForecast(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
        )

        // June 15 → June 30 = 15 days of forecast
        assertEquals(15, forecast.size)
        assertEquals(LocalDate(2024, 6, 16), forecast.first().date)
        assertEquals(LocalDate(2024, 6, 30), forecast.last().date)
    }

    @Test
    fun dailyForecast_lastDayOfMonth_emptyList() {
        val forecast = BalancePredictionEngine.dailyForecast(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 30),
        )

        assertTrue(forecast.isEmpty())
    }

    @Test
    fun dailyForecast_datesAreSequential() {
        val forecast = BalancePredictionEngine.dailyForecast(
            currentBalance = Cents(100000),
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 20),
        )

        // Verify dates are consecutive
        forecast.zipWithNext().forEach { (a, b) ->
            assertEquals(
                a.date.plus(1, DateTimeUnit.DAY),
                b.date,
                "Dates should be consecutive",
            )
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // computeDailyAverage
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun computeDailyAverage_calculatesCorrectly() {
        // 30 transactions of $10 each over ~30 days
        val transactions = (1..30).map {
            TestFixtures.createExpense(
                amount = Cents(1000),
                date = LocalDate(2024, 5, it),
            )
        }

        val avg = BalancePredictionEngine.computeDailyAverage(
            transactions = transactions,
            referenceDate = LocalDate(2024, 6, 15),
            lookbackMonths = 3,
            type = TransactionType.EXPENSE,
        )

        // 30 * 1000 = 30000 cents over ~91 days (3 months) but only 30 have txns
        // The daily average should be total / days in lookback
        assertTrue(avg.amount > 0)
    }

    @Test
    fun computeDailyAverage_noTransactions_returnsZero() {
        val avg = BalancePredictionEngine.computeDailyAverage(
            transactions = emptyList(),
            referenceDate = LocalDate(2024, 6, 15),
            lookbackMonths = 3,
            type = TransactionType.EXPENSE,
        )

        assertEquals(Cents.ZERO, avg)
    }

    // ═══════════════════════════════════════════════════════════════════
    // BalancePrediction properties
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun balancePrediction_projectedChange() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(80000),
            currentBalance = Cents(100000),
            expectedIncome = Cents(20000),
            expectedExpenses = Cents(40000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 15,
            confidence = PredictionConfidence.MEDIUM,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        assertEquals(Cents(-20000), prediction.projectedChange) // Lost $200
        assertFalse(prediction.isNegativeProjection)
    }

    @Test
    fun balancePrediction_negativeProjection() {
        val prediction = BalancePrediction(
            predictedBalance = Cents(-5000),
            currentBalance = Cents(10000),
            expectedIncome = Cents.ZERO,
            expectedExpenses = Cents(15000),
            trendAdjustment = Cents.ZERO,
            daysRemaining = 10,
            confidence = PredictionConfidence.LOW,
            referenceDate = LocalDate(2024, 6, 15),
            predictionDate = LocalDate(2024, 6, 30),
        )

        assertTrue(prediction.isNegativeProjection)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Validation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun predictEndOfMonth_invalidLookback_throws() {
        assertFailsWith<IllegalArgumentException> {
            BalancePredictionEngine.predictEndOfMonth(
                currentBalance = Cents(100000),
                transactions = emptyList(),
                referenceDate = LocalDate(2024, 6, 15),
                lookbackMonths = 0,
            )
        }
    }
}
