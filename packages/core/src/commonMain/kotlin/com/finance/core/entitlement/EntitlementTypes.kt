// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

import kotlinx.serialization.Serializable

/**
 * Subscription tier defining feature access levels.
 *
 * Ordered by tier level — [FREE] < [PLUS] < [PREMIUM] < [FAMILY].
 * Higher tiers include all features of lower tiers.
 */
@Serializable
enum class Tier {
    /** Free tier with basic functionality. */
    FREE,

    /** Plus tier with expanded limits and analytics. */
    PLUS,

    /** Premium tier with all individual features. */
    PREMIUM,

    /** Family tier with premium + multi-member household. */
    FAMILY,
}

/**
 * Identifiers for gated features throughout the app.
 *
 * Each feature maps to a minimum required [Tier] via [FeatureGate].
 */
@Serializable
enum class Feature {
    // ── Account limits ───────────────────────────────────────────────
    /** Number of financial accounts. */
    ACCOUNTS,

    // ── Budget features ──────────────────────────────────────────────
    /** Number of budgets. */
    BUDGETS,
    /** Budget rollover between periods. */
    BUDGET_ROLLOVER,

    // ── Goal features ────────────────────────────────────────────────
    /** Number of savings goals. */
    GOALS,
    /** Link goals to funding accounts. */
    GOAL_ACCOUNT_LINK,

    // ── Transaction features ─────────────────────────────────────────
    /** Recurring transaction rules. */
    RECURRING_RULES,

    // ── Analytics & insights ─────────────────────────────────────────
    /** Spending insights and trends. */
    INSIGHTS,
    /** Financial health score. */
    HEALTH_SCORE,
    /** Custom report generation. */
    CUSTOM_REPORTS,
    /** Category trend analysis (multi-month). */
    CATEGORY_TRENDS,

    // ── Export ────────────────────────────────────────────────────────
    /** CSV export format. */
    EXPORT_CSV,
    /** Unlimited export history (free tier limited to 3 months). */
    EXPORT_FULL_HISTORY,

    // ── Gamification ─────────────────────────────────────────────────
    /** Advanced achievements and leaderboard. */
    ADVANCED_GAMIFICATION,

    // ── Household ────────────────────────────────────────────────────
    /** Multiple household members. */
    HOUSEHOLD_MULTI_MEMBER,

    // ── Customization ────────────────────────────────────────────────
    /** Custom categories. */
    CUSTOM_CATEGORIES,
    /** Custom icons and colors. */
    CUSTOM_THEMES,

    // ── Contextual tips ──────────────────────────────────────────────
    /** All contextual financial tips (free gets limited set). */
    FULL_TIPS,
}

/**
 * Result of a feature access check.
 */
// lgtm[java/local-variable-is-never-read] — CodeQL false positive on Kotlin sealed-class equals() bytecode
@Serializable
sealed class AccessResult {
    /** Feature is accessible. */
    @Serializable
    data object Granted : AccessResult()

    /** Feature requires a higher tier. */
    @Serializable
    data class Denied(
        /** Minimum tier required for this feature. */
        val requiredTier: Tier,
        /** Current user tier. */
        val currentTier: Tier,
        /** Human-readable reason for display in upgrade prompts. */
        val reason: String,
    ) : AccessResult()

    /** Feature is accessible but the user has reached the tier's limit. */
    @Serializable
    data class LimitReached(
        /** Maximum allowed by current tier. */
        val limit: Int,
        /** Current count. */
        val currentCount: Int,
        /** Tier that raises or removes the limit. */
        val upgradeTier: Tier,
    ) : AccessResult()

    val isGranted: Boolean get() = this is Granted
}

/**
 * Upgrade prompt metadata for UI display.
 */
@Serializable
data class UpgradePrompt(
    /** Feature that triggered the prompt. */
    val feature: Feature,
    /** Recommended tier to upgrade to. */
    val targetTier: Tier,
    /** Headline text. */
    val headline: String,
    /** Body text describing the benefit. */
    val body: String,
    /** CTA button text. */
    val ctaText: String,
)
