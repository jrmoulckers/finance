// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.test.*

class NumberFormattingTest {

    // ── USD formatting ───────────────────────────────────────────────

    @Test
    fun formatPositiveUsd() {
        val result = NumberFormatting.formatCents(Cents(12345), Currency.USD)
        assertEquals("$123.45", result)
    }

    @Test
    fun formatNegativeUsd() {
        val result = NumberFormatting.formatCents(Cents(-500), Currency.USD)
        assertEquals("-$5.00", result)
    }

    @Test
    fun formatZeroUsd() {
        val result = NumberFormatting.formatCents(Cents.ZERO, Currency.USD)
        assertEquals("$0.00", result)
    }

    @Test
    fun formatOneCentUsd() {
        val result = NumberFormatting.formatCents(Cents(1), Currency.USD)
        assertEquals("$0.01", result)
    }

    @Test
    fun formatWithPlusSignUsd() {
        val result = NumberFormatting.formatCents(Cents(1000), Currency.USD, showSign = true)
        assertEquals("+$10.00", result)
    }

    @Test
    fun formatZeroWithPlusSignShowsNoSign() {
        val result = NumberFormatting.formatCents(Cents.ZERO, Currency.USD, showSign = true)
        assertEquals("$0.00", result)
    }

    // ── EUR formatting ───────────────────────────────────────────────

    @Test
    fun formatPositiveEur() {
        val result = NumberFormatting.formatCents(Cents(5099), Currency.EUR)
        assertEquals("\u20AC50.99", result)
    }

    // ── JPY formatting (zero decimals) ───────────────────────────────

    @Test
    fun formatJpyHasNoDecimals() {
        val result = NumberFormatting.formatCents(Cents(1000), Currency.JPY)
        assertEquals("\u00A51000", result)
    }

    @Test
    fun formatNegativeJpy() {
        val result = NumberFormatting.formatCents(Cents(-500), Currency.JPY)
        assertEquals("-\u00A5500", result)
    }

    // ── GBP formatting ───────────────────────────────────────────────

    @Test
    fun formatGbp() {
        val result = NumberFormatting.formatCents(Cents(10050), Currency.GBP)
        assertEquals("\u00A3100.50", result)
    }

    // ── Unknown currency falls back to code ──────────────────────────

    @Test
    fun unknownCurrencyUsesCodeAsSymbol() {
        val result = NumberFormatting.formatCents(Cents(100), Currency("SEK"))
        assertEquals("SEK 1.00", result)
    }

    // ── Percentage formatting ────────────────────────────────────────

    @Test
    fun formatPercentOneDecimal() {
        val result = NumberFormatting.formatPercent(75.5)
        assertEquals("75.5%", result)
    }

    @Test
    fun formatPercentZeroDecimals() {
        val result = NumberFormatting.formatPercent(100.0, decimals = 0)
        assertEquals("100%", result)
    }

    @Test
    fun formatPercentSmallValue() {
        val result = NumberFormatting.formatPercent(0.5)
        assertEquals("0.5%", result)
    }

    // ── Currency symbol lookup ───────────────────────────────────────

    @Test
    fun usdSymbolIsDollarSign() {
        assertEquals("$", NumberFormatting.currencySymbol(Currency.USD))
    }

    @Test
    fun eurSymbolIsEuroSign() {
        assertEquals("\u20AC", NumberFormatting.currencySymbol(Currency.EUR))
    }

    @Test
    fun gbpSymbolIsPoundSign() {
        assertEquals("\u00A3", NumberFormatting.currencySymbol(Currency.GBP))
    }

    @Test
    fun jpySymbolIsYenSign() {
        assertEquals("\u00A5", NumberFormatting.currencySymbol(Currency.JPY))
    }

    @Test
    fun cadSymbolIsDollarSign() {
        assertEquals("$", NumberFormatting.currencySymbol(Currency.CAD))
    }
}
