// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

import kotlin.test.*

class FeatureGateTest {

    // ═══════════════════════════════════════════════════════════════════
    // Boolean Feature Access
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun checkAccess_freeFeature_grantedForAllTiers() {
        Tier.entries.forEach { tier ->
            val result = FeatureGate.checkAccess(Feature.ACCOUNTS, tier)
            assertTrue(result.isGranted, "ACCOUNTS should be granted for $tier")
        }
    }

    @Test
    fun checkAccess_plusFeature_deniedForFree() {
        val result = FeatureGate.checkAccess(Feature.INSIGHTS, Tier.FREE)

        assertFalse(result.isGranted)
        assertTrue(result is AccessResult.Denied)
        assertEquals(Tier.PLUS, (result as AccessResult.Denied).requiredTier)
        assertEquals(Tier.FREE, result.currentTier)
    }

    @Test
    fun checkAccess_plusFeature_grantedForPlus() {
        val result = FeatureGate.checkAccess(Feature.INSIGHTS, Tier.PLUS)
        assertTrue(result.isGranted)
    }

    @Test
    fun checkAccess_plusFeature_grantedForHigherTiers() {
        assertTrue(FeatureGate.checkAccess(Feature.INSIGHTS, Tier.PREMIUM).isGranted)
        assertTrue(FeatureGate.checkAccess(Feature.INSIGHTS, Tier.FAMILY).isGranted)
    }

    @Test
    fun checkAccess_premiumFeature_deniedForFreePlus() {
        assertFalse(FeatureGate.checkAccess(Feature.HEALTH_SCORE, Tier.FREE).isGranted)
        assertFalse(FeatureGate.checkAccess(Feature.HEALTH_SCORE, Tier.PLUS).isGranted)
    }

    @Test
    fun checkAccess_premiumFeature_grantedForPremium() {
        assertTrue(FeatureGate.checkAccess(Feature.HEALTH_SCORE, Tier.PREMIUM).isGranted)
    }

    @Test
    fun checkAccess_familyFeature_deniedForLowerTiers() {
        assertFalse(FeatureGate.checkAccess(Feature.HOUSEHOLD_MULTI_MEMBER, Tier.FREE).isGranted)
        assertFalse(FeatureGate.checkAccess(Feature.HOUSEHOLD_MULTI_MEMBER, Tier.PLUS).isGranted)
        assertFalse(FeatureGate.checkAccess(Feature.HOUSEHOLD_MULTI_MEMBER, Tier.PREMIUM).isGranted)
    }

