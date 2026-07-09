// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Tests for [MultiCurrencyReportAggregator] partial-coverage aggregation (#3723).
 */
class MultiCurrencyReportAggregatorTest {

    private val now = Instant.fromEpochSeconds(1_000_000L)
    private val chf = Currency("CHF")

    private fun cache(): MultiCurrencyEngine.ExchangeRateCache {
        val c = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = Long.MAX_VALUE / 2)
        c.put(Currency.EUR, Currency.USD, 1.085, now)
        c.put(Currency.GBP, Currency.USD, 1.27, now)
        return c
    }

    @Test
    fun aggregate_fullCoverage_sumsAllAndReportsNoUnconverted() {
        val result = MultiCurrencyReportAggregator.aggregate(
            listOf(
                CurrencyAmount(Cents(10000L), Currency.USD),
                CurrencyAmount(Cents(10000L), Currency.EUR), // 10850
                CurrencyAmount(Cents(10000L), Currency.GBP), // 12700
            ),
            Currency.USD, cache(), now,
        )

        assertEquals(Cents(33550L), result.totalInDisplayCurrency)
        assertFalse(result.hasUnconvertedAmounts)
        assertTrue(result.unconvertedCurrencies.isEmpty())
        assertEquals(setOf(Currency.USD, Currency.EUR, Currency.GBP), result.convertedCurrencies)
        assertEquals(3, result.currencyCount)
    }

    @Test
    fun aggregate_partialCoverage_sumsConvertibleAndReportsMissing() {
        val result = MultiCurrencyReportAggregator.aggregate(
            listOf(
                CurrencyAmount(Cents(10000L), Currency.EUR), // 10850
                CurrencyAmount(Cents(50000L), chf), // no rate
            ),
            Currency.USD, cache(), now,
        )

        // Only the EUR amount is included; CHF is excluded and disclosed.
        assertEquals(Cents(10850L), result.totalInDisplayCurrency)
        assertTrue(result.hasUnconvertedAmounts)
        assertEquals(setOf(chf), result.unconvertedCurrencies)
        assertEquals(setOf(Currency.EUR), result.convertedCurrencies)
        assertEquals(1, result.lineItems.size)
    }

    @Test
    fun aggregate_zeroCoverage_returnsZeroTotalAndAllUnconverted() {
        val emptyCache = MultiCurrencyEngine.ExchangeRateCache()
        val result = MultiCurrencyReportAggregator.aggregate(
            listOf(
                CurrencyAmount(Cents(10000L), Currency.EUR),
                CurrencyAmount(Cents(10000L), Currency.GBP),
            ),
            Currency.USD, emptyCache, now,
        )

        assertEquals(Cents.ZERO, result.totalInDisplayCurrency)
        assertTrue(result.hasUnconvertedAmounts)
        assertEquals(setOf(Currency.EUR, Currency.GBP), result.unconvertedCurrencies)
        assertTrue(result.convertedCurrencies.isEmpty())
        assertTrue(result.lineItems.isEmpty())
    }

    @Test
    fun aggregate_sameCurrencyOnly_needsNoRates() {
        val result = MultiCurrencyReportAggregator.aggregate(
            listOf(
                CurrencyAmount(Cents(2500L), Currency.USD),
                CurrencyAmount(Cents(7500L), Currency.USD),
            ),
            Currency.USD, MultiCurrencyEngine.ExchangeRateCache(), now,
        )

        assertEquals(Cents(10000L), result.totalInDisplayCurrency)
        assertFalse(result.hasUnconvertedAmounts)
        assertFalse(result.hasStaleRates)
    }

    @Test
    fun aggregate_staleRate_isFlaggedButStillCounted() {
        val shortTtlCache = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = 1)
        val old = Instant.fromEpochSeconds(1_000L)
        shortTtlCache.put(Currency.EUR, Currency.USD, 1.085, old)

        val result = MultiCurrencyReportAggregator.aggregate(
            listOf(CurrencyAmount(Cents(10000L), Currency.EUR)),
            Currency.USD, shortTtlCache, now,
        )

        assertEquals(Cents(10850L), result.totalInDisplayCurrency)
        assertTrue(result.hasStaleRates)
        assertTrue(result.lineItems.single().isStale)
        assertFalse(result.hasUnconvertedAmounts)
    }
}
