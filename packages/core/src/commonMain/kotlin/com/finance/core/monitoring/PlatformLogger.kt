// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.monitoring

/**
 * Platform-agnostic logging sink for diagnostic output.
 *
 * Each platform provides an `actual` implementation backed by its native
 * logging facility (Android Logcat, iOS os_log, console.log for JS/Web,
 * java.util.logging for JVM/Windows).
 *
 * Log levels follow the standard severity hierarchy:
 * DEBUG < INFO < WARN < ERROR
 *
 * Implementations must:
 * - Never log PII, financial amounts, or account identifiers.
 * - Be safe to call from any thread/dispatcher.
 * - Be lightweight (no I/O blocking on the calling thread).
 */
expect object PlatformLogger {
    /** Log a debug-level message. */
    fun debug(tag: String, message: String)

    /** Log an info-level message. */
    fun info(tag: String, message: String)

    /** Log a warning-level message. */
    fun warn(tag: String, message: String)

    /** Log an error-level message with optional throwable. */
    fun error(tag: String, message: String, throwable: Throwable? = null)
}
