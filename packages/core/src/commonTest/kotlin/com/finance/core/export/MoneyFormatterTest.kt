// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.test.*

/**
 * Tests for [MoneyFormatter] — decimal formatting, currency code display,
 * major unit conversion, and edge cases for all supported decimal places.
 */
class MoneyFormatterTest {

    // ═══════════════════════════════════════════════════════════════════
    // formatDecimal — standard currencies (2 decimal places)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun formatDecimal_positiveCentsUsd() {
        assertEquals("12.50", MoneyFormatter.formatDecimal(Cents(1250), Currency.USD))
    }

    @Test
    fun formatDecimal_zeroCentsUsd() {
        assertEquals("0.00", MoneyFormatter.formatDecimal(Cents(0), Currency.USD))
    }

    @Test
    fun formatDecimal_negativeCentsUsd() {
        assertEquals("-3.50", MoneyFormatter.formatDecimal(Cents(-350), Currency.USD))
    }

    @Test
    fun formatDecimal_oneCentUsd() {
        assertEquals("0.01", MoneyFormatter.formatDecimal(Cents(1), Currency.USD))
    }

    @Test
    fun formatDecimal_largeAmountUsd() {
        assertEquals("999999.99", MoneyFormatter.formatDecimal(Cents(99999999), Currency.USD))
    }

    @Test
    fun formatDecimal_exactDollarUsd() {
        assertEquals("100.00", MoneyFormatter.formatDecimal(Cents(10000), Currency.USD))
    }

    @Test
    fun formatDecimal_negativeOneCentUsd() {
        assertEquals("-0.01", MoneyFormatter.formatDecimal(Cents(-1), Currency.USD))
    }

    // ═══════════════════════════════════════════════════════════════════
    // formatDecimal — zero-decimal currencies (JPY, KRW, VND)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun formatDecimal_positiveJpy() {
        assertEquals("1000", MoneyFormatter.formatDecimal(Cents(1000), Currency.JPY))
    }

    @Test
    fun formatDecimal_negativeJpy() {
        assertEquals("-500", MoneyFormatter.formatDecimal(Cents(-500), Currency.JPY))
    }

    @Test
    fun formatDecimal_zeroJpy() {
        assertEquals("0", MoneyFormatter.formatDecimal(Cents(0), Currency.JPY))
    }

    // ═══════════════════════════════════════════════════════════════════
    // formatDecimal — 3-decimal currencies (BHD, KWD, OMR)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun formatDecimal_positiveBhd() {
        assertEquals("12.345", MoneyFormatter.formatDecimal(Cents(12345), Currency("BHD")))
    }

    @Test
    fun formatDecimal_negativeBhd() {
        assertEquals("-1.500", MoneyFormatter.formatDecimal(Cents(-1500), Currency("BHD")))
    }

    @Test
    fun formatDecimal_zeroBhd() {
        assertEquals("0.000", MoneyFormatter.formatDecimal(Cents(0), Currency("BHD")))
    }

    @Test
    fun formatDecimal_subMillBhd() {
        assertEquals("0.001", MoneyFormatter.formatDecimal(Cents(1), Currency("BHD")))
    }

    // ═══════════════════════════════════════════════════════════════════
    // formatWithCode
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun formatWithCode_usd() {
        assertEquals("12.50 USD", MoneyFormatter.formatWithCode(Cents(1250), Currency.USD))
    }

    @Test
    fun formatWithCode_jpy() {
        assertEquals("1000 JPY", MoneyFormatter.formatWithCode(Cents(1000), Currency.JPY))
    }

    @Test
    fun formatWithCode_eur() {
        assertEquals("0.00 EUR", MoneyFormatter.formatWithCode(Cents(0), Currency.EUR))
    }

    @Test
    fun formatWithCode_negative() {
        assertEquals("-5.00 GBP", MoneyFormatter.formatWithCode(Cents(-500), Currency.GBP))
    }

    // ═══════════════════════════════════════════════════════════════════
    // toMajorUnits
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun toMajorUnits_usd() {
        assertEquals(12.5, MoneyFormatter.toMajorUnits(Cents(1250), Currency.USD))
    }

    @Test
    fun toMajorUnits_zero() {
        assertEquals(0.0, MoneyFormatter.toMajorUnits(Cents(0), Currency.USD))
    }

    @Test
    fun toMajorUnits_jpy() {
        assertEquals(1000.0, MoneyFormatter.toMajorUnits(Cents(1000), Currency.JPY))
    }

    @Test
    fun toMajorUnits_bhd() {
        assertEquals(12.345, MoneyFormatter.toMajorUnits(Cents(12345), Currency("BHD")))
    }

    @Test
    fun toMajorUnits_negative() {
        assertEquals(-3.5, MoneyFormatter.toMajorUnits(Cents(-350), Currency.USD))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Consistency between formatDecimal and formatCentsDisplay
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun formatDecimalMatchesInternalFormatCentsDisplay() {
        // Verify MoneyFormatter.formatDecimal delegates to the shared function
        val testCases = listOf(
            Cents(1250) to Currency.USD,
            Cents(-350) to Currency.USD,
            Cents(1000) to Currency.JPY,
            Cents(12345) to Currency("BHD"),
            Cents(0) to Currency.EUR,
        )
        for ((cents, currency) in testCases) {
            assertEquals(
                formatCentsDisplay(cents, currency),
                MoneyFormatter.formatDecimal(cents, currency),
                "Mismatch for $cents ${currency.code}",
            )
        }
    }
}
