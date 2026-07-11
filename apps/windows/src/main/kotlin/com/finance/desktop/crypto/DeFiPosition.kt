// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

// ─────────────────────────────────────────────────────────────────────────────
// DeFi position model + aggregation — Issue #2172
//
// Yield farmers hold a large part of their portfolio in staking, LP tokens,
// lending markets and farming positions. Wallet balance alone is not their true
// exposure, and pending rewards + unlock dates change usable net worth. This
// pure model tracks those contract positions SEPARATELY from spot holdings and
// aggregates them without any Compose / Koin / network dependency so the maths
// is fully unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

/** The kind of DeFi engagement a position represents. */
enum class DeFiPositionType(val displayName: String) {
    STAKING("Staking"),
    LIQUIDITY_POOL("Liquidity Pool"),
    LENDING("Lending"),
    FARMING("Yield Farming"),
}

/** Whether the underlying asset is currently withdrawable. */
enum class LockState(val displayName: String) {
    /** Freely withdrawable. */
    LIQUID("Liquid"),

    /** Locked until [DeFiPosition.unlockEpochMs]. */
    LOCKED("Locked"),

    /** In an unbonding/cooldown window before it becomes liquid. */
    UNBONDING("Unbonding"),
}

/**
 * A blockchain a position or lot lives on. Chain provenance is first-class so
 * cost basis can survive cross-chain activity (#2168) and exposure can be
 * grouped by chain (#2172).
 */
enum class Chain(val displayName: String, val nativeSymbol: String) {
    ETHEREUM("Ethereum", "ETH"),
    ARBITRUM("Arbitrum", "ARB"),
    OPTIMISM("Optimism", "OP"),
    POLYGON("Polygon", "MATIC"),
    BASE("Base", "ETH"),
    BNB("BNB Chain", "BNB"),
    AVALANCHE("Avalanche", "AVAX"),
    SOLANA("Solana", "SOL"),
    COSMOS("Cosmos", "ATOM"),
    UNKNOWN("Unknown", "?"),
}

/**
 * A single DeFi position (staked asset, LP token, lending deposit or farm).
 *
 * @param assetSymbol The principal asset symbol (e.g. `"ETH"`).
 * @param quantity Units committed to the position (may be fractional).
 * @param valueCents Current market value of the principal, in cents.
 * @param costBasisCents Amount originally committed, in cents.
 * @param apyPercent Advertised/estimated annual percentage yield.
 * @param rewardSymbol Token pending rewards are paid in.
 * @param pendingRewardsCents Value of unclaimed rewards, in cents.
 * @param unlockEpochMs When a [LockState.LOCKED]/[LockState.UNBONDING] position
 *   becomes liquid, or `null` when already liquid / open-ended.
 */
data class DeFiPosition(
    val id: String,
    val protocol: String,
    val chain: Chain,
    val type: DeFiPositionType,
    val assetSymbol: String,
    val quantity: Double,
    val valueCents: Long,
    val costBasisCents: Long,
    val apyPercent: Double,
    val rewardSymbol: String,
    val pendingRewardsCents: Long,
    val lockState: LockState,
    val unlockEpochMs: Long? = null,
) {
    /** Market value plus unclaimed rewards, in cents. */
    val totalValueCents: Long get() = valueCents + pendingRewardsCents

    /** Market value minus cost basis, in cents. */
    val unrealizedPnlCents: Long get() = valueCents - costBasisCents
}

/** Value + share of the DeFi book attributable to a [Chain]. */
data class ChainAllocation(val chain: Chain, val valueCents: Long, val percent: Double)

/** Value + share of the DeFi book attributable to a [DeFiPositionType]. */
data class TypeAllocation(val type: DeFiPositionType, val valueCents: Long, val percent: Double)

/**
 * Aggregated view of all DeFi positions.
 *
 * @param weightedApyPercent Value-weighted APY across positions.
 */
