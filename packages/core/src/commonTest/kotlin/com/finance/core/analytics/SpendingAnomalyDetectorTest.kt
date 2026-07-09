// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Tests for [SpendingAnomalyDetector] (#3739).
 */
class SpendingAnomalyDetectorTest {

    private fun cents(vararg v: Long) = v.map { Cents(it) }

    // ── z-score ──────────────────────────────────────────────────────

    @Test
    fun detectZScore_flagsHighOutlier() {
        // [100,100,100,100,1000]: mean 280, stdDev 360, z(1000) = 2.0
        val anomalies = SpendingAnomalyDetector.detectZScore(
            cents(100, 100, 100, 100, 1000),
            threshold = 2.0,
        )

        assertEquals(1, anomalies.size)
        val a = anomalies.single()
        assertEquals(4, a.index)
        assertEquals(Cents(1000), a.value)
        assertEquals(AnomalyDirection.HIGH, a.direction)
        assertEquals(2.0, a.score, 1e-9)
        assertEquals(280.0, a.baseline, 1e-9)
        assertEquals(360.0, a.spread, 1e-9)
    }

    @Test
    fun detectZScore_flagsLowOutlier() {
        // [1000,1000,1000,1000,100]: mean 820, stdDev 360, z(100) = -2.0
        val anomalies = SpendingAnomalyDetector.detectZScore(
            cents(1000, 1000, 1000, 1000, 100),
            threshold = 2.0,
        )

        assertEquals(1, anomalies.size)
        val a = anomalies.single()
        assertEquals(4, a.index)
        assertEquals(AnomalyDirection.LOW, a.direction)
        assertEquals(-2.0, a.score, 1e-9)
    }

    @Test
    fun detectZScore_flatSeries_noAnomalies() {
        assertTrue(SpendingAnomalyDetector.detectZScore(cents(500, 500, 500, 500)).isEmpty())
    }

    @Test
    fun detectZScore_tooFewPoints_noAnomalies() {
        assertTrue(SpendingAnomalyDetector.detectZScore(cents(100, 1000)).isEmpty())
    }

    @Test
    fun detectZScore_emptySeries_noAnomalies() {
        assertTrue(SpendingAnomalyDetector.detectZScore(emptyList()).isEmpty())
    }

    @Test
    fun detectZScore_higherThresholdSuppressesModerateOutlier() {
        // Same series as the high-outlier case but a stricter threshold.
        val anomalies = SpendingAnomalyDetector.detectZScore(
            cents(100, 100, 100, 100, 1000),
            threshold = 3.0,
        )
        assertTrue(anomalies.isEmpty())
    }

    @Test
    fun detectZScore_nonPositiveThreshold_throws() {
        assertFailsWith<IllegalArgumentException> {
            SpendingAnomalyDetector.detectZScore(cents(1, 2, 3), threshold = 0.0)
        }
    }

    // ── IQR ──────────────────────────────────────────────────────────

    @Test
    fun detectIqr_flagsHighOutlier() {
        // sorted [10,11,12,13,100]: Q1=11, Q3=13, IQR=2, upper fence 16
        val anomalies = SpendingAnomalyDetector.detectIqr(
            cents(10, 12, 11, 13, 100),
        )

        assertEquals(1, anomalies.size)
        val a = anomalies.single()
        assertEquals(4, a.index)
        assertEquals(Cents(100), a.value)
        assertEquals(AnomalyDirection.HIGH, a.direction)
        assertEquals(12.0, a.baseline, 1e-9) // median
        assertEquals(2.0, a.spread, 1e-9) // IQR
    }

    @Test
    fun detectIqr_flatSeries_noAnomalies() {
        assertTrue(SpendingAnomalyDetector.detectIqr(cents(5, 5, 5, 5)).isEmpty())
    }

    @Test
    fun detectIqr_tooFewPoints_noAnomalies() {
        assertTrue(SpendingAnomalyDetector.detectIqr(cents(10, 12, 100)).isEmpty())
    }

    @Test
    fun detectIqr_nonPositiveMultiplier_throws() {
        assertFailsWith<IllegalArgumentException> {
            SpendingAnomalyDetector.detectIqr(cents(1, 2, 3, 4), multiplier = -1.0)
        }
    }
}
