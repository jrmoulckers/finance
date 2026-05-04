// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import com.finance.core.currency.ConversionResult
import com.finance.core.currency.CurrencyConverter
import com.finance.core.currency.ExchangeRateProvider
import com.finance.models.types.Cents
import com.finance.models.types.Currency

/**
 * Repository that coordinates currency operations for the Windows desktop app.
 *
 * Wraps the KMP shared [ExchangeRateProvider] and [CurrencyConverter],
 * providing a higher-level API for common multi-currency operations
 * such as converting account balances to a home currency.
 *
 * @param rateProvider The exchange rate provider (cached, offline-capable).
 * @param converter The KMP shared currency converter.
 */
class CurrencyRepository(
    private val rateProvider: ExchangeRateProvider,
    private val converter: CurrencyConverter,
) {
    /**
     * Convert an amount from one currency to the user's home currency.
     *
     * @param amount The amount in cents in the source currency.
     * @param fromCurrency The source currency.
     * @param homeCurrency The user's home currency.
     * @return The [ConversionResult], or null if the currencies are the same.
     */
    suspend fun convertToHomeCurrency(
        amount: Cents,
        fromCurrency: Currency,
        homeCurrency: Currency,
    ): ConversionResult? {
        if (fromCurrency == homeCurrency) return null
        return converter.convert(amount, fromCurrency, homeCurrency)
    }

    /**
     * Get all available currencies from the exchange rate provider.
     */
    suspend fun getAvailableCurrencies(): Set<Currency> {
        return rateProvider.getAvailableCurrencies()
    }
}
