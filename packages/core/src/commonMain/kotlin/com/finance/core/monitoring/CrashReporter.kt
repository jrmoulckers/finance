package com.finance.core.monitoring

/**
 * Platform-agnostic interface for crash and error reporting.
 *
 * Implementations must ensure that:
 * - No PII is included in crash reports (strip user names, emails, file paths).
 * - Reporting only occurs when the user has granted consent.
 * - Financial data (amounts, account numbers, balances) is never attached to reports.
 *
 * Each platform app provides a concrete implementation backed by the
 * chosen crash reporting service (e.g., Sentry, Firebase Crashlytics).
 */
interface CrashReporter {

    /**
     * Report a caught or uncaught exception with optional context.
     *
     * @param exception The exception to report. Stack traces are sanitized
     *   by the implementation before transmission.
     * @param context Free-form key-value pairs providing diagnostic context.
     *   Keys and values must not contain PII or financial data.
     *   Example: `mapOf("screen" to "budget_list", "action" to "sync")`.
     */
    fun reportError(exception: Throwable, context: Map<String, String> = emptyMap())

    /**
     * Associate a pseudonymous user ID with subsequent crash reports.
     *
     * The ID must be a rotatable, non-reversible identifier that cannot
     * be linked back to the user's real identity. Implementations should
     * use a hash or random UUID, never an email or account ID.
     *
     * @param id Pseudonymous user identifier, or null to clear.
     */
    fun setUserId(id: String?)

    /**
     * Record a breadcrumb log message for diagnostic context.
     *
     * Breadcrumbs are attached to subsequent crash reports to help
     * reconstruct the sequence of events leading to a crash.
     * Messages must not contain PII or financial data.
     *
     * @param message Descriptive log message (e.g., "Sync started", "Budget screen opened").
     */
    fun log(message: String)

    /**
     * Check whether the user has granted consent for crash reporting.
     *
     * Implementations must return false if consent has not been
     * explicitly granted. When false, [reportError], [setUserId],
     * and [log] must be no-ops.
     *
     * @return true if crash reporting is enabled and consented.
     */
    fun isEnabled(): Boolean
}

/**
 * No-op [CrashReporter] used when crash reporting is disabled or
 * no platform implementation is available.
 */
object NoOpCrashReporter : CrashReporter {
    override fun reportError(exception: Throwable, context: Map<String, String>) = Unit
    override fun setUserId(id: String?) = Unit
    override fun log(message: String) = Unit
    override fun isEnabled(): Boolean = false
}