data class DeFiPortfolioSummary(
    val totalValueCents: Long,
    val totalPendingRewardsCents: Long,
    val totalCostCents: Long,
    val totalUnrealizedPnlCents: Long,
    val totalUnrealizedPnlPercent: Double,
    val weightedApyPercent: Double,
    val positions: List<DeFiPosition>,
    val byChain: List<ChainAllocation>,
    val byType: List<TypeAllocation>,
) {
    val hasData: Boolean get() = positions.isNotEmpty()

    companion object {
        val EMPTY = DeFiPortfolioSummary(
            totalValueCents = 0L,
            totalPendingRewardsCents = 0L,
            totalCostCents = 0L,
            totalUnrealizedPnlCents = 0L,
            totalUnrealizedPnlPercent = 0.0,
            weightedApyPercent = 0.0,
            positions = emptyList(),
            byChain = emptyList(),
            byType = emptyList(),
        )
    }
}

/**
 * Portfolio composition splitting liquid spot value from value locked in
 * contracts plus unclaimed rewards, so net-worth views stop under-reporting
 * where money actually is (#2172).
 */
data class PortfolioComposition(
    val spotValueCents: Long,
    val lockedValueCents: Long,
    val pendingRewardsCents: Long,
) {
    /** True total exposure = spot + locked principal + pending rewards. */
    val totalValueCents: Long get() = spotValueCents + lockedValueCents + pendingRewardsCents

    val spotPercent: Double get() = percentOf(spotValueCents, totalValueCents)
    val lockedPercent: Double get() = percentOf(lockedValueCents, totalValueCents)
    val rewardsPercent: Double get() = percentOf(pendingRewardsCents, totalValueCents)

    private fun percentOf(part: Long, whole: Long): Double =
        if (whole == 0L) 0.0 else (part.toDouble() / whole.toDouble()) * 100.0
}

/**
 * Pure aggregation of DeFi positions. Deterministic function of its inputs.
 */
object DeFiPortfolioAggregator {

    /** Aggregates [positions] into a [DeFiPortfolioSummary]. */
    fun aggregate(positions: List<DeFiPosition>): DeFiPortfolioSummary {
        if (positions.isEmpty()) return DeFiPortfolioSummary.EMPTY

        val totalValue = positions.sumOf { it.valueCents }
        val totalRewards = positions.sumOf { it.pendingRewardsCents }
        val totalCost = positions.sumOf { it.costBasisCents }
        val totalPnl = totalValue - totalCost

        val weightedApy = if (totalValue > 0L) {
            positions.sumOf { it.apyPercent * it.valueCents } / totalValue.toDouble()
        } else {
            0.0
        }

        val byChain = positions
            .groupBy { it.chain }
            .map { (chain, group) ->
                val value = group.sumOf { it.valueCents }
                ChainAllocation(chain, value, percentOf(value, totalValue))
            }
            .sortedByDescending { it.valueCents }

        val byType = positions
            .groupBy { it.type }
            .map { (type, group) ->
                val value = group.sumOf { it.valueCents }
                TypeAllocation(type, value, percentOf(value, totalValue))
            }
            .sortedByDescending { it.valueCents }

        return DeFiPortfolioSummary(
            totalValueCents = totalValue,
            totalPendingRewardsCents = totalRewards,
            totalCostCents = totalCost,
            totalUnrealizedPnlCents = totalPnl,
            totalUnrealizedPnlPercent = percentOf(totalPnl, totalCost),
            weightedApyPercent = weightedApy,
            positions = positions.sortedByDescending { it.totalValueCents },
            byChain = byChain,
            byType = byType,
        )
    }

    /**
     * Splits total exposure into spot (liquid wallet) value versus value locked
     * in DeFi contracts plus unclaimed rewards.
     */
    fun compose(spotValueCents: Long, defi: DeFiPortfolioSummary): PortfolioComposition =
        PortfolioComposition(
            spotValueCents = spotValueCents,
            lockedValueCents = defi.totalValueCents,
            pendingRewardsCents = defi.totalPendingRewardsCents,
        )

    private fun percentOf(part: Long, whole: Long): Double =
        if (whole == 0L) 0.0 else (part.toDouble() / whole.toDouble()) * 100.0
}
