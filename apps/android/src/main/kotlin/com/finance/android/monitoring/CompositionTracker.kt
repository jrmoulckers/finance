// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.monitoring

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import com.finance.android.BuildConfig
import timber.log.Timber

/**
 * Compose recomposition and performance tracking utilities.
 *
 * Provides tools for detecting unnecessary recompositions, tracking
 * frame drops, and marking data classes as stable for the Compose
 * compiler.
 *
 * All tracking is **debug-only** — no-ops in release builds.
 *
 * ## Privacy
 * Only performance metrics (counts, timings) are logged. No financial
 * data is ever included in trace output.
 */
object CompositionTracker {

    private const val TAG = "ComposePerf"

    /**
     * Logs recomposition events for a named composable (debug only).
     *
     * Place at the top of a @Composable function to track how often
     * it recomposes:
     * ```kotlin
     * @Composable
     * fun MyScreen() {
     *     CompositionTracker.trackRecomposition("MyScreen")
     *     // ...
     * }
     * ```
     *
     * @param name A human-readable name for the composable.
     */
    @Composable
    fun trackRecomposition(name: String) {
        if (!BuildConfig.DEBUG) return
        val count = remember { RecompositionCounter() }
        count.increment()
        LaunchedEffect(count.value) {
            if (count.value > 1) {
                Timber.tag(TAG).d(
                    "Recomposition #%d: %s",
                    count.value,
                    name,
                )
            }
        }
    }

    /**
     * Tracks the load time of a composable screen.
     *
     * @param screenName Name of the screen being tracked.
     * @param startTimeMs Timestamp from [android.os.SystemClock.elapsedRealtime]
     *   captured before the composable renders.
     */
    fun trackScreenLoadTime(screenName: String, startTimeMs: Long) {
        if (!BuildConfig.DEBUG) return
        val elapsed = android.os.SystemClock.elapsedRealtime() - startTimeMs
        PerformanceMonitor.trackScreenLoad(screenName, elapsed)
    }
}

/**
 * Mutable counter for tracking recomposition frequency.
 *
 * Annotated with [@Stable] to prevent the counter itself from
 * triggering additional recompositions.
 */
@Stable
class RecompositionCounter {
    var value: Int = 0
        private set

    /** Increments the recomposition count. */
    fun increment() {
        value++
    }
}

/**
 * Marks a data class as stable for the Compose compiler.
 *
 * Use this annotation on UI state classes that hold only immutable
 * or effectively-immutable data to help the Compose compiler skip
 * unnecessary recompositions.
 *
 * Example:
 * ```kotlin
 * @StableData
 * data class AccountCardState(
 *     val name: String,
 *     val balanceFormatted: String,
 * )
 * ```
 */
@Target(AnnotationTarget.CLASS)
@Retention(AnnotationRetention.BINARY)
annotation class StableData