// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.types.Cents
import com.finance.models.types.Currency

/**
 * Provides public money formatting utilities for export and display.
 *
 * Centralizes the conversion from [Cents] (internal Long representation)
 * to human-readable decimal strings with proper currency formatting.
 *
 * These functions are used by both [JsonExportSerializer] and
 * [CsvExportSerializer], and can also be used by platform UI layers
 * that need to format monetary values from shared models.
 *
 * ## Currency handling
 * Decimal places are determined by [Currency.decimalPlaces]:
 * - Most currencies (USD, EUR, GBP, etc.): 2 decimal places
 * - Japanese Yen, Korean Won, Vietnamese Dong: 0 decimal places
 * - Bahraini Dinar, Kuwaiti Dinar, Omani Rial: 3 decimal places
 *
 * ## Examples
 * ```
 * MoneyFormatter.formatDecimal(Cents(1250), Currency.USD)  // "12.50"
 * MoneyFormatter.formatDecimal(Cents(-350), Currency.USD)  // "-3.50"
 * MoneyFormatter.formatDecimal(Cents(1000), Currency.JPY)  // "1000"
 * MoneyFormatter.formatDecimal(Cents(12345), Currency("BHD")) // "12.345"
 * MoneyFormatter.formatWithCode(Cents(1250), Currency.USD)  // "12.50 USD"
 * ```
 */
object MoneyFormatter {

    /**
     * Formats a [Cents] value as a decimal display string using the
     * currency's [Currency.decimalPlaces].
     *
     * @param cents The monetary amount in minor units.
     * @param currency The currency (determines decimal places).
     * @return Decimal string (e.g., "12.50", "-3.50", "1000").
     */
    fun formatDecimal(cents: Cents, currency: Currency): String {
        return formatCentsDisplay(cents, currency)
    }

    /**
     * Formats a [Cents] value as a decimal string with the ISO 4217
     * currency code appended.
     *
     * @param cents The monetary amount in minor units.
     * @param currency The currency.
     * @return String like "12.50 USD" or "1000 JPY".
     */
    fun formatWithCode(cents: Cents, currency: Currency): String {
        return "${formatDecimal(cents, currency)} ${currency.code}"
    }

    /**
     * Converts a [Cents] value to its major unit representation as a Double.
     *
     * ⚠️ **Use only for display purposes** — never for arithmetic.
     * Financial calculations must always use [Cents] (Long-based).
     *
     * @param cents The monetary amount in minor units.
     * @param currency The currency (determines divisor).
     * @return The amount in major units (e.g., 12.50 for 1250 cents USD).
     */
    fun toMajorUnits(cents: Cents, currency: Currency): Double {
        val decimals = currency.decimalPlaces
        if (decimals == 0) return cents.amount.toDouble()
        var divisor = 1.0
        repeat(decimals) { divisor *= 10 }
        return cents.amount.toDouble() / divisor
    }
}
