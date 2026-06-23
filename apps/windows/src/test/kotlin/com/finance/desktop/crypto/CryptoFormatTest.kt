// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Unit tests for the pure presentation formatting ([CryptoFormat]).
 *
 * Locale-stable freshness and signed-percent labels, verified with no UI.
 */
class CryptoFormatTest {

    @Test
    fun `relative updated buckets elapsed time`() {
        assertEquals("Updated just now", CryptoFormat.relativeUpdated(0L))
        assertEquals("Updated just now", CryptoFormat.relativeUpdated(4_999L))
        assertEquals("Updated 30s ago", CryptoFormat.relativeUpdated(30_000L))
        assertEquals("Updated 2m ago", CryptoFormat.relativeUpdated(120_000L))
        assertEquals("Updated 3h ago", CryptoFormat.relativeUpdated(3 * 3_600_000L))
        assertEquals("Updated 2d ago", CryptoFormat.relativeUpdated(2 * 86_400_000L))
    }

    @Test
    fun `signed percent renders sign and one decimal`() {
        assertEquals("+2.4%", CryptoFormat.signedPercent(2.41))
        assertEquals("-1.8%", CryptoFormat.signedPercent(-1.84))
        assertEquals("0.0%", CryptoFormat.signedPercent(0.0))
        assertEquals("+25.0%", CryptoFormat.signedPercent(25.0))
    }

    @Test
    fun `direction word reflects sign`() {
        assertEquals("up", CryptoFormat.directionWord(0.1))
        assertEquals("down", CryptoFormat.directionWord(-0.1))
        assertEquals("flat", CryptoFormat.directionWord(0.0))
    }
}
