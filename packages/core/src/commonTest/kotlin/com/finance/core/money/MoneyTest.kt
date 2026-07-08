// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.money

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MoneyTest {

    private val jpy = Currency.JPY
    private val usd = Currency.USD
    private val eur = Currency.EUR
    private val bhd = Currency("BHD") // 3 decimal places

    // ── Construction ────────────────────────────────────────────────

    @Test
    fun ofMinor_storesRawMinorUnits() {
        val m = Money.ofMinor(1234, usd)
        assertEquals(1234L, m.minorUnits)
        assertEquals(usd, m.currency)
        assertEquals(2, m.decimalPlaces)
    }

    @Test
    fun ofMajor_twoDecimalCurrency() {
        val m = Money.ofMajor(12, 34, usd)
        assertEquals(Cents(1234L), m.cents)
    }

    @Test
    fun ofMajor_zeroDecimalCurrency() {
        val m = Money.ofMajor(500, 0, jpy)
        assertEquals(Cents(500L), m.cents)
        assertEquals(0, m.decimalPlaces)
    }

    @Test
    fun ofMajor_threeDecimalCurrency() {
        val m = Money.ofMajor(1, 234, bhd)
        assertEquals(Cents(1234L), m.cents)
        assertEquals(3, m.decimalPlaces)
    }

    @Test
    fun ofMajor_negativeWhole() {
        val m = Money.ofMajor(-12, 34, usd)
        assertEquals(Cents(-1234L), m.cents)
    }

    @Test
    fun ofMajor_rejectsFractionOutOfRange() {
        assertFailsWith<IllegalArgumentException> { Money.ofMajor(1, 100, usd) }
        assertFailsWith<IllegalArgumentException> { Money.ofMajor(1, 1, jpy) }
        assertFailsWith<IllegalArgumentException> { Money.ofMajor(1, -1, usd) }
    }

    @Test
    fun ofWholeMajor_addsNoFraction() {
        assertEquals(Cents(2000L), Money.ofWholeMajor(20, usd).cents)
        assertEquals(Cents(500L), Money.ofWholeMajor(500, jpy).cents)
    }

    @Test
    fun fromMajor_roundsSubMinorPrecisionToNearestMinorUnit() {
        // The reported bug: sub-cent precision must not survive entry.
        assertEquals(Cents(12321300L), Money.fromMajor(123213.00002, usd).cents)
        assertEquals(Cents(1234L), Money.fromMajor(12.344, usd).cents)
        assertEquals(Cents(1235L), Money.fromMajor(12.346, usd).cents)
    }

    @Test
    fun fromMajor_handlesZeroAndNegative() {
        assertTrue(Money.fromMajor(0.0, usd).isZero())
        assertEquals(Cents(-525L), Money.fromMajor(-5.25, usd).cents)
        assertEquals(Cents(0L), Money.fromMajor(-0.001, usd).cents)
    }

    @Test
    fun fromMajor_respectsPerCurrencyPrecision() {
        assertEquals(Cents(501L), Money.fromMajor(500.6, jpy).cents) // 0 decimals
        assertEquals(Cents(500L), Money.fromMajor(500.0, jpy).cents)
        assertEquals(Cents(1234L), Money.fromMajor(1.2344, bhd).cents) // 3 decimals
    }

    @Test
    fun fromMajor_handlesLargeValues() {
        assertEquals(Cents(100_000_000_000L), Money.fromMajor(1_000_000_000.0, usd).cents)
    }

    @Test
    fun fromMajor_rejectsNonFinite() {
        assertFailsWith<IllegalArgumentException> { Money.fromMajor(Double.NaN, usd) }
        assertFailsWith<IllegalArgumentException> { Money.fromMajor(Double.POSITIVE_INFINITY, usd) }
    }

    @Test
    fun zero_isZeroInCurrency() {
        val z = Money.zero(eur)
        assertTrue(z.isZero())
        assertEquals(eur, z.currency)
    }

    // ── Arithmetic (same currency) ──────────────────────────────────

    @Test
    fun plus_sameCurrency() {
        val sum = Money.ofMinor(1000, usd) + Money.ofMinor(250, usd)
        assertEquals(Money.ofMinor(1250, usd), sum)
    }

    @Test
    fun minus_sameCurrency() {
        val diff = Money.ofMinor(1000, usd) - Money.ofMinor(250, usd)
        assertEquals(Money.ofMinor(750, usd), diff)
    }

    @Test
    fun times_scalesByFactor() {
        assertEquals(Money.ofMinor(3000, usd), Money.ofMinor(1000, usd) * 3)
    }

    @Test
    fun unaryMinus_negates() {
        assertEquals(Money.ofMinor(-1000, usd), -Money.ofMinor(1000, usd))
    }

    @Test
    fun abs_returnsMagnitude() {
        assertEquals(Money.ofMinor(1000, usd), Money.ofMinor(-1000, usd).abs())
        assertEquals(Money.ofMinor(1000, usd), Money.ofMinor(1000, usd).abs())
    }

    // ── Arithmetic (currency mismatch) ──────────────────────────────

    @Test
    fun plus_currencyMismatch_throws() {
        assertFailsWith<IllegalArgumentException> {
            Money.ofMinor(1000, usd) + Money.ofMinor(1000, eur)
        }
    }

    @Test
    fun minus_currencyMismatch_throws() {
        assertFailsWith<IllegalArgumentException> {
            Money.ofMinor(1000, usd) - Money.ofMinor(1000, eur)
        }
    }

    @Test
    fun compareTo_currencyMismatch_throws() {
        assertFailsWith<IllegalArgumentException> {
            Money.ofMinor(1000, usd).compareTo(Money.ofMinor(1000, eur))
        }
    }

    // ── Comparison & predicates ─────────────────────────────────────

    @Test
    fun compareTo_sameCurrency() {
        assertTrue(Money.ofMinor(2000, usd) > Money.ofMinor(1000, usd))
        assertTrue(Money.ofMinor(500, usd) < Money.ofMinor(1000, usd))
        assertEquals(0, Money.ofMinor(1000, usd).compareTo(Money.ofMinor(1000, usd)))
    }

    @Test
    fun predicates() {
        assertTrue(Money.ofMinor(1, usd).isPositive())
        assertTrue(Money.ofMinor(-1, usd).isNegative())
        assertTrue(Money.zero(usd).isZero())
        assertFalse(Money.ofMinor(1, usd).isNegative())
    }

    // ── Plain string rendering ──────────────────────────────────────

    @Test
    fun toPlainString_twoDecimals() {
        assertEquals("12.34", Money.ofMinor(1234, usd).toPlainString())
        assertEquals("0.05", Money.ofMinor(5, usd).toPlainString())
        assertEquals("0.00", Money.zero(usd).toPlainString())
        assertEquals("-12.34", Money.ofMinor(-1234, usd).toPlainString())
    }

    @Test
    fun toPlainString_zeroDecimals() {
        assertEquals("500", Money.ofMinor(500, jpy).toPlainString())
        assertEquals("-500", Money.ofMinor(-500, jpy).toPlainString())
        assertEquals("0", Money.zero(jpy).toPlainString())
    }

    @Test
    fun toPlainString_threeDecimals() {
        assertEquals("1.234", Money.ofMinor(1234, bhd).toPlainString())
        assertEquals("0.007", Money.ofMinor(7, bhd).toPlainString())
    }

    // ── Overflow safety inherited from Cents ────────────────────────

    @Test
    fun plus_overflow_throws() {
        assertFailsWith<ArithmeticException> {
            Money.ofMinor(Long.MAX_VALUE, usd) + Money.ofMinor(1, usd)
        }
    }
}
