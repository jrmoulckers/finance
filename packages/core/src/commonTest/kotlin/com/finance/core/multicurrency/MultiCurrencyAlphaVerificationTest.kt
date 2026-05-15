// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.Instant
import kotlin.test.*

/**
 * Sprint 2 verification tests for #1365 — Multi-Currency Alpha Behavior.
 *
 * Covers:
 * - Single-currency account operations (alpha constraint)
 * - Rejection or warning for mixed-currency transactions
 * - Default currency behavior
 * - Currency code validation (ISO 4217)
 */
class MultiCurrencyAlphaVerificationTest {

    // ═══════════════════════════════════════════════════════════════════
    // Currency code validation (ISO 4217)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun currencyCode_validThreeLetterUppercase_accepted() {
        val usd = Currency("USD")
        assertEquals("USD", usd.code)

        val eur = Currency("EUR")
        assertEquals("EUR", eur.code)

        val jpy = Currency("JPY")
        assertEquals("JPY", jpy.code)
    }

    @Test
    fun currencyCode_lowercase_rejected() {
        assertFailsWith<IllegalArgumentException> {
            Currency("usd")
        }
    }

    @Test
    fun currencyCode_twoLetters_rejected() {
        assertFailsWith<IllegalArgumentException> {
            Currency("US")
        }
    }

    @Test
    fun currencyCode_fourLetters_rejected() {
        assertFailsWith<IllegalArgumentException> {
            Currency("USDX")
        }
    }

    @Test
    fun currencyCode_mixedCase_rejected() {
        assertFailsWith<IllegalArgumentException> {
            Currency("Usd")
        }
    }

    @Test
    fun currencyCode_emptyString_rejected() {
        assertFailsWith<IllegalArgumentException> {
            Currency("")
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Currency decimal places (minor unit)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun decimalPlaces_standardCurrencies_twoDecimals() {
        assertEquals(2, Currency.USD.decimalPlaces)
        assertEquals(2, Currency.EUR.decimalPlaces)
        assertEquals(2, Currency.GBP.decimalPlaces)
        assertEquals(2, Currency.CAD.decimalPlaces)
    }

    @Test
    fun decimalPlaces_zeroDecimalCurrencies() {
        assertEquals(0, Currency.JPY.decimalPlaces)
        assertEquals(0, Currency("KRW").decimalPlaces)
    }

    @Test
    fun decimalPlaces_threeDecimalCurrencies() {
        assertEquals(3, Currency("BHD").decimalPlaces)
        assertEquals(3, Currency("KWD").decimalPlaces)
        assertEquals(3, Currency("OMR").decimalPlaces)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Currency catalog
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun currencyCatalog_containsCommonCurrencies() {
        val catalog = MultiCurrencyEngine.currencyCatalog
        assertTrue(catalog.containsKey("USD"))
        assertTrue(catalog.containsKey("EUR"))
        assertTrue(catalog.containsKey("GBP"))
        assertTrue(catalog.containsKey("JPY"))
    }

    @Test
    fun currencyInfo_hasSymbolAndDisplayName() {
        val usdInfo = MultiCurrencyEngine.currencyInfo(Currency.USD)
        assertNotNull(usdInfo)
        assertEquals("$", usdInfo.symbol)
        assertEquals("US Dollar", usdInfo.displayName)
        assertEquals(2, usdInfo.decimalPlaces)
    }

    @Test
    fun currencyInfo_unknownCurrency_returnsNull() {
        val info = MultiCurrencyEngine.currencyInfo(Currency("XYZ"))
        assertNull(info, "Unknown currency should return null from catalog")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Single-currency operations (alpha constraint)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun centsAddition_sameCurrency_succeeds() {
        val a = Cents(1050)
        val b = Cents(2050)
        val result = a + b
        assertEquals(Cents(3100), result, "$10.50 + $20.50 = $31.00")
    }

    @Test
    fun centsSubtraction_sameCurrency_succeeds() {
        val a = Cents(5000)
        val b = Cents(3000)
        val result = a - b
        assertEquals(Cents(2000), result, "$50.00 - $30.00 = $20.00")
    }

    @Test
    fun currencyMismatch_differentCurrencyAmounts_shouldNotBeAdded() {
        // Alpha behavior: amounts carry currency; adding different currencies is invalid
        val usdAmount = CurrencyAmount(Cents(1000), Currency.USD)
        val eurAmount = CurrencyAmount(Cents(1000), Currency.EUR)

        assertNotEquals(usdAmount.currency, eurAmount.currency)
        // Engine aggregation with missing rate returns null (blocks operation)
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val result = MultiCurrencyEngine.aggregate(
            listOf(usdAmount, eurAmount),
            Currency.USD,
            cache,
        )
        assertNull(result, "Aggregation without exchange rate should return null")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Exchange rate cache behavior
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun exchangeRateCache_sameCurrency_returnsOne() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val rate = cache.get(Currency.USD, Currency.USD)
        assertEquals(1.0, rate, "Same currency rate = 1.0")
    }

    @Test
    fun exchangeRateCache_missingRate_returnsNull() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val rate = cache.get(Currency.USD, Currency.EUR)
        assertNull(rate, "No rate cached should return null")
    }

    @Test
    fun exchangeRateCache_storedRate_retrieved() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val now = Instant.fromEpochSeconds(1718400000)
        cache.put(Currency.USD, Currency.EUR, 0.92, now)

        val rate = cache.get(Currency.USD, Currency.EUR, now)
        assertEquals(0.92, rate)
    }

    @Test
    fun exchangeRateCache_inverseRate_computed() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val now = Instant.fromEpochSeconds(1718400000)
        cache.put(Currency.USD, Currency.EUR, 0.92, now)

        val inverseRate = cache.get(Currency.EUR, Currency.USD, now)
        assertNotNull(inverseRate)
        assertTrue(inverseRate > 1.08 && inverseRate < 1.09, "1/0.92 ≈ 1.087")
    }

    @Test
    fun exchangeRateCache_staleRate_returnsNull() {
        val cache = MultiCurrencyEngine.ExchangeRateCache(maxAgeSeconds = 60)
        val old = Instant.fromEpochSeconds(1000)
        val now = Instant.fromEpochSeconds(2000)
        cache.put(Currency.USD, Currency.EUR, 0.92, old)

        val rate = cache.get(Currency.USD, Currency.EUR, now)
        assertNull(rate, "Stale rate (>60s old) should return null")
    }

    @Test
    fun exchangeRateCache_positiveRateRequired() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        assertFailsWith<IllegalArgumentException> {
            cache.put(Currency.USD, Currency.EUR, 0.0, Instant.fromEpochSeconds(1000))
        }
        assertFailsWith<IllegalArgumentException> {
            cache.put(Currency.USD, Currency.EUR, -1.0, Instant.fromEpochSeconds(1000))
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Currency conversion
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_appliesRateCorrectly() {
        val usd = Cents(10000) // $100.00
        val rate = 0.92 // USD → EUR
        val eur = MultiCurrencyEngine.convert(usd, rate)

        assertEquals(Cents(9200), eur, "$100 * 0.92 = €92.00")
    }

    @Test
    fun convertWithCache_sameCurrency_returnsOriginal() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val result = MultiCurrencyEngine.convertWithCache(
            Cents(5000), Currency.USD, Currency.USD, cache,
        )

        assertNotNull(result)
        assertEquals(Cents(5000), result.convertedAmount)
        assertEquals(1.0, result.rateUsed)
    }

    @Test
    fun convertWithCache_missingRate_returnsNull() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val result = MultiCurrencyEngine.convertWithCache(
            Cents(5000), Currency.USD, Currency.EUR, cache,
        )

        assertNull(result, "Missing rate should produce null conversion result")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Default currency and companion constants
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun defaultCurrency_companionConstants_valid() {
        assertEquals("USD", Currency.USD.code)
        assertEquals("EUR", Currency.EUR.code)
        assertEquals("GBP", Currency.GBP.code)
        assertEquals("JPY", Currency.JPY.code)
        assertEquals("CAD", Currency.CAD.code)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multi-currency aggregation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun aggregate_allSameCurrency_sumsDirectly() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val amounts = listOf(
            CurrencyAmount(Cents(1000), Currency.USD),
            CurrencyAmount(Cents(2000), Currency.USD),
            CurrencyAmount(Cents(3000), Currency.USD),
        )

        val result = MultiCurrencyEngine.aggregate(amounts, Currency.USD, cache)
        assertNotNull(result)
        assertEquals(Cents(6000), result.totalAmount, "$10 + $20 + $30 = $60")
    }

    @Test
    fun aggregate_mixedCurrencies_convertsToTarget() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val now = Instant.fromEpochSeconds(1718400000)
        cache.put(Currency.EUR, Currency.USD, 1.09, now)

        val amounts = listOf(
            CurrencyAmount(Cents(10000), Currency.USD),
            CurrencyAmount(Cents(10000), Currency.EUR),
        )

        val result = MultiCurrencyEngine.aggregate(amounts, Currency.USD, cache, now)
        assertNotNull(result)
        // $100 + €100*1.09 = $100 + $109 = $209
        assertEquals(Cents(20900), result.totalAmount)
        assertEquals(2, result.currencyCount)
    }

    @Test
    fun aggregate_emptyList_returnsZero() {
        val cache = MultiCurrencyEngine.ExchangeRateCache()
        val result = MultiCurrencyEngine.aggregate(emptyList(), Currency.USD, cache)
        assertNotNull(result)
        assertEquals(Cents.ZERO, result.totalAmount)
    }
}
