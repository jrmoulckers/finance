// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Measures wall-clock duration of an operation in milliseconds.
 *
 * Create instances via [start] and call [stop] to get the elapsed time.
 * The timer uses [kotlinx.datetime.Clock] for multiplatform compatibility
 * (no `java.lang.System.nanoTime()`).
 *
 * Timers are single-use: calling [stop] multiple times returns the same
 * duration (captured on the first [stop] call).
 *
 * Usage:
 * ```
 * val timer = PerformanceTimer.start()
 * // ... perform operation ...
 * val durationMs = timer.stop()
 * ```
 *
 * @param clock Clock source for timestamps.
 * @param operationName Optional name for diagnostic logging.
 * @param startTime The instant when the timer was started.
 */
class PerformanceTimer private constructor(
    private val clock: Clock,
    val operationName: String,
    private val startTime: Instant,
) {
    private var endTime: Instant? = null

    /**
     * Stop the timer and return elapsed milliseconds.
     *
     * Subsequent calls return the same value (first-stop semantics).
     *
     * @return Elapsed time in milliseconds (always ≥ 0).
     */
    fun stop(): Long {
        if (endTime == null) {
            endTime = clock.now()
        }
        return elapsedMs
    }

    /**
     * Elapsed time in milliseconds since the timer was started.
     *
     * If [stop] has been called, returns the frozen duration.
     * If [stop] has not been called, returns the live elapsed time.
     */
    val elapsedMs: Long
        get() {
            val end = endTime ?: clock.now()
            return (end - startTime).inWholeMilliseconds.coerceAtLeast(0)
        }

    /** Whether [stop] has been called. */
    val isStopped: Boolean get() = endTime != null

    /** The instant when the timer was started. */
    val startedAt: Instant get() = startTime

    companion object {
        /**
         * Create and start a new [PerformanceTimer].
         *
         * @param clock Clock source. Defaults to [Clock.System].
         * @param operationName Optional name for the timed operation.
         * @return A running [PerformanceTimer].
         */
        fun start(
            clock: Clock = Clock.System,
            operationName: String = "",
        ): PerformanceTimer {
            return PerformanceTimer(
                clock = clock,
                operationName = operationName,
                startTime = clock.now(),
            )
        }
    }
}
