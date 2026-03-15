// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.monitoring

import com.finance.core.monitoring.CrashReporter

/**
 * Sentry integration configuration for the Finance Android app (#410).
 *
 * This file contains the placeholder implementation for Sentry-Android
 * integration. When activated, it replaces the current [TimberCrashReporter]
 * as the production [CrashReporter] implementation while keeping Timber
 * as a local logging fallback.
 *
 * ## Privacy Contract
 *
 * This implementation enforces the same privacy guarantees as the
 * [CrashReporter] interface contract:
 *
 * - **No PII**: email, display name, avatar URL are never sent
 * - **No financial data**: amounts, balances, account names, payees, notes
 * - **No auth material**: tokens, API keys, session IDs, encryption keys
 * - **Consent-gated**: all reporting is no-op unless user has opted in
 * - **Pseudonymous IDs only**: user identification uses rotatable UUIDs
 *
 * ## Environment Variables (via BuildConfig)
 *
 * - `SENTRY_DSN` — Sentry project DSN (set in CI/CD, never committed to source)
 * - `SENTRY_ENVIRONMENT` — Environment name (debug, staging, production)
 *
 * ## Integration Steps (when ready)
 *
 * 1. Add `io.sentry:sentry-android` dependency to `apps/android/build.gradle.kts`
 * 2. Add `io.sentry.android.gradle` plugin for ProGuard mapping upload
 * 3. Set `SENTRY_DSN` in `local.properties` (dev) or CI secrets (prod)
 * 4. Uncomment the implementation below
 * 5. Update `AppModule.kt` to provide `SentryCrashReporter` instead of `TimberCrashReporter`
 * 6. Implement consent UI (#367) and wire `consentProvider` to user preference
 */

// TODO (#367): Uncomment and complete when consent UI is implemented.
//
// import io.sentry.Sentry
// import io.sentry.SentryEvent
// import io.sentry.SentryOptions
// import io.sentry.Breadcrumb
// import io.sentry.protocol.User
// import timber.log.Timber

/**
 * [CrashReporter] backed by Sentry-Android with Timber fallback.
 *
 * Reports errors to Sentry when consent is granted, and always logs
 * locally via Timber for on-device diagnostics.
 *
 * @param consentProvider Returns true when the user has opted in to crash reporting.
 * @param dsn Sentry project DSN. Must be provided via BuildConfig, never hardcoded.
 * @param environment Sentry environment name (e.g., "production", "staging").
 */
