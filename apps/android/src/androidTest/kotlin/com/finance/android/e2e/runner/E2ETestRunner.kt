// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.runner

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner

/**
 * Custom instrumented test runner for E2E tests.
 *
 * Replaces [com.finance.android.FinanceApplication] with
 * [E2ETestApplication] so that Koin is initialised with fake
 * auth dependencies instead of production network layers.
 */
class E2ETestRunner : AndroidJUnitRunner() {

    override fun newApplication(
        cl: ClassLoader?,
        className: String?,
        context: Context?,
    ): Application {
        return super.newApplication(
            cl,
            E2ETestApplication::class.java.name,
            context,
        )
    }
}
