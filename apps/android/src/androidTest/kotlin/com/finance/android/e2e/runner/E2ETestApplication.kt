// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.runner

import android.app.Application
import com.finance.android.di.appModule
import com.finance.android.e2e.fake.e2eAuthModule
import com.finance.android.e2e.fake.e2eSyncModule
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.core.context.startKoin
import org.koin.core.logger.Level
import timber.log.Timber

/**
 * Test [Application] used by [E2ETestRunner].
 *
 * Replaces the production [FinanceApplication] to initialise Koin
 * with [e2eAuthModule] and [e2eSyncModule] instead of the production
 * auth and sync modules. This provides a pre-authenticated session
 * with in-memory data so E2E tests skip the login flow and run
 * without any network or Supabase/PowerSync dependencies.
 *
 * All data is backed by in-memory repositories from [appModule],
 * ensuring tests are isolated and deterministic.
 */
class E2ETestApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        // Plant Timber debug tree for test log output.
        Timber.plant(Timber.DebugTree())

        startKoin {
            androidLogger(Level.DEBUG)
            androidContext(this@E2ETestApplication)
            // appModule provides in-memory repositories + ViewModels.
            // e2eAuthModule provides fake auth (pre-authenticated).
            // e2eSyncModule provides in-memory sync (no network).
            modules(appModule, e2eAuthModule, e2eSyncModule)
        }
        Timber.i("E2E test application started with fake auth and in-memory sync")
    }
}
