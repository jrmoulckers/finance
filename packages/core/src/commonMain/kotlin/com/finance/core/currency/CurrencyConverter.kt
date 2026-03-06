package com.finance.core.currency

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.core.money.MoneyOperations

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

        val converted = MoneyOperations.multiply(amount, rate.rate)
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
