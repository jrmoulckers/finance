// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.ai

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for the deterministic on-device [HeuristicBalancePredictor].
 *
 * These run with no model, no UI, and no database — they pin the burn-rate
 * math, confidence banding, and the negative-balance flag the widget relies on.
 */
class HeuristicBalancePredictorTest {

    private val predictor = HeuristicBalancePredictor()

    @Test
    fun `projects balance from steady burn rate`() {
        // $5/day spend, 7-day horizon -> $35 projected spend.
        val input = PredictionInput(
            currentBalance = Cents(100_00),
            todaySpend = Cents(5_00),
            recentDailySpend = List(7) { Cents(5_00) },
            horizonDays = 7,
        )

        val result = predictor.predict(input)

        assertEquals(Cents(5_00), result.averageDailySpend)
        assertEquals(Cents(65_00), result.projectedBalance) // 10000 - 3500
        assertEquals(7, result.horizonDays)
        assertFalse(result.willGoNegative)
        assertEquals(HeuristicBalancePredictor.MODEL_ID, result.modelId)
    }

    @Test
    fun `subtracts upcoming bills from projection`() {
        val input = PredictionInput(
            currentBalance = Cents(100_00),
            todaySpend = Cents(0),
            recentDailySpend = List(7) { Cents(5_00) },
            upcomingBills = Cents(20_00),
            horizonDays = 7,
        )

        val result = predictor.predict(input)

        // 10000 - (500*7) - 2000 = 4500
        assertEquals(Cents(45_00), result.projectedBalance)
    }

    @Test
    fun `flags negative projection`() {
        val input = PredictionInput(
            currentBalance = Cents(10_00),
            todaySpend = Cents(5_00),
            recentDailySpend = List(7) { Cents(5_00) },
            horizonDays = 7,
        )

        val result = predictor.predict(input)

        assertTrue(result.projectedBalance.isNegative())
        assertTrue(result.willGoNegative)
    }

    @Test
    fun `trims single high and low outliers from burn rate`() {
        // Days: 0, 1000, 1000, 1000, 9000 -> trim 0 and 9000 -> mean of 1000s.
        val input = PredictionInput(
            currentBalance = Cents(100_00),
            todaySpend = Cents(0),
            recentDailySpend = listOf(
                Cents(0),
                Cents(10_00),
                Cents(10_00),
                Cents(10_00),
                Cents(90_00),
            ),
            horizonDays = 1,
        )

        val result = predictor.predict(input)

        assertEquals(Cents(10_00), result.averageDailySpend)
    }

    @Test
    fun `falls back to today spend when no history`() {
        val input = PredictionInput(
            currentBalance = Cents(100_00),
            todaySpend = Cents(8_00),
            recentDailySpend = emptyList(),
            horizonDays = 3,
        )

        val result = predictor.predict(input)

        assertEquals(Cents(8_00), result.averageDailySpend)
        assertEquals(PredictionConfidence.LOW, result.confidence)
        // 10000 - (800*3) = 7600
        assertEquals(Cents(76_00), result.projectedBalance)
    }

    @Test
    fun `confidence scales with sample count`() {
        fun confidenceFor(days: Int) = predictor.predict(
            PredictionInput(
                currentBalance = Cents(100_00),
                todaySpend = Cents(0),
                recentDailySpend = List(days) { Cents(1_00) },
                horizonDays = 7,
            ),
        ).confidence

        assertEquals(PredictionConfidence.LOW, confidenceFor(2))
        assertEquals(PredictionConfidence.MEDIUM, confidenceFor(5))
        assertEquals(PredictionConfidence.HIGH, confidenceFor(14))
    }

    @Test
    fun `is deterministic for identical input`() {
        val input = PredictionInput(
            currentBalance = Cents(250_00),
            todaySpend = Cents(12_34),
            recentDailySpend = listOf(Cents(3_00), Cents(7_00), Cents(11_00), Cents(2_00)),
            horizonDays = 7,
        )

        assertEquals(predictor.predict(input), predictor.predict(input))
    }

    @Test
    fun `uses absolute value for negative-signed expense history`() {
        val positive = predictor.predict(
            PredictionInput(
                currentBalance = Cents(100_00),
                todaySpend = Cents(0),
                recentDailySpend = List(4) { Cents(5_00) },
                horizonDays = 7,
            ),
        )
        val negativeSigned = predictor.predict(
            PredictionInput(
                currentBalance = Cents(100_00),
                todaySpend = Cents(0),
                recentDailySpend = List(4) { Cents(-5_00) },
                horizonDays = 7,
            ),
        )

        assertEquals(positive.averageDailySpend, negativeSigned.averageDailySpend)
        assertEquals(positive.projectedBalance, negativeSigned.projectedBalance)
    }
}
