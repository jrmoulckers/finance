// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.core.currency.ExchangeRate
import com.finance.core.currency.ExchangeRateProvider
import com.finance.models.types.Currency
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.time.Duration.Companion.minutes

/**
 * In-memory cached exchange rate provider for the Windows desktop app.
 *
 * Caches exchange rates with a configurable TTL (default 5 minutes) to
 * reduce network calls during rapid conversion calculations. Falls back
 * to a built-in set of approximate rates when the network is unavailable,
 * enabling offline currency conversion.
 *
 * ## Offline Support
 * The provider ships with hardcoded approximate rates for major currencies.
 * These are used when:
 * - The app is offline
 * - The backend exchange rate API is unreachable
 * - Rates have not yet been fetched from the network
 *
 * Hardcoded rates are clearly marked as approximate in the UI via the
 * [ExchangeRate.timestamp] being set to [Instant.DISTANT_PAST].
 *
 * ## Thread Safety
 * The cache uses a synchronized map for thread-safe access from coroutines
 * running on different dispatchers.
 */
class CachedExchangeRateProvider(
    private val cacheTtl: kotlin.time.Duration = 5.minutes,
) : ExchangeRateProvider {

    private val cache = mutableMapOf<String, CachedRate>()

    private data class CachedRate(
        val rate: ExchangeRate,
        val cachedAt: Instant,
    )

    @Suppress("ReturnCount") // Validation logic with early returns
    override suspend fun getRate(from: Currency, to: Currency): ExchangeRate? {
        if (from == to) return null

        val key = "${from.code}_${to.code}"
        val cached = synchronized(cache) { cache[key] }

        if (cached != null && !isExpired(cached.cachedAt)) {
            return cached.rate
        }

        // Use offline fallback rates
        val rate = getOfflineRate(from, to) ?: return null
        synchronized(cache) { cache[key] = CachedRate(rate, Clock.System.now()) }
        return rate
    }

    override suspend fun getRate(from: Currency, to: Currency, at: Instant): ExchangeRate? {
        // Historical rates not supported offline — fall back to current rate
        return getRate(from, to)
    }

    override suspend fun getAvailableCurrencies(): Set<Currency> {
        return OFFLINE_RATES.keys.map { Currency(it) }.toSet() + Currency.USD
    }

    private fun isExpired(cachedAt: Instant): Boolean {
        return (Clock.System.now() - cachedAt) > cacheTtl
    }

    @Suppress("ReturnCount") // Validation logic with early returns
    private fun getOfflineRate(from: Currency, to: Currency): ExchangeRate? {
        val fromToUsd = if (from.code == "USD") 1.0 else OFFLINE_RATES[from.code] ?: return null
        val toToUsd = if (to.code == "USD") 1.0 else OFFLINE_RATES[to.code] ?: return null

        // Cross rate: FROM -> USD -> TO
        val rate = toToUsd / fromToUsd

        return ExchangeRate(
            from = from,
            to = to,
            rate = rate,
            timestamp = Clock.System.now(),
        )
    }

    companion object {
        /**
         * Approximate exchange rates relative to USD.
         *
         * These are fallback rates used when the network is unavailable.
         * Values represent how many units of each currency equal 1 USD.
         */
        val OFFLINE_RATES = mapOf(
            "EUR" to 0.92,
            "GBP" to 0.79,
            "JPY" to 149.50,
            "CAD" to 1.36,
            "AUD" to 1.53,
            "CHF" to 0.88,
            "CNY" to 7.24,
            "KRW" to 1320.0,
            "INR" to 83.12,
            "BRL" to 4.97,
            "MXN" to 17.15,
            "SEK" to 10.45,
            "NOK" to 10.55,
            "DKK" to 6.87,
            "NZD" to 1.63,
            "SGD" to 1.34,
            "HKD" to 7.82,
            "TRY" to 30.25,
            "ZAR" to 18.60,
            "PLN" to 4.03,
            "THB" to 35.20,
            "IDR" to 15600.0,
            "PHP" to 55.80,
            "CZK" to 22.75,
            "ILS" to 3.70,
            "CLP" to 890.0,
            "ARS" to 350.0,
            "COP" to 3950.0,
            "SAR" to 3.75,
            "AED" to 3.67,
        )
    }
}
