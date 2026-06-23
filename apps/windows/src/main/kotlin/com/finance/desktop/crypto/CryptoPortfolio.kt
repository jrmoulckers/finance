// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlin.math.roundToLong

// ─────────────────────────────────────────────────────────────────────────────
// Pure crypto portfolio aggregation model — Issue #2176
//
// This file is intentionally free of Compose, Koin, coroutines and platform
// APIs so the financial maths is fully unit-testable on the JVM with no UI and
// no network. Money is carried as Long cents; quantities (which can be highly
// fractional for crypto) are carried as Double.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A crypto asset the user owns, independent of any live price.
 *
 * @param id Stable identifier for list keys.
 * @param symbol Ticker symbol (e.g. `"BTC"`), matched against [CryptoPrice.symbol].
 * @param name Display name (e.g. `"Bitcoin"`).
 * @param quantity Units held; may be fractional (e.g. `0.0125` BTC).
 * @param costBasisCents Total amount paid to acquire the position, in cents.
 */
data class CryptoHolding(
    val id: String,
    val symbol: String,
    val name: String,
    val quantity: Double,
    val costBasisCents: Long,
)

/**
 * A single holding combined with its latest price and derived metrics.
 *
 * @param allocationPercent Share of the priced portfolio's market value (0..100).
 * @param change24hCents Signed value change over the trailing 24 hours, in cents.
 * @param unrealizedPnlCents Market value minus cost basis, in cents.
 * @param isPriceStale True when the backing quote is older than the staleness window.
 */
data class CryptoPosition(
    val id: String,
    val symbol: String,
    val name: String,
    val quantity: Double,
    val priceCents: Long,
    val marketValueCents: Long,
    val costBasisCents: Long,
    val allocationPercent: Double,
    val change24hCents: Long,
    val change24hPercent: Double,
    val unrealizedPnlCents: Long,
    val unrealizedPnlPercent: Double,
    val isPriceStale: Boolean,
    val priceAsOfEpochMs: Long,
)

/**
 * The fully aggregated portfolio: totals plus per-asset [positions].
 *
 * @param missingPriceSymbols Symbols held but absent from the supplied prices.
 * @param lastUpdatedEpochMs Newest quote timestamp across all positions (0 if none).
 * @param oldestPriceEpochMs Oldest quote timestamp across all positions (0 if none).
 * @param isStale True when any priced position is stale, or holdings have no prices.
 */
data class CryptoPortfolioSummary(
    val totalValueCents: Long,
    val totalCostCents: Long,
    val totalPnlCents: Long,
    val totalPnlPercent: Double,
    val total24hChangeCents: Long,
    val total24hChangePercent: Double,
    val positions: List<CryptoPosition>,
    val missingPriceSymbols: List<String>,
    val lastUpdatedEpochMs: Long,
    val oldestPriceEpochMs: Long,
    val isStale: Boolean,
) {
    val hasData: Boolean get() = positions.isNotEmpty()

    companion object {
        val EMPTY = CryptoPortfolioSummary(
            totalValueCents = 0L,
            totalCostCents = 0L,
            totalPnlCents = 0L,
            totalPnlPercent = 0.0,
            total24hChangeCents = 0L,
            total24hChangePercent = 0.0,
            positions = emptyList(),
            missingPriceSymbols = emptyList(),
            lastUpdatedEpochMs = 0L,
            oldestPriceEpochMs = 0L,
            isStale = false,
        )
    }
}

/**
 * Pure aggregation of holdings against the latest prices.
 *
 * No mutable state, no platform calls — every output is a deterministic function
 * of the inputs, which makes the financial maths straightforward to unit-test.
 */
object CryptoPortfolioAggregator {

    /** Default window after which a quote is treated as stale (2 minutes). */
    const val DEFAULT_STALENESS_MS: Long = 120_000L

