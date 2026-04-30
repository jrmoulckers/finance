// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import com.finance.core.entitlement.AccessResult
import com.finance.core.entitlement.Feature
import com.finance.core.entitlement.FeatureGate
import com.finance.core.entitlement.Tier
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for paywall UI state and KMP FeatureGate integration.
 */
class PaywallUiStateTest {

    @Test
    fun `default state is loading`() {
        val state = PaywallUiState()
        assertTrue(state.isLoading)
        assertEquals(Tier.FREE, state.currentTier)
        assertNull(state.upgradePrompt)
    }

    @Test
    fun `TierPricing tracks current tier`() {
        val pricing = TierPricing(
            tier = Tier.PLUS,
            displayName = "Plus",
            monthlyPrice = "$4.99/mo",
            yearlyPrice = "$39.99/yr",
            features = listOf("10 accounts"),
            isCurrentTier = true,
        )
        assertTrue(pricing.isCurrentTier)
    }

    @Test
    fun `FeatureGate grants basic features on FREE tier`() {
        val result = FeatureGate.checkAccess(Feature.ACCOUNTS, Tier.FREE)
        assertTrue(result.isGranted)
    }

    @Test
    fun `FeatureGate denies insights on FREE tier`() {
        val result = FeatureGate.checkAccess(Feature.INSIGHTS, Tier.FREE)
        assertFalse(result.isGranted)
        assertTrue(result is AccessResult.Denied)
        assertEquals(Tier.PLUS, (result as AccessResult.Denied).requiredTier)
    }

    @Test
    fun `FeatureGate grants insights on PLUS tier`() {
        val result = FeatureGate.checkAccess(Feature.INSIGHTS, Tier.PLUS)
        assertTrue(result.isGranted)
    }

    @Test
    fun `FeatureGate enforces account limit on FREE tier`() {
        val result = FeatureGate.checkLimit(Feature.ACCOUNTS, Tier.FREE, 3)
        assertTrue(result is AccessResult.LimitReached)
        assertEquals(3, (result as AccessResult.LimitReached).limit)
    }

    @Test
    fun `FeatureGate allows accounts within FREE tier limit`() {
        val result = FeatureGate.checkLimit(Feature.ACCOUNTS, Tier.FREE, 2)
        assertTrue(result.isGranted)
    }

    @Test
    fun `FeatureGate generates upgrade prompt`() {
        val prompt = FeatureGate.upgradePrompt(Feature.INSIGHTS, Tier.FREE)
        assertEquals(Feature.INSIGHTS, prompt.feature)
        assertEquals(Tier.PLUS, prompt.targetTier)
        assertTrue(prompt.headline.isNotBlank())
        assertTrue(prompt.body.isNotBlank())
        assertTrue(prompt.ctaText.contains("Plus"))
    }

    @Test
    fun `health score requires PREMIUM`() {
        val freeDenied = FeatureGate.checkAccess(Feature.HEALTH_SCORE, Tier.FREE)
        assertFalse(freeDenied.isGranted)

        val plusDenied = FeatureGate.checkAccess(Feature.HEALTH_SCORE, Tier.PLUS)
        assertFalse(plusDenied.isGranted)

        val premiumGranted = FeatureGate.checkAccess(Feature.HEALTH_SCORE, Tier.PREMIUM)
        assertTrue(premiumGranted.isGranted)
    }
}