class SentryCrashReporter(
    private val consentProvider: () -> Boolean,
    private val dsn: String,
    private val environment: String,
) : CrashReporter {

    // TODO: Uncomment when Sentry dependency is added.
    //
    // init {
    //     if (dsn.isNotBlank()) {
    //         Sentry.init { options: SentryOptions ->
    //             options.dsn = dsn
    //             options.environment = environment
    //
    //             // Privacy: never send default PII
    //             options.isSendDefaultPii = false
    //
    //             // Scrub financial data from all events
    //             options.beforeSend = SentryOptions.BeforeSendCallback { event, _ ->
    //                 if (!consentProvider()) return@BeforeSendCallback null
    //                 scrubFinancialData(event)
    //             }
    //
    //             // Scrub financial data from breadcrumbs
    //             options.beforeBreadcrumb = SentryOptions.BeforeBreadcrumbCallback { breadcrumb, _ ->
    //                 if (!consentProvider()) return@BeforeBreadcrumbCallback null
    //                 scrubBreadcrumb(breadcrumb)
    //             }
    //         }
    //     }
    // }

    override fun reportError(exception: Throwable, context: Map<String, String>) {
        // Always log locally via Timber
        // Timber.e(exception, "Error with context: %s", context.keys)

        if (!consentProvider()) return

        // TODO: Uncomment when Sentry is initialized.
        // val scrubbed = scrubContextMap(context)
        // Sentry.captureException(exception) { scope ->
        //     scrubbed.forEach { (key, value) -> scope.setExtra(key, value) }
        // }
    }

    override fun setUserId(id: String?) {
        // Timber.tag("SentryCrashReporter").i("User ID set: %s", id ?: "<cleared>")

        if (!consentProvider()) return

        // TODO: Uncomment when Sentry is initialized.
        // if (id != null) {
        //     Sentry.setUser(User().apply { this.id = id })
        // } else {
        //     Sentry.setUser(null)
        // }
    }

    override fun log(message: String) {
        // Timber.tag("SentryCrashReporter").d(message)

        if (!consentProvider()) return

        // TODO: Uncomment when Sentry is initialized.
        // Sentry.addBreadcrumb(Breadcrumb().apply {
        //     this.message = message
        //     this.category = "app"
        //     this.level = io.sentry.SentryLevel.INFO
        // })
    }

    override fun isEnabled(): Boolean = consentProvider()

    // ========================================================================
    // Privacy Scrubbing
    // ========================================================================

    /**
     * Keys that must be stripped from error context and breadcrumb data.
     *
     * This list mirrors the web implementation in
     * `apps/web/src/lib/monitoring.ts` for consistency across platforms.
     */
    companion object {
        private val SENSITIVE_KEYS = setOf(
            "email", "name", "displayName", "display_name",
            "userName", "user_name", "payee", "note", "notes",
            "memo", "description", "token", "accessToken", "access_token",
            "refreshToken", "refresh_token", "password", "secret", "key",
            "apiKey", "api_key", "dsn", "connectionString", "connection_string",
            "authorization", "cookie", "accountName", "account_name",
            "accountNumber", "account_number", "routingNumber", "routing_number",
        )

        private val FINANCIAL_VALUE_KEYS = setOf(
            "amount", "amount_cents", "amountCents", "balance",
            "currentBalance", "current_balance", "targetAmount", "target_amount",
            "currentAmount", "current_amount", "budgetAmount", "budget_amount",
            "startingBalance", "starting_balance", "total", "subtotal", "price",
        )

        /** Regex matching currency amounts like $1,234.56 or €100.00 */
        private val CURRENCY_PATTERN = Regex(
            """[$€£¥₹]\s?\d[\d,]*\.?\d{0,2}|\d[\d,]*\.?\d{0,2}\s?[$€£¥₹]|\b\d{1,3}(,\d{3})*\.\d{2}\b"""
        )

        /** Regex matching sequences of 4+ digits (potential account numbers). */
        private val ACCOUNT_NUMBER_PATTERN = Regex("""\b\d{4,}\b""")

        private const val REDACTED = "[REDACTED]"
        private const val REDACTED_AMOUNT = "[REDACTED_AMOUNT]"
        private const val REDACTED_NUMBER = "[REDACTED_NUMBER]"
    }

    /**
     * Scrub sensitive data from a context map.
     *
     * @param context Original key-value pairs from error context.
     * @return New map with sensitive keys and values redacted.
     */
    private fun scrubContextMap(context: Map<String, String>): Map<String, String> {
        return context.mapValues { (key, value) ->
            when {
                SENSITIVE_KEYS.contains(key) -> REDACTED
                FINANCIAL_VALUE_KEYS.contains(key) -> REDACTED
                else -> scrubString(value)
            }
        }
    }

    /**
     * Scrub sensitive patterns from a string value.
     */
    private fun scrubString(value: String): String {
        var scrubbed = value
        scrubbed = CURRENCY_PATTERN.replace(scrubbed, REDACTED_AMOUNT)
        scrubbed = ACCOUNT_NUMBER_PATTERN.replace(scrubbed, REDACTED_NUMBER)
        return scrubbed
    }

    // TODO: Uncomment when Sentry dependency is added.
    //
    // /**
    //  * Scrub financial data from a Sentry event.
    //  */
    // private fun scrubFinancialData(event: SentryEvent): SentryEvent {
    //     // Scrub extra context
    //     event.contexts.forEach { (_, context) ->
    //         // Context values are mixed types; scrub string values
    //     }
    //     return event
    // }
    //
    // /**
    //  * Scrub financial data from a breadcrumb.
    //  */
    // private fun scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
    //     breadcrumb.message?.let { message ->
    //         breadcrumb.message = scrubString(message)
    //     }
    //     val scrubbedData = mutableMapOf<String, Any>()
    //     breadcrumb.data.forEach { (key, value) ->
    //         scrubbedData[key] = when {
    //             SENSITIVE_KEYS.contains(key) -> REDACTED
    //             FINANCIAL_VALUE_KEYS.contains(key) -> REDACTED
    //             value is String -> scrubString(value)
    //             else -> value
    //         }
    //     }
    //     breadcrumb.data.clear()
    //     breadcrumb.data.putAll(scrubbedData)
    //     return breadcrumb
    // }
}
