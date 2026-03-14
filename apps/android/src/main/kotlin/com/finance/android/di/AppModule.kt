// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.logging.TimberCrashReporter
import com.finance.core.monitoring.CrashReporter
import com.finance.core.monitoring.MetricsCollector
import org.koin.dsl.module

/**
 * Root Koin module for the Finance Android app.
 *
 * Provides application-scoped singletons for monitoring, logging,
 * and shared services consumed by ViewModels and UI layers.
 */
val appModule = module {

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
}
