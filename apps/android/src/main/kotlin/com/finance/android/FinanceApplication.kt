// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import android.app.Application
import com.finance.android.di.appModule
import com.finance.android.di.dataModule
import com.finance.android.di.syncModule
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
        initBackgroundSync()
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
            modules(appModule, dataModule, syncModule)
        }
        Timber.i("Koin DI initialized")
    }

    private fun initBackgroundSync() {
        SyncWorker.enqueuePeriodicSync(this)
        Timber.i("Background sync scheduled")
    }
}
