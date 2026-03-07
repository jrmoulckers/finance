package com.finance.android

import android.app.Application
import com.finance.android.notifications.NotificationChannels

/**
 * Finance application entry point.
 *
 * Initializes application-level dependencies and configuration.
 * DI framework (e.g. Koin) can be set up here in a future iteration.
 */
class FinanceApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.createAll(this)
        // TODO: Initialize DI (Koin), logging, crash reporting
    }
}