    /**
     * Combines [holdings] with [prices] into a [CryptoPortfolioSummary].
     *
     * @param nowEpochMs Current time, used to evaluate per-price staleness.
     * @param stalenessThresholdMs A quote older than this is flagged stale.
     */
    fun aggregate(
        holdings: List<CryptoHolding>,
        prices: List<CryptoPrice>,
        nowEpochMs: Long,
        stalenessThresholdMs: Long = DEFAULT_STALENESS_MS,
    ): CryptoPortfolioSummary {
        if (holdings.isEmpty()) return CryptoPortfolioSummary.EMPTY

        val priceBySymbol = prices.associateBy { it.symbol.uppercase() }
        val missing = holdings
            .map { it.symbol.uppercase() }
            .filter { it !in priceBySymbol }
            .distinct()

        // First pass: market values, so allocation can be a share of the whole.
        data class Priced(val holding: CryptoHolding, val price: CryptoPrice, val valueCents: Long)

        val priced = holdings.mapNotNull { holding ->
            val price = priceBySymbol[holding.symbol.uppercase()] ?: return@mapNotNull null
            val valueCents = (holding.quantity * price.priceCents).roundToLong()
            Priced(holding, price, valueCents)
        }

        if (priced.isEmpty()) {
            return CryptoPortfolioSummary.EMPTY.copy(
                missingPriceSymbols = missing,
                isStale = true,
            )
        }

        val totalValue = priced.sumOf { it.valueCents }

        val positions = priced.map { (holding, price, valueCents) ->
            val priceYesterday = priceYesterdayValue(valueCents, price.change24hPercent)
            val change24h = valueCents - priceYesterday
            val pnl = valueCents - holding.costBasisCents
            CryptoPosition(
                id = holding.id,
                symbol = holding.symbol.uppercase(),
                name = holding.name,
                quantity = holding.quantity,
                priceCents = price.priceCents,
                marketValueCents = valueCents,
                costBasisCents = holding.costBasisCents,
                allocationPercent = percentOf(valueCents, totalValue),
                change24hCents = change24h,
                change24hPercent = price.change24hPercent,
                unrealizedPnlCents = pnl,
                unrealizedPnlPercent = percentOf(pnl, holding.costBasisCents),
                isPriceStale = (nowEpochMs - price.asOfEpochMs) > stalenessThresholdMs,
                priceAsOfEpochMs = price.asOfEpochMs,
            )
        }.sortedByDescending { it.marketValueCents }

        val totalCost = priced.sumOf { it.holding.costBasisCents }
        val totalPnl = totalValue - totalCost
        val total24h = positions.sumOf { it.change24hCents }
        val totalYesterday = totalValue - total24h
        val asOfTimes = priced.map { it.price.asOfEpochMs }

        return CryptoPortfolioSummary(
            totalValueCents = totalValue,
            totalCostCents = totalCost,
            totalPnlCents = totalPnl,
            totalPnlPercent = percentOf(totalPnl, totalCost),
            total24hChangeCents = total24h,
            total24hChangePercent = percentOf(total24h, totalYesterday),
            positions = positions,
            missingPriceSymbols = missing,
            lastUpdatedEpochMs = asOfTimes.max(),
            oldestPriceEpochMs = asOfTimes.min(),
            isStale = positions.any { it.isPriceStale } || missing.isNotEmpty(),
        )
    }

    /**
     * Reconstructs the value 24h ago from the current value and the percent move.
     * `today = yesterday * (1 + pct/100)` so `yesterday = today / (1 + pct/100)`.
     */
    private fun priceYesterdayValue(valueCents: Long, change24hPercent: Double): Long {
        val factor = 1.0 + (change24hPercent / 100.0)
        if (factor <= 0.0) return valueCents
        return (valueCents / factor).roundToLong()
    }

    private fun percentOf(part: Long, whole: Long): Double {
        if (whole == 0L) return 0.0
        return (part.toDouble() / whole.toDouble()) * 100.0
    }
}
