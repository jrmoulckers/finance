// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.i18n

import com.finance.models.types.Cents
import com.finance.models.types.Currency

/**
 * Multiplatform currency and number formatting utilities.
 *
 * Provides basic formatting for monetary values using [Cents] and [Currency].
 * Platform apps may replace these with native formatters (NSNumberFormatter,
 * java.text.NumberFormat, Intl.NumberFormat) for full locale fidelity.
 * These serve as the commonMain baseline for tests and simple use cases.
 */
object NumberFormatting {

    /**
     * Format a [Cents] value with a currency symbol.
     *
     * Examples:
     * - `formatCents(Cents(12345), Currency.USD)` → "$123.45"
     * - `formatCents(Cents(-500), Currency.EUR)` → "-€5.00"
     * - `formatCents(Cents(1000), Currency.JPY)` → "¥1000"
     *
     * @param cents The monetary amount in minor units.
     * @param currency The currency for symbol and decimal place lookup.
     * @param showSign Whether to always show + for positive amounts.
     */
    fun formatCents(cents: Cents, currency: Currency, showSign: Boolean = false): String {
        val symbol = currencySymbol(currency)
        val decimals = currency.decimalPlaces
        val isNegative = cents.isNegative()
        val absAmount = cents.abs().amount

        val formatted = if (decimals == 0) {
            absAmount.toString()
        } else {
            val divisor = pow10(decimals)
            val wholePart = absAmount / divisor
            val fracPart = absAmount % divisor
            val fracStr = fracPart.toString().padStart(decimals, '0')
            "$wholePart.$fracStr"
        }

        val sign = when {
            isNegative -> "-"
            showSign && !cents.isZero() -> "+"
            else -> ""
        }

        return "$sign$symbol$formatted"
    }

    /**
     * Format a percentage with specified decimal places.
     *
     * @param value The percentage value (e.g., 75.5 for 75.5%).
     * @param decimals Number of decimal places (default 1).
     */
    fun formatPercent(value: Double, decimals: Int = 1): String {
        val factor = pow10(decimals)
        val rounded = (value * factor + 0.5).toLong()
        val wholePart = rounded / factor
        return if (decimals == 0) {
            "$wholePart%"
        } else {
            val fracPart = rounded % factor
            val fracStr = fracPart.toString().padStart(decimals, '0')
            "$wholePart.$fracStr%"
        }
    }

    /**
     * Get the symbol for a currency code. Falls back to the ISO code.
     */
    fun currencySymbol(currency: Currency): String = when (currency.code) {
        "USD", "CAD", "AUD", "NZD", "HKD", "SGD" -> "$"
        "EUR" -> "\u20AC"
        "GBP" -> "\u00A3"
        "JPY", "CNY" -> "\u00A5"
        "KRW" -> "\u20A9"
        "INR" -> "\u20B9"
        "BRL" -> "R$"
        "MXN" -> "MX$"
        "CHF" -> "CHF "
        else -> "${currency.code} "
    }

    private fun pow10(n: Int): Long {
        var result = 1L
        repeat(n) { result *= 10L }
        return result
    }
}
