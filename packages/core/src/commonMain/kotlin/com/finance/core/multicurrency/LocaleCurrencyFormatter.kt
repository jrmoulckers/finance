// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.multicurrency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlin.math.abs

/**
 * Locale-aware currency formatting engine.
 *
 * Supports multiple formatting conventions:
 * - **US/UK style**: `$1,234.56` (symbol before, dot decimal, comma thousands)
 * - **European style**: `1.234,56 €` (symbol after, comma decimal, dot thousands)
 * - **Swiss style**: `CHF 1'234.56` (code before, dot decimal, apostrophe thousands)
 * - **Zero-decimal**: `¥1,235` (JPY, KRW — no decimal part)
 * - **3-decimal**: `BD1,234.567` (BHD, KWD, OMR)
 *
 * All formatting operates on [Cents] to avoid floating-point errors.
 */
object LocaleCurrencyFormatter {

    /**
     * Locale formatting convention.
     *
     * @property decimalSeparator Character between whole and fractional parts.
     * @property thousandsSeparator Character between groups of three digits.
     * @property symbolPosition Whether the currency symbol comes before or after the amount.
     */
    enum class LocaleConvention(
        val decimalSeparator: Char,
        val thousandsSeparator: Char,
        val symbolPosition: SymbolPosition,
    ) {
        /** US/UK: $1,234.56 */
        US_UK('.', ',', SymbolPosition.BEFORE),

        /** Continental European: 1.234,56 € */
        EUROPEAN(',', '.', SymbolPosition.AFTER),

        /** Swiss: CHF 1'234.56 */
        SWISS('.', '\'', SymbolPosition.BEFORE),

        /** Indian: ₹1,23,456.78 (lakh grouping not implemented — uses standard grouping) */
        INDIAN('.', ',', SymbolPosition.BEFORE),
    }

    /** Position of the currency symbol relative to the amount. */
    enum class SymbolPosition { BEFORE, AFTER }

    /**
     * Format a monetary amount with locale-aware conventions.
     *
     * @param amount The amount in cents.
     * @param currency The currency to format for.
     * @param convention The locale formatting convention.
     * @param showSign If `true`, prepend `+` for positive amounts.
     * @param useCode If `true`, use the ISO code (e.g., "USD") instead of the symbol.
     * @return A formatted string like `$1,234.56` or `1.234,56 €`.
     */
    fun format(
        amount: Cents,
        currency: Currency,
        convention: LocaleConvention = LocaleConvention.US_UK,
        showSign: Boolean = false,
        useCode: Boolean = false,
    ): String {
        val def = CurrencyCatalog.get(currency.code)
        val symbol = if (useCode) currency.code else (def?.symbol ?: currency.code)
        val decimals = def?.decimalPlaces ?: currency.decimalPlaces
        val isNegative = amount.isNegative()
        val absAmount = amount.abs().amount

        val formattedNumber = formatNumber(
            absAmount = absAmount,
            decimals = decimals,
            decimalSep = convention.decimalSeparator,
            thousandsSep = convention.thousandsSeparator,
        )

        val sign = when {
            showSign && !isNegative && !amount.isZero() -> "+"
            isNegative -> "-"
            else -> ""
        }

        return when (convention.symbolPosition) {
            SymbolPosition.BEFORE -> "$sign$symbol$formattedNumber"
            SymbolPosition.AFTER -> "$sign$formattedNumber $symbol"
        }
    }

    /**
     * Format an amount for compact display (e.g., dashboard widgets).
     *
     * Abbreviates large values: `$1.2K`, `$3.5M`, `$1.2B`.
     *
     * @param amount The amount in cents.
     * @param currency The currency.
     * @param convention Locale convention for decimal/thousands separators.
     * @return Compact formatted string.
     */
    @Suppress("UnusedParameter")
    fun formatCompact(
        amount: Cents,
        currency: Currency,
        convention: LocaleConvention = LocaleConvention.US_UK,
    ): String {
        val def = CurrencyCatalog.get(currency.code)
        val symbol = def?.symbol ?: currency.code
        val decimals = def?.decimalPlaces ?: currency.decimalPlaces
        val divisor = pow10(decimals)

        val dollars = amount.amount.toDouble() / divisor
        val isNeg = dollars < 0
        val absDollars = abs(dollars)

        val (value, suffix) = when {
            absDollars >= 1_000_000_000 -> (absDollars / 1_000_000_000) to "B"
            absDollars >= 1_000_000 -> (absDollars / 1_000_000) to "M"
            absDollars >= 1_000 -> (absDollars / 1_000) to "K"
            else -> absDollars to ""
        }

        val sign = if (isNeg) "-" else ""
        val formatted = formatOneDecimal(value)

        return "$sign$symbol$formatted$suffix"
    }

    // ═════════════════════════════════════════════════════════════════
    // Internal helpers
    // ═════════════════════════════════════════════════════════════════

    private fun formatNumber(
        absAmount: Long,
        decimals: Int,
        decimalSep: Char,
        thousandsSep: Char,
    ): String {
        if (decimals == 0) {
            return formatWithThousandsSep(absAmount, thousandsSep)
        }

        val divisor = pow10(decimals)
        val wholePart = absAmount / divisor
        val fractionalPart = absAmount % divisor

        val wholeStr = formatWithThousandsSep(wholePart, thousandsSep)
        val fracStr = fractionalPart.toString().padStart(decimals, '0')

        return "$wholeStr$decimalSep$fracStr"
    }

    private fun formatWithThousandsSep(value: Long, sep: Char): String {
        val str = value.toString()
        if (str.length <= 3) return str

        val result = StringBuilder()
        str.reversed().forEachIndexed { index, c ->
            if (index > 0 && index % 3 == 0) result.append(sep)
            result.append(c)
        }
        return result.reverse().toString()
    }

    private fun formatOneDecimal(value: Double): String {
        val longValue = value.toLong()
        if (value == longValue.toDouble()) return longValue.toString()

        val rounded = kotlin.math.round(value * 10) / 10.0
        val whole = rounded.toLong()
        val dec = kotlin.math.round((rounded - whole) * 10).toInt()

        return if (dec == 0) whole.toString() else "$whole.$dec"
    }

    private fun pow10(n: Int): Long {
        var result = 1L
        repeat(n) { result *= 10 }
        return result
    }
}
