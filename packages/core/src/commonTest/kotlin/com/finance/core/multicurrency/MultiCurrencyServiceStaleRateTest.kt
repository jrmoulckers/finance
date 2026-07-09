// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for the stale/offline-rate disclosure fixes in [MultiCurrencyService]
 * (#3697, #3703): `convertAtEntry.isOfflineRate`, `aggregateForReport` stale
 * flagging, and the previously no-op `aggregateOffline`.
 */
class MultiCurrencyServiceStaleRateTest {

    private val t0 = Instant.fromEpochSeconds(1_000_000L)
    private val withinTtl = Instant.fromEpochSeconds(1_000_000L + 60L) // +1 min
    private val pastTtl = Instant.fromEpochSeconds(1_000_000L + 7_200L) // +2 h (TTL = 1 h)

    private fun cache() = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = 3600)

    // ── convertAtEntry: isOfflineRate ────────────────────────────────

    @Test
    fun convertAtEntry_freshRate_isNotOffline() {
        val cache = cache()
        cache.put(Currency.EUR, Currency.USD, 1.085, t0)

        val result = MultiCurrencyService.convertAtEntry(
            Cents(10000L), Currency.EUR, Currency.USD, cache, withinTtl,
        )

        assertNotNull(result)
        assertEquals(Cents(10850L), result.convertedAmount)
        assertFalse(result.isOfflineRate, "Fresh cached rate must not be flagged offline")
        assertEquals(t0, result.rateTimestamp, "Rate timestamp should be the cached rate's asOf")
    }

    @Test
    fun convertAtEntry_staleRate_isFlaggedOffline() {
        val cache = cache()
        cache.put(Currency.EUR, Currency.USD, 1.085, t0)

        val result = MultiCurrencyService.convertAtEntry(
            Cents(10000L), Currency.EUR, Currency.USD, cache, pastTtl,
        )

        assertNotNull(result, "A stale rate should still produce a (flagged) conversion offline")
        assertEquals(Cents(10850L), result.convertedAmount)
        assertTrue(result.isOfflineRate, "Stale cached rate must be flagged as offline")
    }

    @Test
    fun convertAtEntry_sameCurrency_isNotOffline() {
        val result = MultiCurrencyService.convertAtEntry(
            Cents(5000L), Currency.USD, Currency.USD, cache(), pastTtl,
        )
        assertNotNull(result)
        assertFalse(result.isOfflineRate)
        assertEquals(1.0, result.rateUsed)
    }

    // ── aggregateForReport: stale flagging ───────────────────────────

    @Test
    fun aggregateForReport_allFresh_noStaleFlag() {
        val cache = cache()
        cache.put(Currency.EUR, Currency.USD, 1.085, withinTtl)
        cache.put(Currency.GBP, Currency.USD, 1.27, withinTtl)

        val result = MultiCurrencyService.aggregateForReport(
            listOf(
                CurrencyAmount(Cents(10000L), Currency.EUR),
                CurrencyAmount(Cents(10000L), Currency.GBP),
            ),
            Currency.USD, cache, withinTtl,
        )

        assertNotNull(result)
        assertFalse(result.hasStaleRates)
        assertTrue(result.lineItems.none { it.isStale })
    }

    @Test
    fun aggregateForReport_mixedFreshAndStale_flagsOnlyStaleLine() {
        val cache = cache()
        cache.put(Currency.EUR, Currency.USD, 1.085, pastTtl) // fresh relative to pastTtl
        cache.put(Currency.GBP, Currency.USD, 1.27, t0) // old → stale at pastTtl

        val result = MultiCurrencyService.aggregateForReport(
            listOf(
                CurrencyAmount(Cents(10000L), Currency.EUR),
                CurrencyAmount(Cents(10000L), Currency.GBP),
            ),
            Currency.USD, cache, pastTtl,
        )

        assertNotNull(result)
        assertTrue(result.hasStaleRates, "At least one stale rate should set hasStaleRates")
        val eur = result.lineItems.first { it.sourceCurrency == Currency.EUR }
        val gbp = result.lineItems.first { it.sourceCurrency == Currency.GBP }
        assertFalse(eur.isStale)
        assertTrue(gbp.isStale)
    }

    @Test
    fun aggregateForReport_missingRate_returnsNull() {
        val result = MultiCurrencyService.aggregateForReport(
            listOf(CurrencyAmount(Cents(10000L), Currency.EUR)),
            Currency.USD, cache(), withinTtl,
        )
        assertNull(result)
    }

    // ── aggregateOffline: real implementation ────────────────────────

    @Test
    fun aggregateOffline_usesStaleRate_andFlagsIt() {
        // TTL is short; the rate is old. Plain get() would drop it, but the
        // offline path must still use it (flagged).
        val cache = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = 1)
        cache.put(Currency.EUR, Currency.USD, 1.085, t0)
        val staleCutoff = Instant.fromEpochSeconds(1_000_500L) // after t0 → stale

        val result = MultiCurrencyService.aggregateOffline(
            listOf(CurrencyAmount(Cents(10000L), Currency.EUR)),
            Currency.USD, cache, staleCutoff,
        )

        assertNotNull(result)
        assertEquals(Cents(10850L), result.totalInDisplayCurrency)
        assertTrue(result.hasStaleRates)
        assertTrue(result.lineItems.single().isStale)
    }

    @Test
    fun aggregateOffline_freshRelativeToCutoff_notStale() {
        val cache = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = 1)
        cache.put(Currency.EUR, Currency.USD, 1.085, Instant.fromEpochSeconds(2_000_000L))
        val staleCutoff = Instant.fromEpochSeconds(1_500_000L) // before the rate → fresh

        val result = MultiCurrencyService.aggregateOffline(
            listOf(CurrencyAmount(Cents(10000L), Currency.EUR)),
            Currency.USD, cache, staleCutoff,
        )

        assertNotNull(result)
        assertFalse(result.hasStaleRates)
        assertFalse(result.lineItems.single().isStale)
    }

    @Test
    fun aggregateOffline_missingRate_returnsNull() {
        val result = MultiCurrencyService.aggregateOffline(
            listOf(CurrencyAmount(Cents(10000L), Currency.EUR)),
            Currency.USD, cache(), t0,
        )
        assertNull(result)
    }

    @Test
    fun aggregateOffline_sameCurrencyOnly_noRatesNeeded() {
        val result = MultiCurrencyService.aggregateOffline(
            listOf(CurrencyAmount(Cents(2500L), Currency.USD)),
            Currency.USD, cache(), t0,
        )
        assertNotNull(result)
        assertEquals(Cents(2500L), result.totalInDisplayCurrency)
        assertFalse(result.hasStaleRates)
    }
}
