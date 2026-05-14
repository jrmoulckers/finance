// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

/**
 * Defines feature access rules for each [Tier].
 *
 * ## Tier Feature Matrix
 *
 * | Feature                | FREE    | PLUS      | PREMIUM   | FAMILY    |
 * |------------------------|---------|-----------|-----------|-----------|
 * | Accounts               | 3       | 10        | Unlimited | Unlimited |
 * | Budgets                | 3       | 10        | Unlimited | Unlimited |
 * | Budget Rollover        | ✗       | ✓         | ✓         | ✓         |
 * | Goals                  | 2       | 5         | Unlimited | Unlimited |
 * | Goal Account Link      | ✗       | ✓         | ✓         | ✓         |
 * | Recurring Rules        | 3       | 10        | Unlimited | Unlimited |
 * | Insights               | ✗       | ✓         | ✓         | ✓         |
 * | Health Score           | ✗       | ✗         | ✓         | ✓         |
 * | Custom Reports         | ✗       | ✗         | ✓         | ✓         |
 * | Category Trends        | ✗       | ✓         | ✓         | ✓         |
 * | Export CSV              | ✗       | ✓         | ✓         | ✓         |
 * | Export Full History     | ✗       | ✗         | ✓         | ✓         |
 * | Advanced Gamification  | ✗       | ✓         | ✓         | ✓         |
 * | Household Multi-Member | ✗       | ✗         | ✗         | ✓         |
 * | Custom Categories      | 5       | 20        | Unlimited | Unlimited |
 * | Custom Themes          | ✗       | ✗         | ✓         | ✓         |
 * | Full Tips              | ✗       | ✓         | ✓         | ✓         |
 */
object FeatureGate {

    /** Sentinel value meaning no count limit. */
    const val UNLIMITED = Int.MAX_VALUE

    /**
     * Check if a feature is accessible at the given tier.
     *
     * For boolean features (no count limit), returns [AccessResult.Granted]
     * or [AccessResult.Denied].
     *
     * @param feature The feature to check.
     * @param tier The user's current tier.
     * @return [AccessResult] indicating access status.
     */
    fun checkAccess(feature: Feature, tier: Tier): AccessResult {
        val minTier = minimumTier(feature)
        return if (tier.ordinal >= minTier.ordinal) {
            AccessResult.Granted
        } else {
            AccessResult.Denied(
                requiredTier = minTier,
                currentTier = tier,
                reason = upgradeReason(feature),
            )
        }
    }

    /**
     * Check if a counted feature is within the tier's limit.
     *
     * @param feature The counted feature to check.
     * @param tier The user's current tier.
     * @param currentCount The user's current count for this feature.
     * @return [AccessResult.Granted], [AccessResult.LimitReached], or [AccessResult.Denied].
     */
    fun checkLimit(feature: Feature, tier: Tier, currentCount: Int): AccessResult {
        val minTier = minimumTier(feature)
        if (tier.ordinal < minTier.ordinal) {
            return AccessResult.Denied(
                requiredTier = minTier,
                currentTier = tier,
                reason = upgradeReason(feature),
            )
        }

        val limit = getLimit(feature, tier)
        return if (currentCount < limit) {
            AccessResult.Granted
        } else {
            val upgradeTier = nextTierWithHigherLimit(feature, tier)
            AccessResult.LimitReached(
                limit = limit,
                currentCount = currentCount,
                upgradeTier = upgradeTier,
            )
        }
    }

