// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import org.koin.core.module.Module

/**
 * Aggregated Koin module list for the Finance Windows desktop application.
 *
 * Composes all feature-specific modules into a single list suitable for
 * `startKoin { modules(appModules) }`. Module ordering does not matter —
 * Koin resolves dependencies lazily at injection time.
 *
 * ## Module Breakdown
 *
 * | Module             | Contents                                              |
 * |--------------------|-------------------------------------------------------|
 * | [databaseModule]   | DPAPI-encrypted SQLCipher database via SQLDelight      |
 * | [repositoryModule] | SQLDelight-backed repository bindings                  |
 * | [currencyModule]   | ExchangeRateProvider, CurrencyConverter, CurrencyRepo  |
 * | [syncModule]       | KMP sync engine, provider, mutation queue              |
 * | [securityModule]   | WindowsHelloManager, DpapiManager, TokenStorage        |
 * | [platformModule]   | DesktopNotificationManager                             |
 * | [viewModelModule]  | All ViewModels (Dashboard, Accounts, Auth, etc.)       |
 *
 * @see databaseModule
 * @see repositoryModule
 * @see syncModule
 * @see securityModule
 * @see platformModule
 * @see viewModelModule
 */
val appModules: List<Module> = listOf(
    databaseModule,
    repositoryModule,
    currencyModule,
    authModule,
    syncModule,
    securityModule,
    platformModule,
    viewModelModule,
)
