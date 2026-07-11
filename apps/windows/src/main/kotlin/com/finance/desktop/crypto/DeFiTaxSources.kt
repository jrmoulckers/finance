// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

// ─────────────────────────────────────────────────────────────────────────────
// DeFi position + tax-event sources — Issues #2172, #2168, #2702
//
// Abstracts where DeFi positions and taxable crypto events come from so the
// live SQLDelight-backed path can be swapped in without touching the ViewModel
// or UI. Until the #2702 pipeline + credentials land, deterministic offline
// samples supply clearly-labelled illustrative data with NO network access.
// ─────────────────────────────────────────────────────────────────────────────

/** Supplies the user's DeFi positions (staking, LP, lending, farming). */
interface DeFiHoldingsSource {
    suspend fun positions(): List<DeFiPosition>
}

/** Supplies the user's taxable crypto events across wallets and chains. */
interface CryptoTaxEventSource {
    suspend fun events(): List<CryptoTaxEvent>
}

/**
 * Deterministic, offline DeFi positions used until real holdings are wired
 * (#2702). Figures are illustrative, not financial advice.
 */
class SampleDeFiHoldingsSource : DeFiHoldingsSource {
    override suspend fun positions(): List<DeFiPosition> = listOf(
        DeFiPosition(
            id = "d-eth-lido",
            protocol = "Lido",
            chain = Chain.ETHEREUM,
            type = DeFiPositionType.STAKING,
            assetSymbol = "stETH",
            quantity = 4.20,
            valueCents = 1_476_000L,
            costBasisCents = 1_180_000L,
            apyPercent = 3.4,
            rewardSymbol = "stETH",
            pendingRewardsCents = 12_400L,
            lockState = LockState.LIQUID,
        ),
        DeFiPosition(
            id = "d-usdc-aave",
            protocol = "Aave v3",
            chain = Chain.ARBITRUM,
            type = DeFiPositionType.LENDING,
            assetSymbol = "USDC",
            quantity = 12_500.0,
            valueCents = 1_250_000L,
            costBasisCents = 1_250_000L,
            apyPercent = 5.1,
            rewardSymbol = "ARB",
            pendingRewardsCents = 8_900L,
            lockState = LockState.LIQUID,
        ),
        DeFiPosition(
            id = "d-eth-usdc-uni",
            protocol = "Uniswap v3",
            chain = Chain.OPTIMISM,
            type = DeFiPositionType.LIQUIDITY_POOL,
            assetSymbol = "ETH/USDC",
            quantity = 1.0,
            valueCents = 940_000L,
            costBasisCents = 900_000L,
            apyPercent = 18.7,
            rewardSymbol = "OP",
            pendingRewardsCents = 21_500L,
            lockState = LockState.LIQUID,
        ),
        DeFiPosition(
            id = "d-dot-stake",
            protocol = "Polkadot",
            chain = Chain.UNKNOWN,
            type = DeFiPositionType.STAKING,
            assetSymbol = "DOT",
            quantity = 940.0,
            valueCents = 770_800L,
            costBasisCents = 810_000L,
            apyPercent = 14.2,
            rewardSymbol = "DOT",
            pendingRewardsCents = 15_600L,
            lockState = LockState.UNBONDING,
            unlockEpochMs = 0L,
        ),
        DeFiPosition(
            id = "d-cake-farm",
            protocol = "PancakeSwap",
            chain = Chain.BNB,
            type = DeFiPositionType.FARMING,
            assetSymbol = "CAKE-BNB",
            quantity = 320.0,
            valueCents = 512_000L,
            costBasisCents = 600_000L,
            apyPercent = 42.5,
            rewardSymbol = "CAKE",
            pendingRewardsCents = 9_800L,
            lockState = LockState.LOCKED,
            unlockEpochMs = 0L,
        ),
    )
}

/**
 * Deterministic, offline taxable-event history spanning buys, swaps, a bridge,
 * a wrap, staking rewards and an airdrop across multiple chains and wallets, so
 * the chain-aware cost-basis engine (#2168) can be demonstrated and tested.
 */
class SampleCryptoTaxEventSource : CryptoTaxEventSource {
    private val day = 24L * 60 * 60 * 1000

    override suspend fun events(): List<CryptoTaxEvent> = listOf(
        CryptoTaxEvent(
            id = "t1", type = TaxEventType.BUY, timestampEpochMs = 0L,
            walletId = "hot", chain = Chain.ETHEREUM,
            assetSymbol = "ETH", assetQuantity = 5.0, valueCents = 900_000L, feeCents = 1_200L,
        ),
        CryptoTaxEvent(
            id = "t2", type = TaxEventType.AIRDROP, timestampEpochMs = 30 * day,
            walletId = "hot", chain = Chain.ARBITRUM,
            assetSymbol = "ARB", assetQuantity = 1_250.0, valueCents = 137_500L,
        ),
        CryptoTaxEvent(
            id = "t3", type = TaxEventType.STAKING_REWARD, timestampEpochMs = 60 * day,
            walletId = "hot", chain = Chain.ETHEREUM,
            assetSymbol = "ETH", assetQuantity = 0.15, valueCents = 33_000L,
        ),
        CryptoTaxEvent(
            id = "t4", type = TaxEventType.BRIDGE, timestampEpochMs = 90 * day,
            walletId = "hot", chain = Chain.ETHEREUM,
            assetSymbol = "ETH", assetQuantity = 2.0, valueCents = 460_000L, feeCents = 900L,
            destinationChain = Chain.OPTIMISM, destinationWalletId = "hot",
        ),
        CryptoTaxEvent(
            id = "t5", type = TaxEventType.SWAP, timestampEpochMs = 120 * day,
            walletId = "hot", chain = Chain.OPTIMISM,
            assetSymbol = "ETH", assetQuantity = 1.0, valueCents = 250_000L, feeCents = 400L,
            counterAssetSymbol = "USDC", counterAssetQuantity = 2_500.0,
        ),
        CryptoTaxEvent(
            id = "t6", type = TaxEventType.SELL, timestampEpochMs = 400 * day,
            walletId = "hot", chain = Chain.ETHEREUM,
            assetSymbol = "ETH", assetQuantity = 1.0, valueCents = 300_000L, feeCents = 500L,
        ),
    )
}
