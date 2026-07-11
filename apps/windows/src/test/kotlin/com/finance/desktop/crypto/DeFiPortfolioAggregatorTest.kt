// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for the pure DeFi aggregation ([DeFiPortfolioAggregator]) — #2172.
 *
 * Pins the spot-vs-locked separation, value-weighted APY, chain/type grouping
 * and composition maths the DeFi panel depends on. No UI, no network.
 */
class DeFiPortfolioAggregatorTest {

    private fun position(
        id: String,
        chain: Chain,
        type: DeFiPositionType,
        valueCents: Long,
        costBasisCents: Long = valueCents,
        apy: Double = 0.0,
        rewardsCents: Long = 0L,
        lock: LockState = LockState.LIQUID,
    ) = DeFiPosition(
        id = id,
        protocol = "p-$id",
        chain = chain,
        type = type,
        assetSymbol = "ASSET",
        quantity = 1.0,
        valueCents = valueCents,
        costBasisCents = costBasisCents,
        apyPercent = apy,
        rewardSymbol = "R",
        pendingRewardsCents = rewardsCents,
        lockState = lock,
    )

    @Test
    fun `empty positions produce the EMPTY summary`() {
        val summary = DeFiPortfolioAggregator.aggregate(emptyList())
        assertEquals(DeFiPortfolioSummary.EMPTY, summary)
        assertFalse(summary.hasData)
    }

    @Test
    fun `totals sum value, rewards, cost and pnl`() {
        val summary = DeFiPortfolioAggregator.aggregate(
            listOf(
                position("a", Chain.ETHEREUM, DeFiPositionType.STAKING, valueCents = 100_000L, costBasisCents = 80_000L, rewardsCents = 5_000L),
                position("b", Chain.ARBITRUM, DeFiPositionType.LENDING, valueCents = 300_000L, costBasisCents = 300_000L, rewardsCents = 2_000L),
            ),
        )
        assertEquals(400_000L, summary.totalValueCents)
        assertEquals(7_000L, summary.totalPendingRewardsCents)
        assertEquals(380_000L, summary.totalCostCents)
        assertEquals(20_000L, summary.totalUnrealizedPnlCents)
    }

    @Test
    fun `weighted apy is value-weighted not simple average`() {
        val summary = DeFiPortfolioAggregator.aggregate(
            listOf(
                position("a", Chain.ETHEREUM, DeFiPositionType.STAKING, valueCents = 900_000L, apy = 2.0),
                position("b", Chain.BNB, DeFiPositionType.FARMING, valueCents = 100_000L, apy = 42.0),
            ),
        )
        // (0.9*2 + 0.1*42) = 6.0, not the simple mean of 22.0
        assertEquals(6.0, summary.weightedApyPercent, 0.001)
    }

    @Test
    fun `groups by chain and type sorted by value`() {
        val summary = DeFiPortfolioAggregator.aggregate(
            listOf(
                position("a", Chain.ETHEREUM, DeFiPositionType.STAKING, valueCents = 100_000L),
                position("b", Chain.ETHEREUM, DeFiPositionType.LENDING, valueCents = 400_000L),
                position("c", Chain.ARBITRUM, DeFiPositionType.STAKING, valueCents = 250_000L),
            ),
        )
        val eth = summary.byChain.first { it.chain == Chain.ETHEREUM }
        assertEquals(500_000L, eth.valueCents)
        // Highest-value chain sorts first.
        assertEquals(Chain.ETHEREUM, summary.byChain.first().chain)
        val staking = summary.byType.first { it.type == DeFiPositionType.STAKING }
        assertEquals(350_000L, staking.valueCents)
    }

    @Test
    fun `compose separates spot from locked value and rewards`() {
        val defi = DeFiPortfolioAggregator.aggregate(
            listOf(
                position("a", Chain.ETHEREUM, DeFiPositionType.STAKING, valueCents = 300_000L, rewardsCents = 10_000L),
            ),
        )
        val composition = DeFiPortfolioAggregator.compose(spotValueCents = 700_000L, defi = defi)
        assertEquals(700_000L, composition.spotValueCents)
        assertEquals(300_000L, composition.lockedValueCents)
        assertEquals(10_000L, composition.pendingRewardsCents)
        assertEquals(1_010_000L, composition.totalValueCents)
        // Spot ~ 69.3%, locked ~ 29.7%, rewards ~ 0.99%.
        assertEquals(100.0, composition.spotPercent + composition.lockedPercent + composition.rewardsPercent, 0.001)
        assertTrue(composition.spotPercent > composition.lockedPercent)
    }

    @Test
    fun `positions ordered by total value including rewards`() {
        val summary = DeFiPortfolioAggregator.aggregate(
            listOf(
                position("small", Chain.ETHEREUM, DeFiPositionType.STAKING, valueCents = 100_000L, rewardsCents = 0L),
                position("big", Chain.BNB, DeFiPositionType.FARMING, valueCents = 90_000L, rewardsCents = 50_000L),
            ),
        )
        // big has 140k total (value+rewards) vs small's 100k.
        assertEquals("big", summary.positions.first().id)
    }
}
