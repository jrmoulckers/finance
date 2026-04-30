// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.core.entitlement.Tier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import timber.log.Timber

/**
 * Subscription state holding the user's current entitlement tier.
 */
data class SubscriptionState(
    /** The user's current subscription tier. */
    val tier: Tier = Tier.FREE,
    /** Whether the subscription state is still loading. */
    val isLoading: Boolean = true,
    /** Whether a purchase flow is in progress. */
    val isPurchasing: Boolean = false,
)

/**
 * Manages the user's subscription tier and billing interactions.
 *
 * This is a stub implementation that defaults to [Tier.FREE].
 * When Google Play BillingClient is integrated, this class will
 * query the Play Store for active subscriptions and handle
 * purchase flows.
 *
 * ## Integration Notes
 * - Connect to BillingClient in `connect()` method
 * - Query purchases on app start to restore entitlements
 * - Handle purchase flow via `launchPurchase()`
 * - Verify purchases server-side before granting entitlements
 *
 * ## Security
 * - Never trust client-side purchase validation alone
 * - Always verify with the backend before persisting tier upgrades
 * - Use `BillingClient.acknowledgePurchase()` to prevent refunds
 */
class SubscriptionManager {

    private val _state = MutableStateFlow(SubscriptionState())
    val state: StateFlow<SubscriptionState> = _state.asStateFlow()

    /** The user's current tier, for quick access. */
    val currentTier: Tier get() = _state.value.tier

    init {
        // TODO: Connect to Google Play BillingClient and query active purchases
        _state.value = SubscriptionState(tier = Tier.FREE, isLoading = false)
        Timber.d("SubscriptionManager initialized with FREE tier (stub)")
    }

    /**
     * Launch a purchase flow for the given tier.
     *
     * @param targetTier The tier to purchase.
     *
     * TODO: Implement with BillingClient.launchBillingFlow()
     */
    fun launchPurchase(targetTier: Tier) {
        Timber.d("Purchase flow requested for tier: %s (stub — not implemented)", targetTier.name)
        // TODO: Implement Google Play billing flow
        // 1. Query SkuDetails for the targetTier product
        // 2. Launch BillingClient.launchBillingFlow()
        // 3. Handle PurchasesUpdatedListener callback
        // 4. Verify purchase on backend
        // 5. Update _state with new tier
    }

    /**
     * Restore purchases from Google Play.
     *
     * TODO: Implement with BillingClient.queryPurchasesAsync()
     */
    fun restorePurchases() {
        Timber.d("Restore purchases requested (stub — not implemented)")
        // TODO: Query Play Store for existing purchases
    }
}
