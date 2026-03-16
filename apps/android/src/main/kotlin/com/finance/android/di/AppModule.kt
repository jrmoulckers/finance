// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.logging.TimberCrashReporter
import com.finance.android.ui.screens.BiometricAvailabilityChecker
import com.finance.android.ui.screens.DefaultBiometricAvailabilityChecker
import com.finance.android.ui.screens.SettingsViewModel
import com.finance.android.ui.viewmodel.AccountsViewModel
import com.finance.android.ui.viewmodel.BudgetsViewModel
import com.finance.android.ui.viewmodel.DashboardViewModel
import com.finance.android.ui.viewmodel.TransactionCreateViewModel
import com.finance.android.ui.viewmodel.TransactionDetailViewModel
import com.finance.android.ui.viewmodel.GoalsViewModel
import com.finance.android.ui.viewmodel.TransactionsViewModel
import com.finance.core.monitoring.CrashReporter
import com.finance.core.monitoring.MetricsCollector
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

/**
 * Root Koin module for the Finance Android app.
 *
 * Provides application-scoped singletons for monitoring, logging,
 * settings dependencies, and ViewModels consumed by the UI layer.
 */
val appModule = module {

    // ── Monitoring ───────────────────────────────────────────────────

    /** Crash reporting — backed by Timber for on-device logging. */
    single<CrashReporter> {
        TimberCrashReporter(consentProvider = { false })
    }

    /**
     * Anonymous usage metrics — consent defaults to off.
     * When consent UI is implemented, wire [consentProvider]
     * to the user's preference in Settings.
     */
    single {
        MetricsCollector(consentProvider = { false })
    }

    // ── Settings dependencies ───────────────────────────────────────

    /** [SharedPreferences] used by [SettingsViewModel] for local persistence. */
    single<android.content.SharedPreferences> {
        androidContext().getSharedPreferences("finance_settings", android.content.Context.MODE_PRIVATE)
    }

    /** Biometric availability check — delegates to [androidx.biometric.BiometricManager]. */
    single<BiometricAvailabilityChecker> {
        DefaultBiometricAvailabilityChecker(androidContext())
    }

    // ── ViewModels ──────────────────────────────────────────────────

    viewModelOf(::DashboardViewModel)
    viewModelOf(::AccountsViewModel)
    viewModelOf(::BudgetsViewModel)
    viewModelOf(::TransactionsViewModel)
    viewModelOf(::TransactionCreateViewModel)
    viewModelOf(::TransactionDetailViewModel)
    viewModelOf(::GoalsViewModel)
    viewModelOf(::SettingsViewModel)
}
