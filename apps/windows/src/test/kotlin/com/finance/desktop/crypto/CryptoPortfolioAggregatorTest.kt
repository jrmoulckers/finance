// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for the pure crypto portfolio aggregation ([CryptoPortfolioAggregator]).
 *
 * These run in CI with no UI and no network — they pin the value, allocation,
 * 24h-change, P&L and staleness maths the dashboard depends on.
 */
class CryptoPortfolioAggregatorTest {

    private val holdings = listOf(
        CryptoHolding("btc", "BTC", "Bitcoin", quantity = 1.0, costBasisCents = 5_000_000L),
        CryptoHolding("eth", "ETH", "Ethereum", quantity = 10.0, costBasisCents = 3_000_000L),
    )

    private fun prices(asOf: Long) = listOf(
        CryptoPrice("BTC", priceCents = 6_000_000L, change24hPercent = 20.0, asOfEpochMs = asOf),
        CryptoPrice("ETH", priceCents = 400_000L, change24hPercent = -10.0, asOfEpochMs = asOf),
    )

    @Test
    fun `aggregates market value and total cost`() {
        val summary = CryptoPortfolioAggregator.aggregate(holdings, prices(1_000L), nowEpochMs = 1_000L)
        assertEquals(10_000_000L, summary.totalValueCents)
        assertEquals(8_000_000L, summary.totalCostCents)
        assertEquals(2_000_000L, summary.totalPnlCents)
        assertEquals(25.0, summary.totalPnlPercent, 0.001)
    }

    @Test
    fun `allocation percentages reflect market value share and sum to 100`() {
        val summary = CryptoPortfolioAggregator.aggregate(holdings, prices(1_000L), nowEpochMs = 1_000L)
        val btc = summary.positions.first { it.symbol == "BTC" }
        val eth = summary.positions.first { it.symbol == "ETH" }
        assertEquals(60.0, btc.allocationPercent, 0.001)
        assertEquals(40.0, eth.allocationPercent, 0.001)
        assertEquals(100.0, btc.allocationPercent + eth.allocationPercent, 0.001)
    }

    @Test
    fun `24h change is reconstructed from the percent move`() {
        val summary = CryptoPortfolioAggregator.aggregate(holdings, prices(1_000L), nowEpochMs = 1_000L)
        val btc = summary.positions.first { it.symbol == "BTC" }
        val eth = summary.positions.first { it.symbol == "ETH" }
        // BTC up 20%: yesterday 6,000,000 / 1.2 = 5,000,000 → +1,000,000
        assertEquals(1_000_000L, btc.change24hCents)
        // ETH down 10%: yesterday 4,000,000 / 0.9 = 4,444,444 → -444,444
        assertEquals(-444_444L, eth.change24hCents)
        assertEquals(555_556L, summary.total24hChangeCents)
    }

    @Test
    fun `positions are sorted by market value descending`() {
        val summary = CryptoPortfolioAggregator.aggregate(holdings, prices(1_000L), nowEpochMs = 1_000L)
        assertEquals(listOf("BTC", "ETH"), summary.positions.map { it.symbol })
        assertEquals(1_000L, summary.lastUpdatedEpochMs)
        assertEquals(1_000L, summary.oldestPriceEpochMs)
    }

    @Test
    fun `per-position pnl percent uses cost basis`() {
        val summary = CryptoPortfolioAggregator.aggregate(holdings, prices(1_000L), nowEpochMs = 1_000L)
        val btc = summary.positions.first { it.symbol == "BTC" }
        // value 6,000,000 - cost 5,000,000 = +1,000,000 → +20%
        assertEquals(1_000_000L, btc.unrealizedPnlCents)
        assertEquals(20.0, btc.unrealizedPnlPercent, 0.001)
    }

    @Test
    fun `fresh prices are not stale`() {
        val summary = CryptoPortfolioAggregator.aggregate(
            holdings, prices(asOf = 1_000L), nowEpochMs = 1_000L + 30_000L,
        )
        assertFalse(summary.isStale)
        assertTrue(summary.positions.none { it.isPriceStale })
    }

    @Test
    fun `prices older than the threshold are flagged stale`() {
        val summary = CryptoPortfolioAggregator.aggregate(
            holdings,
            prices(asOf = 1_000L),
            nowEpochMs = 1_000L + 200_000L,
            stalenessThresholdMs = 120_000L,
        )
        assertTrue(summary.isStale)
        assertTrue(summary.positions.all { it.isPriceStale })
    }

    @Test
    fun `holdings without a price are reported as missing and mark the portfolio stale`() {
        val withExtra = holdings + CryptoHolding("doge", "DOGE", "Dogecoin", 100.0, 10_000L)
        val summary = CryptoPortfolioAggregator.aggregate(withExtra, prices(1_000L), nowEpochMs = 1_000L)
        assertEquals(listOf("DOGE"), summary.missingPriceSymbols)
        assertTrue(summary.isStale)
        // DOGE is excluded from value because it has no price.
        assertEquals(10_000_000L, summary.totalValueCents)
    }

    @Test
    fun `empty holdings yield the empty summary`() {
        val summary = CryptoPortfolioAggregator.aggregate(emptyList(), prices(1_000L), nowEpochMs = 1_000L)
        assertEquals(CryptoPortfolioSummary.EMPTY, summary)
        assertFalse(summary.hasData)
    }

    @Test
    fun `symbol matching is case-insensitive`() {
        val lower = listOf(CryptoHolding("btc", "btc", "Bitcoin", 1.0, 5_000_000L))
        val summary = CryptoPortfolioAggregator.aggregate(lower, prices(1_000L), nowEpochMs = 1_000L)
        assertEquals(1, summary.positions.size)
        assertEquals("BTC", summary.positions.first().symbol)
        assertTrue(summary.missingPriceSymbols.isEmpty())
    }
}
