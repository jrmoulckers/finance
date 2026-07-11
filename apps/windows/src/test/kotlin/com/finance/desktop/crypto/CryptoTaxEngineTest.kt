// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for the chain-aware cost-basis / taxable-event engine
 * ([CryptoTaxEngine]) — #2168.
 *
 * Pins FIFO/HIFO lot relief, airdrop/staking income classification, basis
 * preservation across bridges/wraps, short-vs-long-term treatment and swap
 * disposal + acquisition. Pure and deterministic — no UI, no network.
 */
class CryptoTaxEngineTest {

    private val day = 24L * 60 * 60 * 1000

    private fun buy(id: String, at: Long, symbol: String, qty: Double, cents: Long, wallet: String = "w", chain: Chain = Chain.ETHEREUM) =
        CryptoTaxEvent(id, TaxEventType.BUY, at, wallet, chain, symbol, qty, cents)

    private fun sell(id: String, at: Long, symbol: String, qty: Double, cents: Long, wallet: String = "w", chain: Chain = Chain.ETHEREUM) =
        CryptoTaxEvent(id, TaxEventType.SELL, at, wallet, chain, symbol, qty, cents)

    @Test
    fun `empty events produce an empty report`() {
        val report = CryptoTaxEngine.process(emptyList(), LotMethod.FIFO)
        assertEquals(0L, report.totalRealizedGainCents)
        assertTrue(report.realizedGains.isEmpty())
        assertEquals(LotMethod.FIFO, report.method)
    }

    @Test
    fun `FIFO relieves the oldest lot first`() {
        val events = listOf(
            buy("b1", 0L, "ETH", 1.0, 100_000L),
            buy("b2", 10 * day, "ETH", 1.0, 300_000L),
            sell("s1", 20 * day, "ETH", 1.0, 250_000L),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.FIFO)
        // FIFO relieves the 100k lot → gain = 250k - 100k = 150k.
        assertEquals(150_000L, report.totalRealizedGainCents)
        assertEquals(1, report.realizedGains.size)
        // One 300k lot remains open.
        assertEquals(1, report.openLots.size)
        assertEquals(300_000L, report.openLots.first().costBasisCents)
    }

    @Test
    fun `HIFO relieves the highest-cost lot first`() {
        val events = listOf(
            buy("b1", 0L, "ETH", 1.0, 100_000L),
            buy("b2", 10 * day, "ETH", 1.0, 300_000L),
            sell("s1", 20 * day, "ETH", 1.0, 250_000L),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.HIFO)
        // HIFO relieves the 300k lot → loss = 250k - 300k = -50k.
        assertEquals(-50_000L, report.totalRealizedGainCents)
        assertEquals(100_000L, report.openLots.first().costBasisCents)
    }

    @Test
    fun `airdrops and staking rewards are ordinary income at fair value`() {
        val events = listOf(
            CryptoTaxEvent("a1", TaxEventType.AIRDROP, 0L, "w", Chain.ARBITRUM, "ARB", 1_000.0, 100_000L),
            CryptoTaxEvent("r1", TaxEventType.STAKING_REWARD, day, "w", Chain.ETHEREUM, "ETH", 0.1, 20_000L),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.FIFO)
        assertEquals(120_000L, report.totalIncomeCents)
        assertEquals(2, report.incomeEvents.size)
        // Income establishes basis so later disposal only taxes the capital move.
        assertEquals(2, report.openLots.size)
    }

    @Test
    fun `income basis means a later sale at same price yields zero gain`() {
        val events = listOf(
            CryptoTaxEvent("a1", TaxEventType.AIRDROP, 0L, "w", Chain.ARBITRUM, "ARB", 1_000.0, 100_000L),
            sell("s1", day, "ARB", 1_000.0, 100_000L, chain = Chain.ARBITRUM),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.FIFO)
        assertEquals(100_000L, report.totalIncomeCents)
        assertEquals(0L, report.totalRealizedGainCents)
    }

    @Test
    fun `bridge preserves basis and holding period across chains`() {
        val events = listOf(
            buy("b1", 0L, "ETH", 2.0, 400_000L, chain = Chain.ETHEREUM),
            CryptoTaxEvent(
                "br1", TaxEventType.BRIDGE, 10 * day, "w", Chain.ETHEREUM,
                "ETH", 2.0, 460_000L,
                destinationChain = Chain.OPTIMISM, destinationWalletId = "w",
            ),
            // Sell on the destination chain 400 days after the ORIGINAL buy.
            sell("s1", 400 * day, "ETH", 2.0, 500_000L, chain = Chain.OPTIMISM),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.FIFO)
        // Bridge is not a disposal; basis (400k) carries to Optimism.
        assertEquals(100_000L, report.totalRealizedGainCents)
        // Holding period survived the bridge → long-term.
        assertTrue(report.realizedGains.single().isLongTerm)
        assertEquals(0L, report.shortTermGainCents)
    }

    @Test
    fun `swap disposes the outgoing leg and acquires the incoming leg`() {
        val events = listOf(
            buy("b1", 0L, "ETH", 1.0, 100_000L),
            CryptoTaxEvent(
                "sw1", TaxEventType.SWAP, 5 * day, "w", Chain.ETHEREUM,
                "ETH", 1.0, 250_000L,
                counterAssetSymbol = "USDC", counterAssetQuantity = 2_500.0,
            ),
            sell("s1", 6 * day, "USDC", 2_500.0, 250_000L),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.FIFO)
        // Swap realizes 250k - 100k = 150k; USDC acquired at 250k basis, sold at
        // 250k → 0 gain. Net realized = 150k.
        assertEquals(150_000L, report.totalRealizedGainCents)
    }

    @Test
    fun `disposing more than tracked basis warns and treats excess as zero-basis`() {
        val events = listOf(
            buy("b1", 0L, "ETH", 1.0, 100_000L),
            sell("s1", day, "ETH", 2.0, 400_000L),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.FIFO)
        // Only 100k basis available → gain = 400k - 100k = 300k, plus a warning.
        assertEquals(300_000L, report.totalRealizedGainCents)
        assertTrue(report.warnings.isNotEmpty())
    }

    @Test
    fun `short term disposal within a year is classified short term`() {
        val events = listOf(
            buy("b1", 0L, "ETH", 1.0, 100_000L),
            sell("s1", 30 * day, "ETH", 1.0, 150_000L),
        )
        val report = CryptoTaxEngine.process(events, LotMethod.FIFO)
        assertEquals(50_000L, report.shortTermGainCents)
        assertEquals(0L, report.longTermGainCents)
    }
}
