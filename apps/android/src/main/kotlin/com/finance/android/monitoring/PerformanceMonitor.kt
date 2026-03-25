// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.monitoring

import com.finance.android.BuildConfig
import timber.log.Timber

/**
 * Lightweight performance monitoring for debug builds.
 *
 * Tracks frame drops, startup time, and screen load times.
 * All methods are no-ops in release builds to avoid any overhead.
 *
 * ## Privacy
 * This monitor only logs timing data — **never** financial values,
 * account identifiers, or user information.
 */
object PerformanceMonitor {

    @PublishedApi internal const val TAG = "PerfMonitor"

    private const val SLOW_STARTUP_THRESHOLD_MS = 500L
    private const val SLOW_SCREEN_LOAD_THRESHOLD_MS = 300L
    private const val SLOW_QUERY_THRESHOLD_MS = 100L

    fun trackStartupTime(startMs: Long) {
        if (!BuildConfig.DEBUG) return
        val elapsed = android.os.SystemClock.elapsedRealtime() - startMs
        if (elapsed > SLOW_STARTUP_THRESHOLD_MS) {
            Timber.tag(TAG).w("Slow startup detected: %d ms", elapsed)
        } else {
            Timber.tag(TAG).d("Startup completed in %d ms", elapsed)
        }
    }

    fun trackScreenLoad(screenName: String, loadTimeMs: Long) {
        if (!BuildConfig.DEBUG) return
        if (loadTimeMs > SLOW_SCREEN_LOAD_THRESHOLD_MS) {
            Timber.tag(TAG).w("Slow screen load — %s: %d ms", screenName, loadTimeMs)
        } else {
            Timber.tag(TAG).d("Screen loaded — %s: %d ms", screenName, loadTimeMs)
        }
    }

    fun trackDatabaseQuery(queryName: String, durationMs: Long) {
        if (!BuildConfig.DEBUG) return
        if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
            Timber.tag(TAG).w("Slow query — %s: %d ms", queryName, durationMs)
        } else {
            Timber.tag(TAG).d("Query completed — %s: %d ms", queryName, durationMs)
        }
    }

    inline fun <T> trace(label: String, block: () -> T): T {
        if (!BuildConfig.DEBUG) return block()
        val start = android.os.SystemClock.elapsedRealtime()
        val result = block()
        val elapsed = android.os.SystemClock.elapsedRealtime() - start
        Timber.tag(TAG).d("Trace [%s]: %d ms", label, elapsed)
        return result
    }
}
