// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.logging

import com.finance.core.monitoring.CrashReporter
import timber.log.Timber

/**
 * [CrashReporter] implementation backed by Timber.
 *
 * Logs errors and breadcrumbs through Timber's structured logging.
 * No crash reports are transmitted to external services — all data
 * stays on-device. When a third-party crash service (e.g., Sentry)
 * is integrated in a future iteration, this class should be updated
 * to forward reports to that service.
 *
 * Consent is checked on every call; when disabled all methods are no-ops.
 *
 * @param consentProvider Returns true when the user has opted in to crash reporting.
 */
class TimberCrashReporter(
    private val consentProvider: () -> Boolean,
) : CrashReporter {

    override fun reportError(exception: Throwable, context: Map<String, String>) {
        if (!consentProvider()) return
        if (context.isNotEmpty()) {
            Timber.e(exception, "Crash context: %s", context)
        } else {
            Timber.e(exception)
        }
    }

    override fun setUserId(id: String?) {
        if (!consentProvider()) return
        Timber.tag("CrashReporter").i("User ID set: %s", id ?: "<cleared>")
    }

    override fun log(message: String) {
        if (!consentProvider()) return
        Timber.tag("CrashReporter").d(message)
    }

    override fun isEnabled(): Boolean = consentProvider()
}
