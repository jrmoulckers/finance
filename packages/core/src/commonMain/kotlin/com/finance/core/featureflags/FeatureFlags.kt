// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.featureflags

/**
 * Registry of well-known feature flag keys used throughout the Finance app.
 *
 * Centralizing keys here prevents typos and enables IDE navigation.
 * Add new flags alphabetically within their section.
 */
object FeatureFlags {

    // ── Budget flags ─────────────────────────────────────────────────

    /** Enable budget rollover (carry unused cents into next period). */
    val BUDGET_ROLLOVER = FeatureFlagKey("budgets.rollover.enabled")

    // ── Export flags ─────────────────────────────────────────────────

    /** Enable CSV export format alongside JSON. */
    val EXPORT_CSV = FeatureFlagKey("export.csv.enabled")

    // ── Goal flags ───────────────────────────────────────────────────

    /** Enable linking goals to funding accounts. */
    val GOAL_ACCOUNT_LINK = FeatureFlagKey("goals.account-link.enabled")

    // ── Sync flags ───────────────────────────────────────────────────

    /** Enable delta sync (incremental pull/push). */
    val SYNC_DELTA = FeatureFlagKey("sync.delta.enabled")

    // ── Premium / monetization ───────────────────────────────────────

    /** Enable premium tier features. */
    val PREMIUM_FEATURES = FeatureFlagKey("premium.features.enabled")

    /** Maximum number of accounts for free-tier users. */
    val FREE_TIER_MAX_ACCOUNTS = FeatureFlagKey("premium.free-tier.max-accounts")

    // ── Internationalization ─────────────────────────────────────────

    /** Enable i18n framework (locale selection, translated strings). */
    val I18N_ENABLED = FeatureFlagKey("i18n.enabled")

    // ── Household ────────────────────────────────────────────────────

    /** Enable multi-member household support. */
    val HOUSEHOLD_MULTI_MEMBER = FeatureFlagKey("household.multi-member.enabled")

    // ── Analytics ────────────────────────────────────────────────────

    /** Enable spending insights generation. */
    val ANALYTICS_INSIGHTS = FeatureFlagKey("analytics.insights.enabled")

    /** Enable net worth tracking. */
    val ANALYTICS_NET_WORTH = FeatureFlagKey("analytics.net-worth.enabled")
}
