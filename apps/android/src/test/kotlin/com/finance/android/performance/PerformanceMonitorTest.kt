// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.performance

import com.finance.android.monitoring.RecompositionCounter
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Unit tests for performance monitoring utilities.
 */
class PerformanceMonitorTest {

    @Test
    fun `RecompositionCounter starts at zero`() {
        val counter = RecompositionCounter()
        assertEquals(0, counter.value)
    }

    @Test
    fun `RecompositionCounter increments correctly`() {
        val counter = RecompositionCounter()
        counter.increment()
        assertEquals(1, counter.value)
        counter.increment()
        assertEquals(2, counter.value)
    }

    @Test
    fun `RecompositionCounter tracks multiple increments`() {
        val counter = RecompositionCounter()
        repeat(100) { counter.increment() }
        assertEquals(100, counter.value)
    }
}
