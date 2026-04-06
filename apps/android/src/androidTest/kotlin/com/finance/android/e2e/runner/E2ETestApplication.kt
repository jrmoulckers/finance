// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.runner

import android.app.Application
import com.finance.android.di.appModule
import com.finance.android.e2e.fake.e2eAuthModule
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin
import org.koin.core.logger.Level
import timber.log.Timber

/**
 * Test [Application] used by [E2ETestRunner].
 *
 * Replaces the production [FinanceApplication] to initialise Koin
 * with [e2eAuthModule] instead of the production auth module.
 * This provides a pre-authenticated session so E2E tests skip
 * the login flow and interact directly with the authenticated
 * app surface.
 */
class E2ETestApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        // Plant Timber debug tree for test log output.
        Timber.plant(Timber.DebugTree())

        startKoin {
            androidLogger(Level.DEBUG)
            androidContext(this@E2ETestApplication)
            // appModule provides repositories + ViewModels.
            // e2eAuthModule provides fake auth (pre-authenticated).
            modules(appModule, e2eAuthModule)
        }
        Timber.i("E2E test application started with fake auth")
    }
}
