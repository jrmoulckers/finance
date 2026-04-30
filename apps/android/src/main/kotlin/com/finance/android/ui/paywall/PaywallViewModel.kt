// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.billing.SubscriptionManager
import com.finance.core.entitlement.AccessResult
import com.finance.core.entitlement.Feature
import com.finance.core.entitlement.FeatureGate
import com.finance.core.entitlement.Tier
import com.finance.core.entitlement.UpgradePrompt
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Pricing info for display in the upgrade screen.
 */
data class TierPricing(
    val tier: Tier,
    val displayName: String,
    val monthlyPrice: String,
    val yearlyPrice: String,
    val features: List<String>,
    val isCurrentTier: Boolean,
)

/**
 * UI state for the paywall / upgrade screen.
 */
data class PaywallUiState(
    val currentTier: Tier = Tier.FREE,
    val currentTierName: String = "Free",
    val upgradePrompt: UpgradePrompt? = null,
    val tiers: List<TierPricing> = emptyList(),
    val isPurchasing: Boolean = false,
    val isLoading: Boolean = true,
)

/**
 * ViewModel for the freemium tier gating and upgrade flow (#337).
 *
 * Uses KMP [FeatureGate] to check feature access and generate
 * upgrade prompts. Delegates purchases to [SubscriptionManager].
 */
class PaywallViewModel(
    private val subscriptionManager: SubscriptionManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PaywallUiState())
    val uiState: StateFlow<PaywallUiState> = _uiState.asStateFlow()

    init {
        loadPaywall()
    }

    /**
     * Check if a feature is accessible at the user's current tier.
     *
     * @param feature The feature to check.
     * @return The [AccessResult] from the KMP FeatureGate.
     */
    fun checkAccess(feature: Feature): AccessResult {
        val tier = subscriptionManager.currentTier
        return FeatureGate.checkAccess(feature, tier)
    }

    /**
     * Check if a counted feature is within the tier's limit.
     */
    fun checkLimit(feature: Feature, currentCount: Int): AccessResult {
        val tier = subscriptionManager.currentTier
        return FeatureGate.checkLimit(feature, tier, currentCount)
    }

    /**
     * Show an upgrade prompt for a specific feature.
     */
    fun showUpgradePrompt(feature: Feature) {
        val tier = subscriptionManager.currentTier
        val prompt = FeatureGate.upgradePrompt(feature, tier)
        _uiState.update { it.copy(upgradePrompt = prompt) }
        Timber.d("Upgrade prompt shown for feature: %s", feature.name)
    }

    /**
     * Dismiss the current upgrade prompt.
     */
    fun dismissUpgradePrompt() {
        _uiState.update { it.copy(upgradePrompt = null) }
    }

    /**
     * Initiate a purchase for the given tier.
     */
    fun purchase(tier: Tier) {
        viewModelScope.launch {
            _uiState.update { it.copy(isPurchasing = true) }
            subscriptionManager.launchPurchase(tier)
            _uiState.update { it.copy(isPurchasing = false) }
        }
    }

    /**
     * Restore previous purchases.
     */
    fun restorePurchases() {
        subscriptionManager.restorePurchases()
    }

    private fun loadPaywall() {
        viewModelScope.launch {
            val currentTier = subscriptionManager.currentTier
            val tierName = FeatureGate.tierDisplayName(currentTier)

            val tiers = listOf(
                TierPricing(
                    tier = Tier.FREE,
                    displayName = "Free",
                    monthlyPrice = "$0",
                    yearlyPrice = "$0",
                    features = listOf(
                        "3 accounts",
                        "3 budgets",
                        "2 savings goals",
                        "Basic transaction tracking",
                    ),
                    isCurrentTier = currentTier == Tier.FREE,
                ),
                TierPricing(
                    tier = Tier.PLUS,
                    displayName = "Plus",
                    monthlyPrice = "$4.99/mo",
                    yearlyPrice = "$39.99/yr",
                    features = listOf(
                        "10 accounts & budgets",
                        "5 savings goals",
                        "Spending insights & trends",
                        "CSV export",
                        "Budget rollover",
                        "All financial tips",
                    ),
                    isCurrentTier = currentTier == Tier.PLUS,
                ),
                TierPricing(
                    tier = Tier.PREMIUM,
                    displayName = "Premium",
                    monthlyPrice = "$9.99/mo",
                    yearlyPrice = "$79.99/yr",
                    features = listOf(
                        "Unlimited accounts & budgets",
                        "Unlimited savings goals",
                        "Financial health score",
                        "Custom reports",
                        "Full history export",
                        "Custom themes",
                    ),
                    isCurrentTier = currentTier == Tier.PREMIUM,
                ),
                TierPricing(
                    tier = Tier.FAMILY,
                    displayName = "Family",
                    monthlyPrice = "$14.99/mo",
                    yearlyPrice = "$119.99/yr",
                    features = listOf(
                        "Everything in Premium",
                        "Up to 6 household members",
                        "Shared budgets & goals",
                        "Family spending insights",
                    ),
                    isCurrentTier = currentTier == Tier.FAMILY,
                ),
            )

            _uiState.update {
                it.copy(
                    isLoading = false,
                    currentTier = currentTier,
                    currentTierName = tierName,
                    tiers = tiers,
                )
            }

            Timber.d("Paywall loaded: current tier=%s", tierName)
        }
    }
}
