// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.ai

import com.finance.models.types.Cents

/**
 * Inputs for a short-horizon balance prediction.
 *
 * Every field is sourced **entirely on-device** from the local SQLCipher
 * database — no inputs ever leave the machine, satisfying the issue's
 * "keep all prediction inputs and inference on the device" requirement.
 *
 * @property currentBalance Net liquid balance right now (sum of spendable
 *   account balances), in the smallest currency unit.
 * @property todaySpend Total expense spend recorded so far today.
 * @property recentDailySpend Per-day expense totals for the trailing window,
 *   most-recent-last. Used to estimate the average daily burn rate. May be
 *   empty when the user has little history.
 * @property upcomingBills Sum of known scheduled bills/installments falling
 *   due inside the prediction horizon.
 * @property horizonDays Number of days to project forward. Must be >= 1.
 */
data class PredictionInput(
    val currentBalance: Cents,
    val todaySpend: Cents,
    val recentDailySpend: List<Cents> = emptyList(),
    val upcomingBills: Cents = Cents.ZERO,
    val horizonDays: Int = DEFAULT_HORIZON_DAYS,
) {
    init {
        require(horizonDays >= 1) { "horizonDays must be >= 1, was $horizonDays" }
    }

    companion object {
        /** Default short-horizon window: one week ahead. */
        const val DEFAULT_HORIZON_DAYS = 7
    }
}

/**
 * Confidence band for a [BalancePrediction], derived from how much
 * historical signal the predictor had to work with.
 */
enum class PredictionConfidence(val label: String) {
    LOW("Low confidence"),
    MEDIUM("Medium confidence"),
    HIGH("High confidence"),
}

/**
 * Result of a short-horizon balance projection.
 *
 * @property projectedBalance Estimated liquid balance at the end of the
 *   horizon, after projected spend and known upcoming bills.
 * @property averageDailySpend The burn rate the projection assumed.
 * @property horizonDays Days projected forward (echoes the input).
 * @property confidence How much to trust the projection.
 * @property willGoNegative Convenience flag — true when the projected
 *   balance dips below zero by the end of the horizon.
 * @property modelId Identifier of the predictor that produced this result,
 *   useful for diagnostics and A/B comparison between the heuristic and a
 *   future ONNX model.
 */
data class BalancePrediction(
    val projectedBalance: Cents,
    val averageDailySpend: Cents,
    val horizonDays: Int,
    val confidence: PredictionConfidence,
    val willGoNegative: Boolean,
    val modelId: String,
)

/**
 * Strategy interface for on-device short-horizon balance prediction.
 *
 * Implementations MUST be deterministic for a given [PredictionInput] so the
 * widget surface is testable and reproducible. The interface deliberately
 * hides whether inference is a hand-tuned heuristic ([HeuristicBalancePredictor])
 * or a Windows ML / ONNX Runtime model ([OnnxBalancePredictor]) so the two can
 * be swapped without touching the widget, ViewModel, or UI layers.
 */
interface BalancePredictor {
    /** Stable identifier for the backing model/heuristic. */
    val modelId: String

    /**
     * Projects the end-of-horizon balance from on-device [input].
     * Implementations must not perform any network or disk I/O.
     */
    fun predict(input: PredictionInput): BalancePrediction
}
