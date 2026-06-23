// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlin.math.absoluteValue

// ─────────────────────────────────────────────────────────────────────────────
// Pluggable crypto price source — Issue #2176
//
// The dashboard reads near-real-time prices through this interface so the
// concrete feed can be swapped without touching aggregation or UI code.
//
// NOTE: A live market-data adapter is intentionally NOT wired here. The live
// refresh pipeline (#2702) is blocked on market-data credentials. Until those
// land, the app ships with [MockCryptoPriceSource] — a deterministic, offline
// adapter that requires no network access and NO API keys.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A spot price for a single crypto asset, captured at a point in time.
 *
 * @param symbol Ticker symbol (e.g. `"BTC"`). Matched against holdings.
 * @param priceCents Price per whole unit, in cents, to avoid float drift.
 * @param change24hPercent Signed 24-hour move as a percent (e.g. `-3.5` = down 3.5%).
 * @param asOfEpochMs Wall-clock time the quote was observed (epoch millis).
 */
data class CryptoPrice(
    val symbol: String,
    val priceCents: Long,
    val change24hPercent: Double,
    val asOfEpochMs: Long,
)

/**
 * Source of near-real-time crypto prices.
 *
 * Implementations may poll an HTTP API, subscribe to a websocket, or (as in
 * [MockCryptoPriceSource]) generate deterministic offline data. The aggregation
 * layer ([CryptoPortfolioAggregator]) and UI depend only on this contract.
 */
interface CryptoPriceSource {
    /** The human-readable name of this source, shown in diagnostics. */
    val sourceName: String

    /** Returns the latest known price for each requested [symbols] entry. */
    suspend fun latestPrices(symbols: List<String>): List<CryptoPrice>
}

/**
 * Deterministic, offline price source used until the live feed (#2702) is wired.
 *
 * Prices oscillate slightly on every call using a pure, seedable function so the
 * dashboard's refresh and staleness behaviour can be demonstrated and tested
 * without any network access or credentials.
 *
 * @param clock Supplies the current epoch-millis timestamp stamped on each quote.
 * @param seedPrices Base price (cents) and 24h move (percent) per symbol.
 */
class MockCryptoPriceSource(
    private val clock: () -> Long = { 0L },
    private val seedPrices: Map<String, Pair<Long, Double>> = DEFAULT_SEED,
) : CryptoPriceSource {

    override val sourceName: String = "Mock (offline)"

    private var tick: Long = 0L

    override suspend fun latestPrices(symbols: List<String>): List<CryptoPrice> {
        tick += 1
        val now = clock()
        return symbols.mapNotNull { symbol ->
            val seed = seedPrices[symbol.uppercase()] ?: return@mapNotNull null
            val (basePrice, baseChange) = seed
            // Pure, bounded oscillation derived from the symbol + tick — no RNG,
            // so repeated runs in tests and CI are fully reproducible.
            val wobble = oscillation(symbol, tick)
            val priceCents = (basePrice + (basePrice * wobble / 100.0)).toLong().coerceAtLeast(1L)
            CryptoPrice(
                symbol = symbol.uppercase(),
                priceCents = priceCents,
                change24hPercent = baseChange + wobble,
                asOfEpochMs = now,
            )
        }
    }

    private fun oscillation(symbol: String, tick: Long): Double {
        val phase = (symbol.sumOf { it.code } + tick * 7) % 20
        return (phase - 10) / 10.0 // range roughly [-1.0, +0.9]
    }

    companion object {
        /** Illustrative seed data. Replaced by the live feed under #2702. */
        val DEFAULT_SEED: Map<String, Pair<Long, Double>> = mapOf(
            "BTC" to (6_412_300L to 2.4),
            "ETH" to (351_900L to -1.8),
            "SOL" to (14_250L to 5.1),
            "ADA" to (62L to -0.7),
            "DOT" to (820L to 1.2),
        )
    }
}

/**
 * Wraps any [CryptoPriceSource] in a polling [Flow] that re-emits prices on a
 * fixed interval. This is the pluggable "polling adapter" the dashboard uses for
 * near-real-time refresh while the live websocket feed (#2702) is unavailable.
 *
 * @param source Underlying price source to poll.
 * @param intervalMs Delay between successive polls.
 */
class PollingPriceFeed(
    private val source: CryptoPriceSource,
    private val intervalMs: Long = 30_000L,
) {
    /** Emits a fresh price list immediately, then once per [intervalMs]. */
    fun stream(symbols: List<String>): Flow<List<CryptoPrice>> = flow {
        require(intervalMs > 0) { "intervalMs must be positive, got $intervalMs" }
        while (true) {
            emit(source.latestPrices(symbols))
            delay(intervalMs.absoluteValue)
        }
    }
}
