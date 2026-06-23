// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.ai

import com.finance.models.types.Cents

/**
 * Deterministic, fully on-device short-horizon balance predictor.
 *
 * This is the **reference implementation** of [BalancePredictor]. It uses a
 * transparent burn-rate heuristic rather than a learned model, which keeps the
 * widget shippable today (no native ONNX toolchain required) while exposing the
 * exact same interface the future [OnnxBalancePredictor] will satisfy.
 *
 * ## Algorithm
 *
 * ```
 * burnRate      = trimmedMean(recentDailySpend)   // fall back to todaySpend
 * projectedSpend = burnRate * horizonDays
 * projected      = currentBalance - projectedSpend - upcomingBills
 * ```
 *
 * The burn rate uses a symmetric trimmed mean (drops the single highest and
 * lowest day once there are enough samples) so a one-off large purchase does
 * not dominate the projection. The computation is integer-only on [Cents], so
 * results are exact and reproducible — critical for the predictor unit tests.
 *
 * ## Confidence
 *
 * | Trailing samples | Confidence |
 * |------------------|------------|
 * | >= 14            | HIGH       |
 * | >= 4             | MEDIUM     |
 * | otherwise        | LOW        |
 */
class HeuristicBalancePredictor : BalancePredictor {

    override val modelId: String = MODEL_ID

    override fun predict(input: PredictionInput): BalancePrediction {
        val averageDailySpend = estimateDailyBurn(input)
        val projectedSpend = averageDailySpend * input.horizonDays
        val projectedBalance =
            input.currentBalance - projectedSpend - input.upcomingBills

        return BalancePrediction(
            projectedBalance = projectedBalance,
            averageDailySpend = averageDailySpend,
            horizonDays = input.horizonDays,
            confidence = confidenceFor(input.recentDailySpend.size),
            willGoNegative = projectedBalance.isNegative(),
            modelId = modelId,
        )
    }

    /**
     * Estimates the average daily expense (burn rate) using a trimmed mean of
     * the trailing daily totals. Spend magnitudes are compared by absolute
     * value so the heuristic is agnostic to the sign convention callers use
     * for expenses.
     */
    private fun estimateDailyBurn(input: PredictionInput): Cents {
        val history = input.recentDailySpend
        if (history.isEmpty()) {
            // No history — assume today's pace continues. This is intentionally
            // conservative and flagged LOW confidence downstream.
            return input.todaySpend.abs()
        }

        val magnitudes = history.map { it.abs().amount }.sorted()
        val trimmed = if (magnitudes.size >= MIN_SAMPLES_FOR_TRIM) {
            magnitudes.subList(1, magnitudes.size - 1)
        } else {
            magnitudes
        }
        val total = trimmed.sumOf { it }
        return Cents(total / trimmed.size)
    }

    private fun confidenceFor(sampleCount: Int): PredictionConfidence = when {
        sampleCount >= HIGH_CONFIDENCE_SAMPLES -> PredictionConfidence.HIGH
        sampleCount >= MEDIUM_CONFIDENCE_SAMPLES -> PredictionConfidence.MEDIUM
        else -> PredictionConfidence.LOW
    }

    companion object {
        const val MODEL_ID = "heuristic-burnrate-v1"

        /** Need at least 3 samples before trimming the high/low extremes. */
        private const val MIN_SAMPLES_FOR_TRIM = 3
        private const val MEDIUM_CONFIDENCE_SAMPLES = 4
        private const val HIGH_CONFIDENCE_SAMPLES = 14
    }
}
