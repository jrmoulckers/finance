package com.finance.core.currency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.test.*

class CurrencyFormatterTest {

    // ═══════════════════════════════════════════════════════════════════
    // Basic formatting — USD
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_usd_standard() {
        assertEquals("$12.50", CurrencyFormatter.format(Cents(1250), Currency.USD))
    }

    @Test
    fun format_usd_wholeAmount() {
        assertEquals("$100.00", CurrencyFormatter.format(Cents(10000), Currency.USD))
    }

    @Test
    fun format_usd_oneCent() {
        assertEquals("$0.01", CurrencyFormatter.format(Cents(1), Currency.USD))
    }

    @Test
    fun format_usd_zero() {
        assertEquals("$0.00", CurrencyFormatter.format(Cents(0), Currency.USD))
    }

    @Test
    fun format_usd_singleDigitCents() {
        // $1.05 — fractional part needs zero-padding
        assertEquals("$1.05", CurrencyFormatter.format(Cents(105), Currency.USD))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Negative amounts
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_usd_negative() {
        assertEquals("-$5.00", CurrencyFormatter.format(Cents(-500), Currency.USD))
    }

    @Test
    fun format_usd_negativeWithCents() {
        assertEquals("-$12.34", CurrencyFormatter.format(Cents(-1234), Currency.USD))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Show sign
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_showSign_positive() {
        assertEquals("+$5.00", CurrencyFormatter.format(Cents(500), Currency.USD, showSign = true))
    }

    @Test
    fun format_showSign_negative() {
        assertEquals("-$5.00", CurrencyFormatter.format(Cents(-500), Currency.USD, showSign = true))
    }

    @Test
    fun format_showSign_zero() {
        // Zero should NOT show "+" prefix
        assertEquals("$0.00", CurrencyFormatter.format(Cents(0), Currency.USD, showSign = true))
    }

    // ═══════════════════════════════════════════════════════════════════
    // EUR formatting
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_eur_withThousandsSeparator() {
        assertEquals("€1,234.56", CurrencyFormatter.format(Cents(123456), Currency.EUR))
    }

    @Test
    fun format_eur_small() {
        assertEquals("€0.50", CurrencyFormatter.format(Cents(50), Currency.EUR))
    }

    // ═══════════════════════════════════════════════════════════════════
    // JPY formatting (0 decimal places)
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_jpy_noDecimals() {
        assertEquals("¥1,235", CurrencyFormatter.format(Cents(1235), Currency.JPY))
    }

    @Test
    fun format_jpy_small() {
        assertEquals("¥50", CurrencyFormatter.format(Cents(50), Currency.JPY))
    }

    @Test
    fun format_jpy_large() {
        assertEquals("¥100,000", CurrencyFormatter.format(Cents(100000), Currency.JPY))
    }

    @Test
    fun format_jpy_zero() {
        assertEquals("¥0", CurrencyFormatter.format(Cents(0), Currency.JPY))
    }

    @Test
    fun format_jpy_negative() {
        assertEquals("-¥500", CurrencyFormatter.format(Cents(-500), Currency.JPY))
    }

    // ═══════════════════════════════════════════════════════════════════
    // GBP formatting
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_gbp_standard() {
        assertEquals("£25.00", CurrencyFormatter.format(Cents(2500), Currency.GBP))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Thousands separator grouping
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_thousandsSeparator() {
        assertEquals("$1,000.00", CurrencyFormatter.format(Cents(100000), Currency.USD))
    }

    @Test
    fun format_millions() {
        assertEquals("$1,000,000.00", CurrencyFormatter.format(Cents(100000000), Currency.USD))
    }

    @Test
    fun format_noSeparatorBelow1000() {
        assertEquals("$999.99", CurrencyFormatter.format(Cents(99999), Currency.USD))
    }

    @Test
    fun format_largeAmount_billions() {
        // $1,234,567,890.12
        assertEquals(
            "$1,234,567,890.12",
            CurrencyFormatter.format(Cents(123456789012), Currency.USD),
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    // Unknown currency fallback
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun format_unknownCurrency_usesCodeAsPrefix() {
        val nzd = Currency("NZD")
        // Unknown symbol fallback: "NZD " prefix
        assertEquals("NZD 10.00", CurrencyFormatter.format(Cents(1000), nzd))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Compact formatting
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun formatCompact_thousands() {
        // $1,200.00 → "$1.2K"
        assertEquals("$1.2K", CurrencyFormatter.formatCompact(Cents(120000), Currency.USD))
    }

    @Test
    fun formatCompact_millions() {
        // $3,500,000.00 → "$3.5M"
        assertEquals("$3.5M", CurrencyFormatter.formatCompact(Cents(350000000), Currency.USD))
    }

    @Test
    fun formatCompact_exactThousand() {
        // $1,000.00 → "$1K"
        assertEquals("$1K", CurrencyFormatter.formatCompact(Cents(100000), Currency.USD))
    }

    @Test
    fun formatCompact_exactMillion() {
        // $1,000,000.00 → "$1M"
        assertEquals("$1M", CurrencyFormatter.formatCompact(Cents(100000000), Currency.USD))
    }

    @Test
    fun formatCompact_belowThousand() {
        // $500.00 → "$500"
        assertEquals("$500", CurrencyFormatter.formatCompact(Cents(50000), Currency.USD))
    }

    @Test
    fun formatCompact_zero() {
        assertEquals("$0", CurrencyFormatter.formatCompact(Cents(0), Currency.USD))
    }

    @Test
    fun formatCompact_negative() {
        // -$1,500.00 → "-$1.5K"
        assertEquals("-$1.5K", CurrencyFormatter.formatCompact(Cents(-150000), Currency.USD))
    }

    @Test
    fun formatCompact_smallAmount() {
        // $25.50 → "$25.5"
        assertEquals("$25.5", CurrencyFormatter.formatCompact(Cents(2550), Currency.USD))
    }

    @Test
    fun formatCompact_jpy() {
        // ¥150,000 → "¥150K"
        assertEquals("¥150K", CurrencyFormatter.formatCompact(Cents(150000), Currency.JPY))
    }

    @Test
    fun formatCompact_wholeNumber_belowThousand() {
        // $100.00 → "$100"
        assertEquals("$100", CurrencyFormatter.formatCompact(Cents(10000), Currency.USD))
    }
}
