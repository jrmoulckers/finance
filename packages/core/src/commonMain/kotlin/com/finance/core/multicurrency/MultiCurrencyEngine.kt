// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.core.money.MoneyOperations
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable

/**
 * Multi-Currency Engine — ISO 4217 catalog, exchange rate caching, conversion, aggregation.
 * All monetary values use [Cents] (Long-backed). All dates use kotlinx-datetime.
 */
object MultiCurrencyEngine {

    val currencyCatalog: Map<String, CurrencyInfo> = mapOf(
        "USD" to CurrencyInfo("USD", "US Dollar", "$", 2),
        "EUR" to CurrencyInfo("EUR", "Euro", "\u20AC", 2),
        "GBP" to CurrencyInfo("GBP", "British Pound", "\u00A3", 2),
        "JPY" to CurrencyInfo("JPY", "Japanese Yen", "\u00A5", 0),
        "CAD" to CurrencyInfo("CAD", "Canadian Dollar", "CA$", 2),
        "AUD" to CurrencyInfo("AUD", "Australian Dollar", "A$", 2),
        "CHF" to CurrencyInfo("CHF", "Swiss Franc", "CHF", 2),
        "CNY" to CurrencyInfo("CNY", "Chinese Yuan", "\u00A5", 2),
        "INR" to CurrencyInfo("INR", "Indian Rupee", "\u20B9", 2),
        "MXN" to CurrencyInfo("MXN", "Mexican Peso", "MX$", 2),
        "BRL" to CurrencyInfo("BRL", "Brazilian Real", "R$", 2),
        "KRW" to CurrencyInfo("KRW", "South Korean Won", "\u20A9", 0),
        "SEK" to CurrencyInfo("SEK", "Swedish Krona", "kr", 2),
        "BHD" to CurrencyInfo("BHD", "Bahraini Dinar", "BD", 3),
        "KWD" to CurrencyInfo("KWD", "Kuwaiti Dinar", "KD", 3),
        "OMR" to CurrencyInfo("OMR", "Omani Rial", "OMR", 3),
    )

    fun currencyInfo(currency: Currency): CurrencyInfo? = currencyCatalog[currency.code]

    class ExchangeRateCache(val maxAgeSeconds: Long = 3600) {
        private val cache = mutableMapOf<String, CachedRate>()

        fun put(from: Currency, to: Currency, rate: Double, timestamp: Instant) {
            require(rate > 0) { "Exchange rate must be positive" }
            cache[cacheKey(from, to)] = CachedRate(rate, timestamp)
        }

        fun get(from: Currency, to: Currency, now: Instant = Clock.System.now()): Double? {
            if (from == to) return 1.0
            cache[cacheKey(from, to)]?.let { if (!isStale(it, now)) return it.rate }
            cache[cacheKey(to, from)]?.let { if (!isStale(it, now)) return 1.0 / it.rate }
            return null
        }

        fun putAll(rates: Map<Pair<Currency, Currency>, Double>, timestamp: Instant) { for ((pair, rate) in rates) put(pair.first, pair.second, rate, timestamp) }
        fun clear() { cache.clear() }
        val size: Int get() = cache.size
        private fun cacheKey(from: Currency, to: Currency) = "${from.code}/${to.code}"
        private fun isStale(cached: CachedRate, now: Instant) = (now.epochSeconds - cached.timestamp.epochSeconds) > maxAgeSeconds
    }

    fun convert(amount: Cents, rate: Double): Cents {
        require(rate > 0) { "Exchange rate must be positive" }
        return MoneyOperations.multiply(amount, rate)
    }

    fun convertWithCache(amount: Cents, from: Currency, to: Currency, cache: ExchangeRateCache, now: Instant = Clock.System.now()): ConversionResult? {
        if (from == to) return ConversionResult(amount, amount, from, to, 1.0)
        val rate = cache.get(from, to, now) ?: return null
        return ConversionResult(amount, convert(amount, rate), from, to, rate)
    }

    fun aggregate(amounts: List<CurrencyAmount>, targetCurrency: Currency, cache: ExchangeRateCache, now: Instant = Clock.System.now()): AggregationResult? {
        val conversions = mutableListOf<ConversionResult>(); var total = Cents.ZERO
        for (ca in amounts) {
            if (ca.currency == targetCurrency) { total = total + ca.amount; conversions.add(ConversionResult(ca.amount, ca.amount, ca.currency, targetCurrency, 1.0)) }
            else { val rate = cache.get(ca.currency, targetCurrency, now) ?: return null; val converted = convert(ca.amount, rate); total = total + converted; conversions.add(ConversionResult(ca.amount, converted, ca.currency, targetCurrency, rate)) }
        }
        return AggregationResult(total, targetCurrency, conversions)
    }

    fun currencyBreakdown(amounts: List<CurrencyAmount>, targetCurrency: Currency, cache: ExchangeRateCache, now: Instant = Clock.System.now()): Map<Currency, Double>? {
        val result = aggregate(amounts, targetCurrency, cache, now) ?: return null
        if (result.totalAmount.isZero()) return emptyMap()
        return result.conversions.groupBy { it.fromCurrency }.mapValues { (_, convs) -> (convs.sumOf { it.convertedAmount.amount }.toDouble() / result.totalAmount.amount) * 100.0 }
    }
}

@Serializable data class CurrencyInfo(val code: String, val displayName: String, val symbol: String, val decimalPlaces: Int)
data class CachedRate(val rate: Double, val timestamp: Instant)
data class CurrencyAmount(val amount: Cents, val currency: Currency)
data class ConversionResult(val originalAmount: Cents, val convertedAmount: Cents, val fromCurrency: Currency, val toCurrency: Currency, val rateUsed: Double)
data class AggregationResult(val totalAmount: Cents, val targetCurrency: Currency, val conversions: List<ConversionResult>) { val currencyCount: Int get() = conversions.map { it.fromCurrency }.distinct().size }
