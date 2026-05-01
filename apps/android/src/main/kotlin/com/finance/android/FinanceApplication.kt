// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import android.app.Application
import com.finance.android.di.appModule
import com.finance.android.di.authModule
import com.finance.android.di.dataModule
import com.finance.android.di.syncModule
import com.finance.android.network.networkSecurityModule
import com.finance.android.security.SecurityChecker
import com.finance.android.notifications.NotificationChannelManager
import com.finance.android.sync.SyncWorker
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin
import org.koin.core.logger.Level
import timber.log.Timber

/**
 * Finance application entry point.
 *
 * Initializes Koin DI, Timber logging, crash reporting, and
 * background sync scheduling before any Activity is created.
 */
class FinanceApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        initLogging()
        initDependencyInjection()
        initSecurityChecks()
        initNotificationChannels()
        initBackgroundSync()
        initBillReminders()
    }

    private fun initLogging() {
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        Timber.i("Finance app starting")
    }

    private fun initDependencyInjection() {
        startKoin {
            androidLogger(if (BuildConfig.DEBUG) Level.DEBUG else Level.NONE)
            androidContext(this@FinanceApplication)
            modules(appModule, authModule, dataModule, syncModule, networkSecurityModule)
        }
        Timber.i("Koin DI initialized")
    }

    private fun initSecurityChecks() {
        // RASP checks run at startup — non-blocking.
        val checker = SecurityChecker(this)
        val report = checker.performFullCheck()
        if (!report.isSecure) {
            Timber.w("Security: %d issue(s) detected at startup", report.events.size)
        }
    }

    private fun initNotificationChannels() {
        NotificationChannelManager.createChannels(this)
        Timber.i("Notification channels created")
    }

    private fun initBackgroundSync() {
        SyncWorker.enqueuePeriodicSync(this)
        Timber.i("Background sync scheduled")
    }

    private fun initBillReminders() {
        com.finance.android.ui.screens.bills.BillReminderWorker.enqueueDaily(this)
        Timber.i("Bill reminder check scheduled")
    }
}
