// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import android.app.Application

/**
 * Finance application entry point.
 *
 * Initializes application-level dependencies and configuration.
 * DI framework (e.g. Koin) can be set up here in a future iteration.
 */
class FinanceApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        // TODO: Initialize DI (Koin), logging, crash reporting
    }
}
