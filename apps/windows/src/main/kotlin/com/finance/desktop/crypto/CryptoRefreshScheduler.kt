// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────────────
// Near-real-time refresh scheduler — Issue #2702
//
// Drives periodic refreshes for the Windows crypto ViewModel with cooperative
// cancellation and exponential rate-limit backoff. The backoff maths lives in a
// pure helper so it is unit-testable without spinning up coroutines.
// ─────────────────────────────────────────────────────────────────────────────

/** Raised by a price source when the provider signals HTTP 429 / throttling. */
class RateLimitException(message: String = "Rate limited by market-data provider") :
    Exception(message)

/**
 * Pure backoff calculator. On success the interval resets to [baseIntervalMs];
 * on a rate-limit hit it doubles up to [maxIntervalMs].
 */
object RefreshBackoff {
    /** Next delay after a successful refresh. */
    fun onSuccess(baseIntervalMs: Long): Long = baseIntervalMs

    /** Next delay after a rate-limit hit, given the [current] delay. */
    fun onRateLimited(current: Long, baseIntervalMs: Long, maxIntervalMs: Long): Long {
        val doubled = (maxOf(current, baseIntervalMs)) * 2
        return doubled.coerceAtMost(maxIntervalMs)
    }
}

/**
 * Schedules repeated invocations of a suspending refresh block on [scope].
 *
 * Cancellation is cooperative: [stop] cancels the running [Job], and the loop
 * also exits when the scope is cancelled (e.g. ViewModel `onCleared`). A
 * [RateLimitException] triggers exponential backoff; other exceptions are
 * reported via [onError] and retried at the base interval.
 *
 * @param scope Coroutine scope the polling loop runs in.
 * @param baseIntervalMs Delay between successful refreshes.
 * @param maxIntervalMs Upper bound for backoff.
 * @param onError Callback for surfaced errors (logging / stale-state UI).
 */
class CryptoRefreshScheduler(
    private val scope: CoroutineScope,
    private val baseIntervalMs: Long = MarketDataConfig.DEFAULT_REFRESH_INTERVAL_MS,
    private val maxIntervalMs: Long = 5 * 60_000L,
    private val onError: (Throwable) -> Unit = {},
) {
    private var job: Job? = null

    /** True while the polling loop is active. */
    val isRunning: Boolean get() = job?.isActive == true

    /**
     * Starts (or restarts) the polling loop. [block] is invoked immediately and
     * then once per interval until [stop] is called or the scope is cancelled.
     */
    fun start(block: suspend () -> Unit) {
        stop()
        job = scope.launch {
            var interval = baseIntervalMs
            while (isActive) {
                interval = try {
                    block()
                    RefreshBackoff.onSuccess(baseIntervalMs)
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (rateLimit: RateLimitException) {
                    onError(rateLimit)
                    RefreshBackoff.onRateLimited(interval, baseIntervalMs, maxIntervalMs)
                } catch (@Suppress("TooGenericExceptionCaught") error: Exception) {
                    onError(error)
                    baseIntervalMs
                }
                delay(interval)
            }
        }
    }

    /** Cancels the polling loop. Safe to call repeatedly. */
    fun stop() {
        job?.cancel()
        job = null
    }
}
