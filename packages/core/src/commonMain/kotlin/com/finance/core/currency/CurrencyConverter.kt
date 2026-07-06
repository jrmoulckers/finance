// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.currency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.core.money.MoneyOperations
import kotlin.math.pow

/**
 * Converts monetary amounts between currencies using exchange rates.
 */
class CurrencyConverter(
    private val rateProvider: ExchangeRateProvider,
) {
    /**
     * Convert an amount from one currency to another.
     * Uses banker's rounding for the conversion.
     */
    suspend fun convert(amount: Cents, from: Currency, to: Currency): ConversionResult {
        if (from == to) return ConversionResult(amount, amount, null)

        val rate = rateProvider.getRate(from, to)
            ?: throw CurrencyConversionException("No exchange rate available for ${from.code} -> ${to.code}")

        // `amount` is in the source currency's minor units, but `rate` converts
        // *major* units (e.g. 1 USD = 149.5 JPY). Rescale by the minor-unit
        // delta (10^(toDecimals - fromDecimals)) so converting to/from
        // zero-decimal currencies like JPY/KRW is not off by a power of ten
        // (#3460). Banker's rounding is still applied by MoneyOperations.multiply.
        val scaleFactor = 10.0.pow(to.decimalPlaces - from.decimalPlaces)
        val converted = MoneyOperations.multiply(amount, rate.rate * scaleFactor)
        return ConversionResult(
            originalAmount = amount,
            convertedAmount = converted,
            rateUsed = rate,
        )
    }
}

data class ConversionResult(
    val originalAmount: Cents,
    val convertedAmount: Cents,
    val rateUsed: ExchangeRate?,
)

class CurrencyConversionException(message: String) : Exception(message)