    @Test
    fun checkAccess_familyFeature_grantedForFamily() {
        assertTrue(FeatureGate.checkAccess(Feature.HOUSEHOLD_MULTI_MEMBER, Tier.FAMILY).isGranted)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Count-Limited Features
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun checkLimit_accounts_freeWithinLimit() {
        val result = FeatureGate.checkLimit(Feature.ACCOUNTS, Tier.FREE, 2)
        assertTrue(result.isGranted)
    }

    @Test
    fun checkLimit_accounts_freeAtLimit() {
        val result = FeatureGate.checkLimit(Feature.ACCOUNTS, Tier.FREE, 3)

        assertFalse(result.isGranted)
        assertTrue(result is AccessResult.LimitReached)
        assertEquals(3, (result as AccessResult.LimitReached).limit)
        assertEquals(3, result.currentCount)
        assertEquals(Tier.PLUS, result.upgradeTier)
    }

    @Test
    fun checkLimit_accounts_plusWithinLimit() {
        val result = FeatureGate.checkLimit(Feature.ACCOUNTS, Tier.PLUS, 9)
        assertTrue(result.isGranted)
    }

    @Test
    fun checkLimit_accounts_plusAtLimit() {
        val result = FeatureGate.checkLimit(Feature.ACCOUNTS, Tier.PLUS, 10)

        assertFalse(result.isGranted)
        assertTrue(result is AccessResult.LimitReached)
        assertEquals(10, (result as AccessResult.LimitReached).limit)
    }

    @Test
    fun checkLimit_accounts_premiumUnlimited() {
        val result = FeatureGate.checkLimit(Feature.ACCOUNTS, Tier.PREMIUM, 100)
        assertTrue(result.isGranted)
    }

    @Test
    fun checkLimit_budgets_freeLimits() {
        assertTrue(FeatureGate.checkLimit(Feature.BUDGETS, Tier.FREE, 2).isGranted)
        assertFalse(FeatureGate.checkLimit(Feature.BUDGETS, Tier.FREE, 3).isGranted)
    }

    @Test
    fun checkLimit_goals_freeLimits() {
        assertTrue(FeatureGate.checkLimit(Feature.GOALS, Tier.FREE, 1).isGranted)
        assertFalse(FeatureGate.checkLimit(Feature.GOALS, Tier.FREE, 2).isGranted)
    }

    @Test
    fun checkLimit_goals_plusLimits() {
        assertTrue(FeatureGate.checkLimit(Feature.GOALS, Tier.PLUS, 4).isGranted)
        assertFalse(FeatureGate.checkLimit(Feature.GOALS, Tier.PLUS, 5).isGranted)
    }

    @Test
    fun checkLimit_recurringRules_freeLimits() {
        assertTrue(FeatureGate.checkLimit(Feature.RECURRING_RULES, Tier.FREE, 2).isGranted)
        assertFalse(FeatureGate.checkLimit(Feature.RECURRING_RULES, Tier.FREE, 3).isGranted)
    }

    @Test
    fun checkLimit_customCategories_freeLimits() {
        assertTrue(FeatureGate.checkLimit(Feature.CUSTOM_CATEGORIES, Tier.FREE, 4).isGranted)
        assertFalse(FeatureGate.checkLimit(Feature.CUSTOM_CATEGORIES, Tier.FREE, 5).isGranted)
    }

    @Test
    fun checkLimit_customCategories_plusLimits() {
        assertTrue(FeatureGate.checkLimit(Feature.CUSTOM_CATEGORIES, Tier.PLUS, 19).isGranted)
        assertFalse(FeatureGate.checkLimit(Feature.CUSTOM_CATEGORIES, Tier.PLUS, 20).isGranted)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Tier Limits
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun getLimit_returnsCorrectLimits() {
        assertEquals(3, FeatureGate.getLimit(Feature.ACCOUNTS, Tier.FREE))
        assertEquals(10, FeatureGate.getLimit(Feature.ACCOUNTS, Tier.PLUS))
        assertEquals(FeatureGate.UNLIMITED, FeatureGate.getLimit(Feature.ACCOUNTS, Tier.PREMIUM))
    }

    @Test
    fun getLimit_booleanFeatures_returnUnlimited() {
        assertEquals(FeatureGate.UNLIMITED, FeatureGate.getLimit(Feature.INSIGHTS, Tier.PLUS))
        assertEquals(FeatureGate.UNLIMITED, FeatureGate.getLimit(Feature.HEALTH_SCORE, Tier.PREMIUM))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Minimum Tier
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun minimumTier_correctForEachFeature() {
        assertEquals(Tier.FREE, FeatureGate.minimumTier(Feature.ACCOUNTS))
        assertEquals(Tier.PLUS, FeatureGate.minimumTier(Feature.INSIGHTS))
        assertEquals(Tier.PLUS, FeatureGate.minimumTier(Feature.BUDGET_ROLLOVER))
        assertEquals(Tier.PREMIUM, FeatureGate.minimumTier(Feature.HEALTH_SCORE))
        assertEquals(Tier.PREMIUM, FeatureGate.minimumTier(Feature.CUSTOM_REPORTS))
        assertEquals(Tier.FAMILY, FeatureGate.minimumTier(Feature.HOUSEHOLD_MULTI_MEMBER))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Upgrade Prompts
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun upgradePrompt_deniedFeature() {
        val prompt = FeatureGate.upgradePrompt(Feature.INSIGHTS, Tier.FREE)

        assertEquals(Feature.INSIGHTS, prompt.feature)
        assertEquals(Tier.PLUS, prompt.targetTier)
        assertTrue(prompt.headline.isNotBlank())
        assertTrue(prompt.body.isNotBlank())
        assertTrue(prompt.ctaText.contains("Plus"))
    }

    @Test
    fun upgradePrompt_limitReachedFeature() {
        val prompt = FeatureGate.upgradePrompt(Feature.ACCOUNTS, Tier.FREE)

        assertEquals(Feature.ACCOUNTS, prompt.feature)
        assertTrue(prompt.headline.isNotBlank())
        assertTrue(prompt.body.isNotBlank())
    }

    @Test
    fun upgradePrompt_premiumFeature() {
        val prompt = FeatureGate.upgradePrompt(Feature.HEALTH_SCORE, Tier.FREE)

        assertEquals(Tier.PREMIUM, prompt.targetTier)
        assertTrue(prompt.ctaText.contains("Premium"))
    }

    @Test
    fun upgradePrompt_familyFeature() {
        val prompt = FeatureGate.upgradePrompt(Feature.HOUSEHOLD_MULTI_MEMBER, Tier.PREMIUM)

        assertEquals(Tier.FAMILY, prompt.targetTier)
        assertTrue(prompt.ctaText.contains("Family"))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Access Result
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun accessResult_isGranted_helper() {
        assertTrue(AccessResult.Granted.isGranted)
        assertFalse(AccessResult.Denied(Tier.PLUS, Tier.FREE, "test").isGranted)
        assertFalse(AccessResult.LimitReached(3, 3, Tier.PLUS).isGranted)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Tier ordering
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun tierOrdering_freeIsLowest() {
        assertTrue(Tier.FREE.ordinal < Tier.PLUS.ordinal)
        assertTrue(Tier.PLUS.ordinal < Tier.PREMIUM.ordinal)
        assertTrue(Tier.PREMIUM.ordinal < Tier.FAMILY.ordinal)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Display names
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun tierDisplayName_allTiersHaveNames() {
        Tier.entries.forEach { tier ->
            val name = FeatureGate.tierDisplayName(tier)
            assertTrue(name.isNotBlank(), "$tier should have a display name")
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // All features have upgrade reasons
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun upgradeReason_allFeaturesHaveReasons() {
        Feature.entries.forEach { feature ->
            val reason = FeatureGate.upgradeReason(feature)
            assertTrue(reason.isNotBlank(), "$feature should have an upgrade reason")
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Comprehensive tier coverage
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun allPlusFeatures_grantedForPlusAndAbove() {
        val plusFeatures = listOf(
            Feature.BUDGET_ROLLOVER, Feature.GOAL_ACCOUNT_LINK,
            Feature.INSIGHTS, Feature.CATEGORY_TRENDS,
            Feature.EXPORT_CSV, Feature.ADVANCED_GAMIFICATION,
            Feature.FULL_TIPS,
        )

        plusFeatures.forEach { feature ->
            assertFalse(
                FeatureGate.checkAccess(feature, Tier.FREE).isGranted,
                "$feature should be denied for FREE",
            )
            assertTrue(
                FeatureGate.checkAccess(feature, Tier.PLUS).isGranted,
                "$feature should be granted for PLUS",
            )
            assertTrue(
                FeatureGate.checkAccess(feature, Tier.PREMIUM).isGranted,
                "$feature should be granted for PREMIUM",
            )
        }
    }

    @Test
    fun allPremiumFeatures_grantedForPremiumAndAbove() {
        val premiumFeatures = listOf(
            Feature.HEALTH_SCORE, Feature.CUSTOM_REPORTS,
            Feature.EXPORT_FULL_HISTORY, Feature.CUSTOM_THEMES,
        )

        premiumFeatures.forEach { feature ->
            assertFalse(
                FeatureGate.checkAccess(feature, Tier.FREE).isGranted,
                "$feature should be denied for FREE",
            )
            assertFalse(
                FeatureGate.checkAccess(feature, Tier.PLUS).isGranted,
                "$feature should be denied for PLUS",
            )
            assertTrue(
                FeatureGate.checkAccess(feature, Tier.PREMIUM).isGranted,
                "$feature should be granted for PREMIUM",
            )
        }
    }
}
