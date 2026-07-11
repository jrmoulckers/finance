// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for the pure rate-limit backoff maths ([RefreshBackoff]) — #2702.
 *
 * The scheduler doubles its delay on each rate-limit hit up to a ceiling, and
 * snaps back to the base interval after a successful refresh.
 */
class RefreshBackoffTest {

    private val base = 30_000L
    private val max = 300_000L

    @Test
    fun `success resets to the base interval`() {
        assertEquals(base, RefreshBackoff.onSuccess(base))
    }

    @Test
    fun `first rate limit doubles the base interval`() {
        assertEquals(60_000L, RefreshBackoff.onRateLimited(base, base, max))
    }

    @Test
    fun `repeated rate limits keep doubling`() {
        var current = base
        current = RefreshBackoff.onRateLimited(current, base, max)
        assertEquals(60_000L, current)
        current = RefreshBackoff.onRateLimited(current, base, max)
        assertEquals(120_000L, current)
        current = RefreshBackoff.onRateLimited(current, base, max)
        assertEquals(240_000L, current)
    }

    @Test
    fun `backoff never exceeds the ceiling`() {
        var current = base
        repeat(20) { current = RefreshBackoff.onRateLimited(current, base, max) }
        assertEquals(max, current)
        assertTrue(current <= max)
    }

    @Test
    fun `a current below base still doubles from base`() {
        assertEquals(60_000L, RefreshBackoff.onRateLimited(1_000L, base, max))
    }
}
