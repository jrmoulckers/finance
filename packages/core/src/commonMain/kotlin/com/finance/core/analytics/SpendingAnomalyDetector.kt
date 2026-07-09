// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.models.types.Cents
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.sqrt

/**
 * Whether an anomalous value is unusually high or unusually low.
 */
enum class AnomalyDirection { HIGH, LOW }

/**
 * A single anomalous data point detected in a spending series.
 *
 * @property index Position of the value in the input series (0-based).
 * @property value The anomalous amount.
 * @property baseline The central reference for the series — the mean for
 *   z-score detection, the median for IQR detection.
 * @property spread The dispersion measure used — the standard deviation for
 *   z-score detection, the inter-quartile range for IQR detection.
 * @property score Signed magnitude of the deviation in units of [spread]
 *   (`(value - baseline) / spread`). Positive is high, negative is low.
 * @property direction Whether the value is a high or low outlier.
 */
data class SpendingAnomaly(
    val index: Int,
    val value: Cents,
    val baseline: Double,
    val spread: Double,
    val score: Double,
    val direction: AnomalyDirection,
)

/**
 * Detects statistical outliers ("you spent unusually more this month") in a
 * series of monetary totals — typically monthly totals for a category or for
 * overall spending.
 *
 * Pure `commonMain` logic with no platform dependencies. Amounts stay in
 * integer [Cents]; only the derived statistics use [Double]. Small samples are
 * handled gracefully (too little history ⇒ no anomalies, never a divide-by-zero).
 *
 * Two complementary methods are provided:
 *  - [detectZScore] — mean/standard-deviation z-score; simple and sensitive.
 *  - [detectIqr] — inter-quartile-range (Tukey fences); robust to the very
 *    outliers being detected, so a single huge spike does not mask others.
 */
object SpendingAnomalyDetector {

    /** Default z-score magnitude beyond which a point is flagged. */
    const val DEFAULT_Z_THRESHOLD: Double = 2.0

    /** Default Tukey fence multiplier for [detectIqr]. */
    const val DEFAULT_IQR_MULTIPLIER: Double = 1.5

    /** Minimum points required for a meaningful z-score. */
    const val MIN_ZSCORE_SAMPLE: Int = 3

    /** Minimum points required to compute quartiles for [detectIqr]. */
    const val MIN_IQR_SAMPLE: Int = 4

    /**
     * Flag values whose absolute z-score meets or exceeds [threshold].
     *
     * Uses the population standard deviation. Returns an empty list when there
     * is insufficient history ([MIN_ZSCORE_SAMPLE]) or when every value is
     * identical (zero spread — nothing can be anomalous).
     *
     * @param series Ordered series of amounts (e.g. oldest→newest monthly totals).
     * @param threshold Positive z-score magnitude beyond which a point is an anomaly.
     * @return Anomalies in ascending [SpendingAnomaly.index] order.
     */
    fun detectZScore(
        series: List<Cents>,
        threshold: Double = DEFAULT_Z_THRESHOLD,
    ): List<SpendingAnomaly> {
        require(threshold > 0.0) { "threshold must be > 0, was $threshold" }
        if (series.size < MIN_ZSCORE_SAMPLE) return emptyList()

        val values = series.map { it.amount.toDouble() }
        val mean = values.average()
        val variance = values.sumOf { (it - mean) * (it - mean) } / values.size
        val stdDev = sqrt(variance)
        if (stdDev == 0.0) return emptyList()

        return series.mapIndexedNotNull { index, amount ->
            val score = (amount.amount.toDouble() - mean) / stdDev
            if (abs(score) >= threshold) {
                SpendingAnomaly(
                    index = index,
                    value = amount,
                    baseline = mean,
                    spread = stdDev,
                    score = score,
                    direction = if (score > 0) AnomalyDirection.HIGH else AnomalyDirection.LOW,
                )
            } else {
                null
            }
        }
    }

    /**
     * Flag values outside the Tukey fences `[Q1 - k·IQR, Q3 + k·IQR]`.
     *
     * More robust than [detectZScore] because the quartiles are not distorted
     * by the extreme values being detected. Returns an empty list when there is
     * insufficient history ([MIN_IQR_SAMPLE]) or when the IQR is zero.
     *
     * @param series Ordered series of amounts.
     * @param multiplier Positive fence multiplier `k` (1.5 = "outlier", 3.0 = "far out").
     * @return Anomalies in ascending [SpendingAnomaly.index] order.
     */
    fun detectIqr(
        series: List<Cents>,
        multiplier: Double = DEFAULT_IQR_MULTIPLIER,
    ): List<SpendingAnomaly> {
        require(multiplier > 0.0) { "multiplier must be > 0, was $multiplier" }
        if (series.size < MIN_IQR_SAMPLE) return emptyList()

        val sorted = series.map { it.amount.toDouble() }.sorted()
        val q1 = percentile(sorted, 25.0)
        val median = percentile(sorted, 50.0)
        val q3 = percentile(sorted, 75.0)
        val iqr = q3 - q1
        if (iqr == 0.0) return emptyList()

        val lowerFence = q1 - multiplier * iqr
        val upperFence = q3 + multiplier * iqr

        return series.mapIndexedNotNull { index, amount ->
            val value = amount.amount.toDouble()
            val direction = when {
                value > upperFence -> AnomalyDirection.HIGH
                value < lowerFence -> AnomalyDirection.LOW
                else -> return@mapIndexedNotNull null
            }
            SpendingAnomaly(
                index = index,
                value = amount,
                baseline = median,
                spread = iqr,
                score = (value - median) / iqr,
                direction = direction,
            )
        }
    }

    /**
     * Linear-interpolation percentile of an ascending-sorted list.
     * `p` is in the range `[0, 100]`.
     */
    private fun percentile(sortedAsc: List<Double>, p: Double): Double {
        if (sortedAsc.isEmpty()) return 0.0
        if (sortedAsc.size == 1) return sortedAsc[0]
        val rank = (p / 100.0) * (sortedAsc.size - 1)
        val low = floor(rank).toInt()
        val high = ceil(rank).toInt()
        if (low == high) return sortedAsc[low]
        val weight = rank - low
        return sortedAsc[low] * (1.0 - weight) + sortedAsc[high] * weight
    }
}
