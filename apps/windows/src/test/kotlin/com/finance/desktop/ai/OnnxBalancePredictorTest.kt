// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.ai

import com.finance.models.types.Cents
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

/**
 * Tests for the [OnnxBalancePredictor] adapter while the native Windows ML /
 * ONNX session is stubbed. Confirms it transparently delegates to the
 * deterministic fallback and reports the fallback model id.
 */
class OnnxBalancePredictorTest {

    @Test
    fun `native session is unavailable until toolchain wiring lands`() {
        assertFalse(OnnxBalancePredictor().isNativeSessionAvailable)
    }

    @Test
    fun `delegates to fallback predictor and reports its model id`() {
        val fallback = HeuristicBalancePredictor()
        val onnx = OnnxBalancePredictor(fallback = fallback)
        val input = PredictionInput(
            currentBalance = Cents(100_00),
            todaySpend = Cents(5_00),
            recentDailySpend = List(7) { Cents(5_00) },
            horizonDays = 7,
        )

        assertEquals(fallback.predict(input), onnx.predict(input))
        assertEquals(HeuristicBalancePredictor.MODEL_ID, onnx.modelId)
    }
}
