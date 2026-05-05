// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.core.currency.CurrencyConverter
import com.finance.core.currency.ExchangeRateProvider
import com.finance.desktop.data.repository.CurrencyRepository
import com.finance.desktop.data.repository.impl.CachedExchangeRateProvider
import org.koin.dsl.module

/**
 * Koin module for multi-currency support.
 *
 * Provides the KMP shared [ExchangeRateProvider] and [CurrencyConverter]
 * for use by [CurrencyViewModel] and any other currency-aware components.
 *
 * The [CachedExchangeRateProvider] wraps the backend exchange rate API
 * with an in-memory cache (5-minute TTL) to minimize network calls during
 * rapid conversions.
 */
val currencyModule = module {
    single<ExchangeRateProvider> { CachedExchangeRateProvider() }
    single { CurrencyConverter(get()) }
    single { CurrencyRepository(get(), get()) }
}