    /**
     * Get the count limit for a feature at a given tier.
     * Returns [UNLIMITED] for boolean features or tiers with no limit.
     */
    @Suppress("CyclomaticComplexMethod")
    fun getLimit(feature: Feature, tier: Tier): Int {
        return when (feature) {
            Feature.ACCOUNTS -> when (tier) {
                Tier.FREE -> 3
                Tier.PLUS -> 10
                Tier.PREMIUM, Tier.FAMILY -> UNLIMITED
            }
            Feature.BUDGETS -> when (tier) {
                Tier.FREE -> 3
                Tier.PLUS -> 10
                Tier.PREMIUM, Tier.FAMILY -> UNLIMITED
            }
            Feature.GOALS -> when (tier) {
                Tier.FREE -> 2
                Tier.PLUS -> 5
                Tier.PREMIUM, Tier.FAMILY -> UNLIMITED
            }
            Feature.RECURRING_RULES -> when (tier) {
                Tier.FREE -> 3
                Tier.PLUS -> 10
                Tier.PREMIUM, Tier.FAMILY -> UNLIMITED
            }
            Feature.CUSTOM_CATEGORIES -> when (tier) {
                Tier.FREE -> 5
                Tier.PLUS -> 20
                Tier.PREMIUM, Tier.FAMILY -> UNLIMITED
            }
            // Boolean features — no count limit; access is all-or-nothing
            else -> UNLIMITED
        }
    }

    /**
     * Minimum tier required to access a feature.
     */
    fun minimumTier(feature: Feature): Tier {
        return when (feature) {
            // Available in FREE (with limits)
            Feature.ACCOUNTS,
            Feature.BUDGETS,
            Feature.GOALS,
            Feature.RECURRING_RULES,
            Feature.CUSTOM_CATEGORIES -> Tier.FREE

            // Require PLUS
            Feature.BUDGET_ROLLOVER,
            Feature.GOAL_ACCOUNT_LINK,
            Feature.INSIGHTS,
            Feature.CATEGORY_TRENDS,
            Feature.EXPORT_CSV,
            Feature.ADVANCED_GAMIFICATION,
            Feature.FULL_TIPS -> Tier.PLUS

            // Require PREMIUM
            Feature.HEALTH_SCORE,
            Feature.CUSTOM_REPORTS,
            Feature.EXPORT_FULL_HISTORY,
            Feature.CUSTOM_THEMES -> Tier.PREMIUM

            // Require FAMILY
            Feature.HOUSEHOLD_MULTI_MEMBER -> Tier.FAMILY
        }
    }

    /**
     * Generate an upgrade prompt for a denied or limited feature.
     */
    fun upgradePrompt(feature: Feature, currentTier: Tier): UpgradePrompt {
        val targetTier = minimumTier(feature).let {
            if (it.ordinal <= currentTier.ordinal) {
                // Already have access; suggest next tier for higher limits
                nextTierWithHigherLimit(feature, currentTier)
            } else it
        }

        return UpgradePrompt(
            feature = feature,
            targetTier = targetTier,
            headline = upgradeHeadline(feature),
            body = upgradeBody(feature, targetTier),
            ctaText = "Upgrade to ${tierDisplayName(targetTier)}",
        )
    }

    // ── Internal helpers ─────────────────────────────────────────────

    private fun nextTierWithHigherLimit(feature: Feature, currentTier: Tier): Tier {
        val currentLimit = getLimit(feature, currentTier)
        return Tier.entries
            .filter { it.ordinal > currentTier.ordinal }
            .firstOrNull { getLimit(feature, it) > currentLimit }
            ?: Tier.entries.last()
    }

    internal fun upgradeReason(feature: Feature): String {
        return when (feature) {
            Feature.ACCOUNTS -> "Upgrade to add more accounts"
            Feature.BUDGETS -> "Upgrade to create more budgets"
            Feature.BUDGET_ROLLOVER -> "Budget rollover requires Plus or higher"
            Feature.GOALS -> "Upgrade to set more savings goals"
            Feature.GOAL_ACCOUNT_LINK -> "Linking goals to accounts requires Plus or higher"
            Feature.RECURRING_RULES -> "Upgrade to add more recurring rules"
            Feature.INSIGHTS -> "Spending insights require Plus or higher"
            Feature.HEALTH_SCORE -> "Financial health score requires Premium"
            Feature.CUSTOM_REPORTS -> "Custom reports require Premium"
            Feature.CATEGORY_TRENDS -> "Category trends require Plus or higher"
            Feature.EXPORT_CSV -> "CSV export requires Plus or higher"
            Feature.EXPORT_FULL_HISTORY -> "Full history export requires Premium"
            Feature.ADVANCED_GAMIFICATION -> "Advanced achievements require Plus or higher"
            Feature.HOUSEHOLD_MULTI_MEMBER -> "Multi-member households require the Family plan"
            Feature.CUSTOM_CATEGORIES -> "Upgrade to create more custom categories"
            Feature.CUSTOM_THEMES -> "Custom themes require Premium"
            Feature.FULL_TIPS -> "Full financial tips require Plus or higher"
        }
    }

