// SPDX-License-Identifier: BUSL-1.1

package com.finance.android

import android.app.Application
import com.finance.android.di.appModule
import com.finance.android.di.dataModule
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin
import org.koin.core.logger.Level
import timber.log.Timber

/**
 * Finance application entry point.
 *
 * Initializes Koin DI, Timber logging, and crash reporting
 * before any Activity is created.
 */
class FinanceApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        initLogging()
        initDependencyInjection()
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
            modules(appModule, dataModule)
        }
        Timber.i("Koin DI initialized")
    }
}
