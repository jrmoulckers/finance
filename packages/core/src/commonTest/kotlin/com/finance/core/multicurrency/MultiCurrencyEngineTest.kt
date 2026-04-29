// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlin.test.*

class MultiCurrencyEngineTest {

    private val now = Instant.parse("2024-06-15T12:00:00Z")

    @Test fun catalog_commonCurrencies() { assertNotNull(MultiCurrencyEngine.currencyCatalog["USD"]); assertNotNull(MultiCurrencyEngine.currencyCatalog["EUR"]); assertNotNull(MultiCurrencyEngine.currencyCatalog["JPY"]) }
    @Test fun currencyInfo_usd() { val i = MultiCurrencyEngine.currencyInfo(Currency.USD)!!; assertEquals("US Dollar", i.displayName); assertEquals("$", i.symbol); assertEquals(2, i.decimalPlaces) }
    @Test fun currencyInfo_jpyZeroDecimals() { assertEquals(0, MultiCurrencyEngine.currencyInfo(Currency.JPY)!!.decimalPlaces) }

    @Test fun cache_storeRetrieve() { val c = MultiCurrencyEngine.ExchangeRateCache(); c.put(Currency.USD, Currency.EUR, 0.85, now); assertEquals(0.85, c.get(Currency.USD, Currency.EUR, now)!!, 0.0001) }
    @Test fun cache_sameCurrency() { assertEquals(1.0, MultiCurrencyEngine.ExchangeRateCache().get(Currency.USD, Currency.USD, now)) }
    @Test fun cache_inverse() { val c = MultiCurrencyEngine.ExchangeRateCache(); c.put(Currency.USD, Currency.EUR, 0.85, now); assertEquals(1.0 / 0.85, c.get(Currency.EUR, Currency.USD, now)!!, 0.0001) }
    @Test fun cache_stale() { val c = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = 3600); c.put(Currency.USD, Currency.EUR, 0.85, now); assertNull(c.get(Currency.USD, Currency.EUR, Instant.fromEpochSeconds(now.epochSeconds + 7200))) }
    @Test fun cache_fresh() { val c = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = 3600); c.put(Currency.USD, Currency.EUR, 0.85, now); assertNotNull(c.get(Currency.USD, Currency.EUR, Instant.fromEpochSeconds(now.epochSeconds + 1800))) }
    @Test fun cache_clear() { val c = MultiCurrencyEngine.ExchangeRateCache(); c.put(Currency.USD, Currency.EUR, 0.85, now); c.put(Currency.USD, Currency.GBP, 0.72, now); assertEquals(2, c.size); c.clear(); assertEquals(0, c.size) }
    @Test fun cache_putAll() { val c = MultiCurrencyEngine.ExchangeRateCache(); c.putAll(mapOf((Currency.USD to Currency.EUR) to 0.85, (Currency.USD to Currency.GBP) to 0.72, (Currency.USD to Currency.JPY) to 110.0), now); assertEquals(3, c.size); assertEquals(0.85, c.get(Currency.USD, Currency.EUR, now)!!, 0.0001) }

    @Test fun convert_basic() { assertEquals(Cents(8500), MultiCurrencyEngine.convert(Cents(10000), 0.85)) }
    @Test fun convert_zero() { assertEquals(Cents.ZERO, MultiCurrencyEngine.convert(Cents.ZERO, 0.85)) }
    @Test fun convert_negRate() { assertFailsWith<IllegalArgumentException> { MultiCurrencyEngine.convert(Cents(10000), -0.85) } }

    @Test fun convertWithCache_same() { val r = MultiCurrencyEngine.convertWithCache(Cents(10000), Currency.USD, Currency.USD, MultiCurrencyEngine.ExchangeRateCache(), now)!!; assertEquals(Cents(10000), r.convertedAmount); assertEquals(1.0, r.rateUsed) }
    @Test fun convertWithCache_withRate() { val c = MultiCurrencyEngine.ExchangeRateCache(); c.put(Currency.USD, Currency.EUR, 0.85, now); assertEquals(Cents(8500), MultiCurrencyEngine.convertWithCache(Cents(10000), Currency.USD, Currency.EUR, c, now)!!.convertedAmount) }
    @Test fun convertWithCache_noRate() { assertNull(MultiCurrencyEngine.convertWithCache(Cents(10000), Currency.USD, Currency.EUR, MultiCurrencyEngine.ExchangeRateCache(), now)) }

    @Test fun aggregate_singleCurrency() { val r = MultiCurrencyEngine.aggregate(listOf(CurrencyAmount(Cents(10000), Currency.USD), CurrencyAmount(Cents(20000), Currency.USD)), Currency.USD, MultiCurrencyEngine.ExchangeRateCache(), now)!!; assertEquals(Cents(30000), r.totalAmount); assertEquals(1, r.currencyCount) }
    @Test fun aggregate_multi() { val c = MultiCurrencyEngine.ExchangeRateCache(); c.put(Currency.EUR, Currency.USD, 1.18, now); val r = MultiCurrencyEngine.aggregate(listOf(CurrencyAmount(Cents(10000), Currency.USD), CurrencyAmount(Cents(10000), Currency.EUR)), Currency.USD, c, now)!!; assertEquals(Cents(21800), r.totalAmount); assertEquals(2, r.currencyCount) }
    @Test fun aggregate_missingRate() { assertNull(MultiCurrencyEngine.aggregate(listOf(CurrencyAmount(Cents(10000), Currency.USD), CurrencyAmount(Cents(10000), Currency.EUR)), Currency.USD, MultiCurrencyEngine.ExchangeRateCache(), now)) }
    @Test fun aggregate_empty() { val r = MultiCurrencyEngine.aggregate(emptyList(), Currency.USD, MultiCurrencyEngine.ExchangeRateCache(), now)!!; assertEquals(Cents.ZERO, r.totalAmount) }

    @Test fun breakdown() { val c = MultiCurrencyEngine.ExchangeRateCache(); c.put(Currency.EUR, Currency.USD, 1.0, now); val b = MultiCurrencyEngine.currencyBreakdown(listOf(CurrencyAmount(Cents(75000), Currency.USD), CurrencyAmount(Cents(25000), Currency.EUR)), Currency.USD, c, now)!!; assertEquals(75.0, b[Currency.USD]!!, 0.01); assertEquals(25.0, b[Currency.EUR]!!, 0.01) }
    @Test fun breakdown_missingRate() { assertNull(MultiCurrencyEngine.currencyBreakdown(listOf(CurrencyAmount(Cents(50000), Currency.USD), CurrencyAmount(Cents(50000), Currency.EUR)), Currency.USD, MultiCurrencyEngine.ExchangeRateCache(), now)) }
}
