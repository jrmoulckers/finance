// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.security

import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module
import timber.log.Timber

/**
 * Koin module providing Runtime Application Self-Protection (RASP) components.
 *
 * Registers the [SecurityChecker] as a singleton and performs an initial
 * security check at module load time. If critical security events are
 * detected, they are logged via Timber for diagnostic purposes.
 *
 * ## Integration
 * Add this module to `startKoin { modules(..., securityModule) }` in
 * [com.finance.android.FinanceApplication].
 *
 * ## Privacy
 * Security events are logged without device identifiers or user data.
 */
val securityModule = module {

    /** [SecurityChecker] singleton — performs RASP checks. */
    single {
        SecurityChecker(androidContext()).also { checker ->
            val report = checker.performFullCheck()
            if (!report.isSecure) {
                Timber.w(
                    "RASP: %d security event(s) detected at startup",
                    report.events.size,
                )
                report.events.forEach { event ->
                    Timber.w("RASP event: [%s] %s", event.severity, event.message)
                }
            } else {
                Timber.i("RASP: all security checks passed")
            }
        }
    }
}