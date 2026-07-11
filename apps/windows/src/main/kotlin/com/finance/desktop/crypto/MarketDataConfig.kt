// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.crypto

// ─────────────────────────────────────────────────────────────────────────────
// Market-data configuration gate — Issue #2702
//
// The near-real-time Windows market-data pipeline is blocked on provider
// credentials, API terms, and Windows desktop packaging constraints. Rather
// than hardcode any secret, the live path is gated behind an explicit feature
// flag AND the presence of credentials in the environment. When either is
// absent the app stays on the deterministic offline mock — no network, no keys.
//
// See the "## Needs Human Action" section of the batch PR for the manual
// credential-provisioning step required to switch this on.
// ─────────────────────────────────────────────────────────────────────────────

/** Provider credentials for the live market-data feed. */
data class MarketDataCredentials(
    val apiKey: String,
    val baseUrl: String,
)

/**
 * Resolved market-data settings.
 *
 * @param isLiveFlagEnabled Whether the operator opted into the live pipeline.
 * @param credentials Provider credentials, or `null` when unset.
 * @param refreshIntervalMs Polling interval for the refresh scheduler.
 */
data class MarketDataSettings(
    val isLiveFlagEnabled: Boolean,
    val credentials: MarketDataCredentials?,
    val refreshIntervalMs: Long,
) {
    /**
     * The live feed is used ONLY when the operator both enabled the flag and
     * supplied credentials; otherwise the offline mock is used.
     */
    val useLiveFeed: Boolean get() = isLiveFlagEnabled && credentials != null

    /** Human-readable explanation shown in diagnostics/UI. */
    val statusLabel: String
        get() = when {
            useLiveFeed -> "Live market data enabled"
            isLiveFlagEnabled -> "Live flag on but credentials missing — using offline data"
            else -> "Offline sample data (live feed disabled)"
        }
}

/** Reads [MarketDataSettings] from the process environment. */
object MarketDataConfig {
    const val ENABLE_ENV = "FINANCE_MARKET_DATA_ENABLED"
    const val API_KEY_ENV = "FINANCE_MARKET_DATA_API_KEY"
    const val BASE_URL_ENV = "FINANCE_MARKET_DATA_URL"
    const val REFRESH_INTERVAL_ENV = "FINANCE_MARKET_DATA_REFRESH_MS"

    /** Default polling interval when unset (30 s). */
    const val DEFAULT_REFRESH_INTERVAL_MS: Long = 30_000L

    /** Lower bound to protect provider rate limits (5 s). */
    const val MIN_REFRESH_INTERVAL_MS: Long = 5_000L

    /**
     * Resolves settings from [env] (defaults to the real environment). Pure and
     * side-effect free so it is fully unit-testable.
     */
    fun fromEnvironment(env: (String) -> String? = System::getenv): MarketDataSettings {
        val flag = env(ENABLE_ENV)?.trim()?.lowercase()
        val enabled = flag == "true" || flag == "1" || flag == "yes"

        val apiKey = env(API_KEY_ENV)?.trim().orEmpty()
        val baseUrl = env(BASE_URL_ENV)?.trim().orEmpty()
        val credentials = if (apiKey.isNotEmpty() && baseUrl.isNotEmpty()) {
            MarketDataCredentials(apiKey, baseUrl)
        } else {
            null
        }

        val interval = env(REFRESH_INTERVAL_ENV)?.trim()?.toLongOrNull()
            ?.coerceAtLeast(MIN_REFRESH_INTERVAL_MS)
            ?: DEFAULT_REFRESH_INTERVAL_MS

        return MarketDataSettings(
            isLiveFlagEnabled = enabled,
            credentials = credentials,
            refreshIntervalMs = interval,
        )
    }
}
