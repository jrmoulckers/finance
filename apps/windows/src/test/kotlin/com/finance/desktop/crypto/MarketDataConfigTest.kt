// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for the market-data gate ([MarketDataConfig]) — #2702.
 *
 * The live feed must only engage when the operator BOTH enables the flag AND
 * supplies credentials; otherwise the deterministic offline path is used. Pure
 * function of an injected environment lookup — no real env access.
 */
class MarketDataConfigTest {

    private fun env(vararg pairs: Pair<String, String>): (String) -> String? {
        val map = pairs.toMap()
        return { key -> map[key] }
    }

    @Test
    fun `disabled by default when nothing is set`() {
        val settings = MarketDataConfig.fromEnvironment(env())
        assertFalse(settings.useLiveFeed)
        assertNull(settings.credentials)
        assertFalse(settings.isLiveFlagEnabled)
    }

    @Test
    fun `flag on but no credentials stays offline`() {
        val settings = MarketDataConfig.fromEnvironment(
            env(MarketDataConfig.ENABLE_ENV to "true"),
        )
        assertTrue(settings.isLiveFlagEnabled)
        assertFalse(settings.useLiveFeed)
        assertTrue(settings.statusLabel.contains("credentials missing"))
    }

    @Test
    fun `credentials present but flag off stays offline`() {
        val settings = MarketDataConfig.fromEnvironment(
            env(
                MarketDataConfig.API_KEY_ENV to "k",
                MarketDataConfig.BASE_URL_ENV to "https://api.example.com",
            ),
        )
        assertFalse(settings.useLiveFeed)
    }

    @Test
    fun `flag on plus credentials enables the live feed`() {
        val settings = MarketDataConfig.fromEnvironment(
            env(
                MarketDataConfig.ENABLE_ENV to "true",
                MarketDataConfig.API_KEY_ENV to "secret",
                MarketDataConfig.BASE_URL_ENV to "https://api.example.com",
            ),
        )
        assertTrue(settings.useLiveFeed)
        assertEquals("secret", settings.credentials?.apiKey)
        assertTrue(settings.statusLabel.contains("Live"))
    }

    @Test
    fun `refresh interval is clamped to the minimum`() {
        val settings = MarketDataConfig.fromEnvironment(
            env(MarketDataConfig.REFRESH_INTERVAL_ENV to "10"),
        )
        assertEquals(MarketDataConfig.MIN_REFRESH_INTERVAL_MS, settings.refreshIntervalMs)
    }

    @Test
    fun `refresh interval falls back to default when unparseable`() {
        val settings = MarketDataConfig.fromEnvironment(
            env(MarketDataConfig.REFRESH_INTERVAL_ENV to "not-a-number"),
        )
        assertEquals(MarketDataConfig.DEFAULT_REFRESH_INTERVAL_MS, settings.refreshIntervalMs)
    }

    @Test
    fun `accepts alternate truthy flag spellings`() {
        listOf("1", "yes", "TRUE").forEach { value ->
            val settings = MarketDataConfig.fromEnvironment(env(MarketDataConfig.ENABLE_ENV to value))
            assertTrue(settings.isLiveFlagEnabled, "expected '$value' to enable the flag")
        }
    }
}