    private fun upgradeHeadline(feature: Feature): String {
        return when (feature) {
            Feature.ACCOUNTS -> "Need more accounts?"
            Feature.BUDGETS -> "Need more budgets?"
            Feature.BUDGET_ROLLOVER -> "Unlock budget rollover"
            Feature.GOALS -> "Need more goals?"
            Feature.GOAL_ACCOUNT_LINK -> "Link goals to accounts"
            Feature.RECURRING_RULES -> "Need more recurring rules?"
            Feature.INSIGHTS -> "Unlock spending insights"
            Feature.HEALTH_SCORE -> "Know your financial health"
            Feature.CUSTOM_REPORTS -> "Generate custom reports"
            Feature.CATEGORY_TRENDS -> "See your spending trends"
            Feature.EXPORT_CSV -> "Export to CSV"
            Feature.EXPORT_FULL_HISTORY -> "Export full history"
            Feature.ADVANCED_GAMIFICATION -> "Unlock all achievements"
            Feature.HOUSEHOLD_MULTI_MEMBER -> "Manage finances together"
            Feature.CUSTOM_CATEGORIES -> "Need more categories?"
            Feature.CUSTOM_THEMES -> "Personalize your experience"
            Feature.FULL_TIPS -> "Get all financial tips"
        }
    }

    private fun upgradeBody(feature: Feature, targetTier: Tier): String {
        val tierName = tierDisplayName(targetTier)
        return when (feature) {
            Feature.ACCOUNTS -> "Track all your accounts in one place. $tierName gives you more."
            Feature.BUDGETS -> "Create detailed budgets for every category with $tierName."
            Feature.BUDGET_ROLLOVER -> "Carry unused budget into the next period with $tierName."
            Feature.GOALS -> "Set ambitious savings goals. $tierName removes the limit."
            Feature.GOAL_ACCOUNT_LINK -> "Link goals to funding accounts for automatic tracking."
            Feature.RECURRING_RULES -> "Automate more with additional recurring rules in $tierName."
            Feature.INSIGHTS -> "Understand your spending patterns with detailed analytics."
            Feature.HEALTH_SCORE -> "Get a comprehensive financial health score with actionable advice."
            Feature.CUSTOM_REPORTS -> "Generate detailed reports tailored to your needs."
            Feature.CATEGORY_TRENDS -> "Track spending trends across categories over time."
            Feature.EXPORT_CSV -> "Export your data in CSV format for spreadsheet analysis."
            Feature.EXPORT_FULL_HISTORY -> "Export your complete transaction history, not just 3 months."
            Feature.ADVANCED_GAMIFICATION -> "Unlock all achievements and compete on leaderboards."
            Feature.HOUSEHOLD_MULTI_MEMBER -> "Share finances with family members on the $tierName plan."
            Feature.CUSTOM_CATEGORIES -> "Create more custom categories to organize your finances."
            Feature.CUSTOM_THEMES -> "Personalize the app with custom icons and color themes."
            Feature.FULL_TIPS -> "Get all personalized financial tips and recommendations."
        }
    }

    fun tierDisplayName(tier: Tier): String = when (tier) {
        Tier.FREE -> "Free"
        Tier.PLUS -> "Plus"
        Tier.PREMIUM -> "Premium"
        Tier.FAMILY -> "Family"
    }
}
