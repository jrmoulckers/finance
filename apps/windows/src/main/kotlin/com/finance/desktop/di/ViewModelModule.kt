// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.viewmodel.*
import org.koin.dsl.module

/**
 * Koin module for all ViewModel instances.
 *
 * ViewModels are registered as singletons since Compose Desktop does not
 * have Android-style lifecycle scoping. Each ViewModel's [DesktopViewModel.onCleared]
 * can be called manually if needed during navigation transitions.
 *
 * The ViewModel dependency graph mirrors the Android app:
 * - Each ViewModel receives repositories and services via constructor injection
 * - No ViewModel depends on another ViewModel directly
 * - UI state is exposed as [StateFlow] and collected in composables via [koinGet]
 */
val viewModelModule = module {
    single { DashboardViewModel(get(), get(), get()) }
    single { AccountsViewModel(get(), get()) }
    single { TransactionsViewModel(get()) }
    single { BudgetsViewModel(get(), get()) }
    single { GoalsViewModel(get()) }
    single { SyncViewModel(get()) }
    single { SettingsViewModel(get(), get()) }
    single { AuthViewModel(get(), get()) }
    single { WidgetViewModel(get()) }
}
