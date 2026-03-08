// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.currency

import com.finance.models.types.Currency
import kotlinx.datetime.Instant

/**
 * Provides exchange rates between currencies.
 * Implementations may fetch from API, cache, or use offline rates.
 */
interface ExchangeRateProvider {
    suspend fun getRate(from: Currency, to: Currency): ExchangeRate?
    suspend fun getRate(from: Currency, to: Currency, at: Instant): ExchangeRate?
    suspend fun getAvailableCurrencies(): Set<Currency>
}
