// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

/**
 * User subscription tier.
 */
enum class SubscriptionTier {
    FREE,
    PREMIUM,
}

/**
 * Defines which features are available per tier.
 */
enum class PremiumFeature(
    val displayName: String,
    val description: String,
    val freeLimit: Int? = null,
) {
    UNLIMITED_ACCOUNTS(
        displayName = "Unlimited Accounts",
        description = "Connect and track all your financial accounts",
        freeLimit = 3,
    ),
    ADVANCED_INSIGHTS(
        displayName = "Advanced Insights",
        description = "Detailed spending analytics, trend analysis, and category breakdowns",
    ),
    CUSTOM_BUDGETS(
        displayName = "Unlimited Budgets",
        description = "Create as many budgets as you need with rollover support",
        freeLimit = 3,
    ),
    EXPORT_DATA(
        displayName = "Data Export",
        description = "Export your financial data to CSV and JSON formats",
    ),
    PRIORITY_SYNC(
        displayName = "Priority Sync",
        description = "Faster cross-device sync with conflict resolution",
    ),
    CUSTOM_CATEGORIES(
        displayName = "Custom Categories",
        description = "Create unlimited custom categories and subcategories",
        freeLimit = 5,
    ),
    MULTI_CURRENCY(
        displayName = "Multi-Currency",
        description = "Track accounts and transactions in multiple currencies",
    ),
    ADVANCED_GOALS(
        displayName = "Advanced Goals",
        description = "Goal milestones, account linking, and projections",
    ),
}

/**
 * Result of checking if a feature is available.
 */
sealed class EntitlementResult {
    /** Feature is available. */
    data object Granted : EntitlementResult()

    /** Feature is gated — user needs to upgrade. */
    data class Gated(
        val feature: PremiumFeature,
        val currentUsage: Int? = null,
        val limit: Int? = null,
    ) : EntitlementResult()
}

/**
 * Client-side entitlement engine.
 *
 * Evaluates feature access based on the user's subscription tier and
 * current usage. Uses KMP shared [FeatureFlagEngine] concepts for
 * consistent cross-platform gating.
 *
 * Thread-safe — all state reads are from an immutable snapshot.
 */
object EntitlementEngine {

    /** Features available in the free tier. */
    private val freeFeatures = setOf(
        PremiumFeature.UNLIMITED_ACCOUNTS, // limited to 3
        PremiumFeature.CUSTOM_BUDGETS,     // limited to 3
        PremiumFeature.CUSTOM_CATEGORIES,  // limited to 5
    )

    /**
     * Check if a specific feature is available for the user.
     *
     * @param tier The user's current subscription tier.
     * @param feature The feature to check.
     * @param currentUsage Current usage count (for limited features).
     * @return [EntitlementResult.Granted] or [EntitlementResult.Gated].
     */
    @Suppress("ReturnCount") // Feature gate evaluation logic
    fun checkAccess(
        tier: SubscriptionTier,
        feature: PremiumFeature,
        currentUsage: Int = 0,
    ): EntitlementResult {
        if (tier == SubscriptionTier.PREMIUM) {
            return EntitlementResult.Granted
        }

        // Free tier checks
        if (feature !in freeFeatures && feature.freeLimit == null) {
            return EntitlementResult.Gated(feature)
        }

        val limit = feature.freeLimit
        if (limit != null && currentUsage >= limit) {
            return EntitlementResult.Gated(
                feature = feature,
                currentUsage = currentUsage,
                limit = limit,
            )
        }

        return EntitlementResult.Granted
    }

    /**
     * Get all features with their access status for display.
     */
    fun getAllFeatureStatuses(
        tier: SubscriptionTier,
        accountCount: Int = 0,
        budgetCount: Int = 0,
        categoryCount: Int = 0,
    ): List<Pair<PremiumFeature, EntitlementResult>> {
        return PremiumFeature.entries.map { feature ->
            val usage = when (feature) {
                PremiumFeature.UNLIMITED_ACCOUNTS -> accountCount
                PremiumFeature.CUSTOM_BUDGETS -> budgetCount
                PremiumFeature.CUSTOM_CATEGORIES -> categoryCount
                else -> 0
            }
            feature to checkAccess(tier, feature, usage)
        }
    }
}
