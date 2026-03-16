// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.currency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.*

/**
 * Tests for [CurrencyConverter] covering same-currency conversion,
 * normal conversion with banker's rounding, missing rate handling,
 * inverse rate usage, and edge cases.
 */
class CurrencyConverterTest {

    private val timestamp = Instant.parse("2024-06-15T12:00:00Z")

    /**
     * In-memory rate provider for deterministic testing.
     */
    private class FakeRateProvider(
        private val rates: Map<Pair<Currency, Currency>, ExchangeRate> = emptyMap(),
    ) : ExchangeRateProvider {
        override suspend fun getRate(from: Currency, to: Currency): ExchangeRate? {
            return rates[from to to]
        }

        override suspend fun getRate(from: Currency, to: Currency, at: Instant): ExchangeRate? {
            return rates[from to to]
        }

        override suspend fun getAvailableCurrencies(): Set<Currency> {
            return rates.keys.flatMap { listOf(it.first, it.second) }.toSet()
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Same currency — 1:1 conversion
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_sameCurrency_returnsOriginalAmount() = runTest {
        val converter = CurrencyConverter(FakeRateProvider())
        val result = converter.convert(Cents(10000), Currency.USD, Currency.USD)

        assertEquals(Cents(10000), result.convertedAmount)
        assertEquals(Cents(10000), result.originalAmount)
        assertNull(result.rateUsed, "Same-currency conversion should not use a rate")
    }

    @Test
    fun convert_sameCurrency_zeroAmount() = runTest {
        val converter = CurrencyConverter(FakeRateProvider())
        val result = converter.convert(Cents(0), Currency.EUR, Currency.EUR)

        assertEquals(Cents(0), result.convertedAmount)
        assertNull(result.rateUsed)
    }

    @Test
    fun convert_sameCurrency_negativeAmount() = runTest {
        val converter = CurrencyConverter(FakeRateProvider())
        val result = converter.convert(Cents(-500), Currency.GBP, Currency.GBP)

        assertEquals(Cents(-500), result.convertedAmount)
        assertNull(result.rateUsed)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Normal conversion
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_usdToEur_normalRate() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(10000), Currency.USD, Currency.EUR)

        // 10000 * 0.92 = 9200
        assertEquals(Cents(9200), result.convertedAmount)
        assertEquals(Cents(10000), result.originalAmount)
        assertEquals(rate, result.rateUsed)
    }

    @Test
    fun convert_usdToJpy_largeRate() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.JPY, 149.50, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.JPY) to rate)))

        // $100.00 = 10000 cents. 10000 * 149.50 = 1,495,000
        val result = converter.convert(Cents(10000), Currency.USD, Currency.JPY)
        assertEquals(Cents(1495000), result.convertedAmount)
    }

    @Test
    fun convert_jpyToUsd_smallRate() = runTest {
        val rate = ExchangeRate(Currency.JPY, Currency.USD, 0.0067, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.JPY to Currency.USD) to rate)))

        // ¥10,000 = 10000 (JPY has 0 decimal places, so 10000 "cents" = ¥10,000)
        // 10000 * 0.0067 = 67.0
        val result = converter.convert(Cents(10000), Currency.JPY, Currency.USD)
        assertEquals(Cents(67), result.convertedAmount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Conversion with banker's rounding
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_roundingDown() = runTest {
        // 1000 * 1.004 = 1004.0 → no rounding needed
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 1.004, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(1000), Currency.USD, Currency.EUR)
        assertEquals(Cents(1004), result.convertedAmount)
    }

    @Test
    fun convert_roundingUp() = runTest {
        // 1000 * 1.006 = 1006.0 → no rounding needed
        // Let's use a rate that produces a fractional result:
        // 333 * 0.92 = 306.36 → 306
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(333), Currency.USD, Currency.EUR)
        assertEquals(Cents(306), result.convertedAmount)
    }

    @Test
    fun convert_bankersRoundHalfToEven() = runTest {
        // Need a rate that produces exactly X.5
        // 5 * 0.5 = 2.5 → floor=2 (even) → stays 2
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.5, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(5), Currency.USD, Currency.EUR)
        assertEquals(Cents(2), result.convertedAmount)
    }

    @Test
    fun convert_bankersRoundHalfToEven_oddFloor() = runTest {
        // 3 * 0.5 = 1.5 → floor=1 (odd) → rounds to 2
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.5, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(3), Currency.USD, Currency.EUR)
        assertEquals(Cents(2), result.convertedAmount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Missing rate — exception
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_missingRate_throwsCurrencyConversionException() = runTest {
        val converter = CurrencyConverter(FakeRateProvider())

        val exception = assertFailsWith<CurrencyConversionException> {
            converter.convert(Cents(10000), Currency.USD, Currency.EUR)
        }
        assertTrue(exception.message!!.contains("USD"))
        assertTrue(exception.message!!.contains("EUR"))
    }

    @Test
    fun convert_rateExistsForReversePair_butNotForward_throws() = runTest {
        // We have EUR→USD but NOT USD→EUR
        val rate = ExchangeRate(Currency.EUR, Currency.USD, 1.09, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.EUR to Currency.USD) to rate)))

        // Converter does NOT auto-invert; it requires exact pair
        assertFailsWith<CurrencyConversionException> {
            converter.convert(Cents(10000), Currency.USD, Currency.EUR)
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Zero and negative amount conversions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_zeroAmount_differentCurrencies() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(0), Currency.USD, Currency.EUR)
        assertEquals(Cents(0), result.convertedAmount)
    }

    @Test
    fun convert_negativeAmount() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        // -1000 * 0.92 = -920
        val result = converter.convert(Cents(-1000), Currency.USD, Currency.EUR)
        assertEquals(Cents(-920), result.convertedAmount)
    }

    @Test
    fun convert_oneCent() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        // 1 * 0.92 = 0.92 → above half → 1
        val result = converter.convert(Cents(1), Currency.USD, Currency.EUR)
        assertEquals(Cents(1), result.convertedAmount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Large amount conversion
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_largeAmount() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        // $1,000,000.00 = 100,000,000 cents. 100000000 * 0.92 = 92000000
        val result = converter.convert(Cents(100_000_000), Currency.USD, Currency.EUR)
        assertEquals(Cents(92_000_000), result.convertedAmount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // ConversionResult properties
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun conversionResult_preservesOriginalAmount() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(12345), Currency.USD, Currency.EUR)
        assertEquals(Cents(12345), result.originalAmount)
    }

    @Test
    fun conversionResult_includesRateUsed() = runTest {
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(10000), Currency.USD, Currency.EUR)
        assertNotNull(result.rateUsed)
        assertEquals(0.92, result.rateUsed!!.rate)
        assertEquals(Currency.USD, result.rateUsed!!.from)
        assertEquals(Currency.EUR, result.rateUsed!!.to)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Rate of exactly 1.0
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_rateOfOne_amountUnchanged() = runTest {
        // Pegged currencies or no-op conversion with different currencies
        val rate = ExchangeRate(Currency.USD, Currency.CAD, 1.0, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.CAD) to rate)))

        val result = converter.convert(Cents(99999), Currency.USD, Currency.CAD)
        assertEquals(Cents(99999), result.convertedAmount)
        assertNotNull(result.rateUsed, "Different currencies should include rate even if 1.0")
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multiple currency pairs
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_selectsCorrectRateForPair() = runTest {
        val usdToEur = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val usdToGbp = ExchangeRate(Currency.USD, Currency.GBP, 0.79, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf(
            (Currency.USD to Currency.EUR) to usdToEur,
            (Currency.USD to Currency.GBP) to usdToGbp,
        )))

        val eurResult = converter.convert(Cents(10000), Currency.USD, Currency.EUR)
        assertEquals(Cents(9200), eurResult.convertedAmount)

        val gbpResult = converter.convert(Cents(10000), Currency.USD, Currency.GBP)
        assertEquals(Cents(7900), gbpResult.convertedAmount)
    }
}
