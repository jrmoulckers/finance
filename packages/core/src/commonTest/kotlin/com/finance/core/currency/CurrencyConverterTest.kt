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

        // $100.00 = 10000 US cents (2 decimals). At 149.50 JPY/USD that is
        // ¥14,950, and JPY has 0 decimal places, so the minor-unit result is
        // 14950 — NOT the unscaled 1,495,000 (off by 100x before #3460).
        val result = converter.convert(Cents(10000), Currency.USD, Currency.JPY)
        assertEquals(Cents(14950), result.convertedAmount)
    }

    @Test
    fun convert_jpyToUsd_smallRate() = runTest {
        val rate = ExchangeRate(Currency.JPY, Currency.USD, 0.0067, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.JPY to Currency.USD) to rate)))

        // ¥10,000 = 10000 (JPY has 0 decimal places, so 10000 minor units = ¥10,000).
        // ¥10,000 * 0.0067 USD/JPY = $67.00, and USD has 2 decimals, so the
        // minor-unit result is 6700 US cents — NOT 67 (off by 100x before #3460).
        val result = converter.convert(Cents(10000), Currency.JPY, Currency.USD)
        assertEquals(Cents(6700), result.convertedAmount)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Minor-unit rescale (#3460) — converting across currencies with a
    // different number of decimal places must not be off by a power of ten
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun convert_usdJpy_roundTrip_rescalesMinorUnits() = runTest {
        val toJpy = ExchangeRate(Currency.USD, Currency.JPY, 149.5, timestamp)
        val toUsd = ExchangeRate(Currency.JPY, Currency.USD, 1.0 / 149.5, timestamp)
        val converter = CurrencyConverter(
            FakeRateProvider(
                mapOf(
                    (Currency.USD to Currency.JPY) to toJpy,
                    (Currency.JPY to Currency.USD) to toUsd,
                ),
            ),
        )

        // $100.00 (10000 US cents) -> ¥14,950 (JPY has 0 decimals -> 14950)
        val jpy = converter.convert(Cents(10000), Currency.USD, Currency.JPY)
        assertEquals(Cents(14950), jpy.convertedAmount)

        // ...and back again round-trips cleanly to $100.00.
        val backToUsd = converter.convert(jpy.convertedAmount, Currency.JPY, Currency.USD)
        assertEquals(Cents(10000), backToUsd.convertedAmount)
    }

    @Test
    fun convert_usdKrw_roundTrip_rescalesMinorUnits() = runTest {
        val krw = Currency("KRW") // 0 decimal places, like JPY
        val toKrw = ExchangeRate(Currency.USD, krw, 1320.0, timestamp)
        val toUsd = ExchangeRate(krw, Currency.USD, 1.0 / 1320.0, timestamp)
        val converter = CurrencyConverter(
            FakeRateProvider(
                mapOf(
                    (Currency.USD to krw) to toKrw,
                    (krw to Currency.USD) to toUsd,
                ),
            ),
        )

        // $100.00 (10000 US cents) -> ₩132,000 (KRW has 0 decimals -> 132000)
        val won = converter.convert(Cents(10000), Currency.USD, krw)
        assertEquals(Cents(132000), won.convertedAmount)

        val backToUsd = converter.convert(won.convertedAmount, krw, Currency.USD)
        assertEquals(Cents(10000), backToUsd.convertedAmount)
    }

    @Test
    fun convert_usdToEur_sameScale_noRegression() = runTest {
        // Both USD and EUR use 2 decimals, so the rescale factor is 1 and the
        // result is identical to a plain rate multiply (regression guard).
        val rate = ExchangeRate(Currency.USD, Currency.EUR, 0.92, timestamp)
        val converter = CurrencyConverter(FakeRateProvider(mapOf((Currency.USD to Currency.EUR) to rate)))

        val result = converter.convert(Cents(10000), Currency.USD, Currency.EUR)
        assertEquals(Cents(9200), result.convertedAmount)
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

    // ═══════════════════════════════════════════════════════════════════
    // #3728 — date-aware historical conversion. A past-dated transaction must
    // be valued at the rate in effect on its date, not today's rate.
    // ═══════════════════════════════════════════════════════════════════

    /** Rate provider that returns a different rate depending on the [at] date. */
    private class DatedFakeRateProvider(
        private val byDate: Map<Instant, ExchangeRate>,
        private val current: ExchangeRate? = null,
    ) : ExchangeRateProvider {
        override suspend fun getRate(from: Currency, to: Currency): ExchangeRate? = current
        override suspend fun getRate(from: Currency, to: Currency, at: Instant): ExchangeRate? = byDate[at]
        override suspend fun getAvailableCurrencies(): Set<Currency> =
            (byDate.values + listOfNotNull(current)).flatMap { listOf(it.from, it.to) }.toSet()
    }

    @Test
    fun convertWithDate_usesRateInEffectOnThatDate() = runTest {
        val jan = Instant.parse("2024-01-15T00:00:00Z")
        val jun = Instant.parse("2024-06-15T00:00:00Z")
        val janRate = ExchangeRate(Currency.USD, Currency.EUR, 0.90, jan)
        val junRate = ExchangeRate(Currency.USD, Currency.EUR, 0.95, jun)
        val converter = CurrencyConverter(
            DatedFakeRateProvider(
                byDate = mapOf(jan to janRate, jun to junRate),
                current = ExchangeRate(Currency.USD, Currency.EUR, 0.99, timestamp),
            ),
        )

        // $100.00 valued on Jan 15 uses 0.90 → €90.00, not today's 0.99.
        val janResult = converter.convert(Cents(10000), Currency.USD, Currency.EUR, jan)
        assertEquals(Cents(9000), janResult.convertedAmount)
        assertEquals(janRate, janResult.rateUsed)

        // The same amount valued on Jun 15 uses 0.95 → €95.00.
        val junResult = converter.convert(Cents(10000), Currency.USD, Currency.EUR, jun)
        assertEquals(Cents(9500), junResult.convertedAmount)
        assertEquals(junRate, junResult.rateUsed)
    }

    @Test
    fun convertWithDate_differsFromCurrentRate() = runTest {
        val jan = Instant.parse("2024-01-15T00:00:00Z")
        val janRate = ExchangeRate(Currency.USD, Currency.EUR, 0.90, jan)
        val currentRate = ExchangeRate(Currency.USD, Currency.EUR, 0.99, timestamp)
        val converter = CurrencyConverter(
            DatedFakeRateProvider(byDate = mapOf(jan to janRate), current = currentRate),
        )

        val historical = converter.convert(Cents(10000), Currency.USD, Currency.EUR, jan)
        val today = converter.convert(Cents(10000), Currency.USD, Currency.EUR)
        assertEquals(Cents(9000), historical.convertedAmount)
        assertEquals(Cents(9900), today.convertedAmount)
        assertTrue(historical.convertedAmount.amount != today.convertedAmount.amount)
    }

    @Test
    fun convertWithDate_sameCurrency_noRateLookup() = runTest {
        val converter = CurrencyConverter(DatedFakeRateProvider(emptyMap()))
        val result = converter.convert(Cents(10000), Currency.USD, Currency.USD, timestamp)
        assertEquals(Cents(10000), result.convertedAmount)
        assertNull(result.rateUsed)
    }

    @Test
    fun convertWithDate_rescalesMinorUnits() = runTest {
        val jan = Instant.parse("2024-01-15T00:00:00Z")
        val rate = ExchangeRate(Currency.USD, Currency.JPY, 149.50, jan)
        val converter = CurrencyConverter(DatedFakeRateProvider(mapOf(jan to rate)))

        // $100.00 (10000 US cents) at 149.50 → ¥14,950 (JPY 0 decimals).
        val result = converter.convert(Cents(10000), Currency.USD, Currency.JPY, jan)
        assertEquals(Cents(14950), result.convertedAmount)
    }

    @Test
    fun convertWithDate_missingRate_throwsWithDate() = runTest {
        val jan = Instant.parse("2024-01-15T00:00:00Z")
        val converter = CurrencyConverter(DatedFakeRateProvider(emptyMap()))
        val exception = assertFailsWith<CurrencyConversionException> {
            converter.convert(Cents(10000), Currency.USD, Currency.EUR, jan)
        }
        assertTrue(exception.message!!.contains("USD"))
        assertTrue(exception.message!!.contains("EUR"))
    }
}
