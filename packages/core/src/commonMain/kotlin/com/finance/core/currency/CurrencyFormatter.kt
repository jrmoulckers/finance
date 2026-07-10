// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.currency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.math.abs

/**
 * Formats monetary amounts for display.
 * Respects currency-specific decimal places and symbols.
 */
object CurrencyFormatter {
    // Extra display symbols for a few currencies whose glyphs differ from the
    // canonical catalog's compact symbol, plus a trailing space where the code
    // is used as a symbol (e.g. "CHF "). Anything not overridden here falls back
    // to the single canonical source of truth ([CurrencyCatalog]) so symbols and
    // decimal places never diverge (#3736).
    private val symbolOverrides = mapOf(
        "CHF" to "CHF ",
    )

    /**
     * Resolve the display symbol for [code], preferring an override, then the
     * canonical [CurrencyCatalog], then the raw code with a trailing space.
     */
    private fun symbolFor(code: String): String =
        symbolOverrides[code]
            ?: com.finance.core.multicurrency.CurrencyCatalog.get(code)?.symbol
            ?: "$code "

    /**
     * Format cents as a human-readable currency string.
     * Examples: "$12.50", "€1,234.56", "¥1,235" (no decimals for JPY)
     */
    fun format(amount: Cents, currency: Currency, showSign: Boolean = false): String {
        val symbol = symbolFor(currency.code)
        val decimals = currency.decimalPlaces
        val isNegative = amount.isNegative()
        val absAmount = amount.abs().amount

        val formatted = if (decimals == 0) {
            formatWithThousandsSeparator(absAmount)
        } else {
            val divisor = pow10(decimals)
            val wholePart = absAmount / divisor
            val fractionalPart = absAmount % divisor
            "${formatWithThousandsSeparator(wholePart)}.${fractionalPart.toString().padStart(decimals, '0')}"
        }

        val sign = when {
            showSign && !isNegative && !amount.isZero() -> "+"
            isNegative -> "-"
            else -> ""
        }

        return "$sign$symbol$formatted"
    }

    /**
     * Format as a compact string (e.g., "$1.2K", "$3.5M") for dashboard displays.
     * Uses multiplatform-safe string formatting (no String.format).
     */
    fun formatCompact(amount: Cents, currency: Currency): String {
        val symbol = symbolFor(currency.code)
        val dollars = amount.amount.toDouble() / pow10(currency.decimalPlaces)
        val isNeg = dollars < 0
        val absDollars = abs(dollars)

        val (value, suffix) = when {
            absDollars >= 1_000_000 -> (absDollars / 1_000_000) to "M"
            absDollars >= 1_000 -> (absDollars / 1_000) to "K"
            else -> absDollars to ""
        }

        val sign = if (isNeg) "-" else ""
        val formatted = formatCompactNumber(value)

        return "$sign$symbol$formatted$suffix"
    }

    /**
     * Format a compact number with at most one decimal place.
     * Multiplatform-safe — does not use String.format or java.text.
     */
    private fun formatCompactNumber(value: Double): String {
        val longValue = value.toLong()
        if (value == longValue.toDouble()) return longValue.toString()

        // Round to 1 decimal place
        val rounded = kotlin.math.round(value * 10) / 10.0
        val wholePart = rounded.toLong()
        val decimalPart = kotlin.math.round((rounded - wholePart) * 10).toInt()

        return if (decimalPart == 0) {
            wholePart.toString()
        } else {
            "$wholePart.$decimalPart"
        }
    }

    private fun formatWithThousandsSeparator(value: Long): String {
        val str = value.toString()
        if (str.length <= 3) return str

        val result = StringBuilder()
        str.reversed().forEachIndexed { index, c ->
            if (index > 0 && index % 3 == 0) result.append(',')
            result.append(c)
        }
        return result.reverse().toString()
    }

    private fun pow10(n: Int): Long {
        var result = 1L
        repeat(n) { result *= 10 }
        return result
    }
}
