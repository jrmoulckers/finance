// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.billing.PurchaseConfirmationPhase
import com.finance.android.billing.SubscriptionManager
import com.finance.android.billing.SubscriptionState
import com.finance.android.entitlement.EntitlementCoordinator
import com.finance.android.entitlement.EntitlementDisplayState
import com.finance.core.entitlement.EntitlementTier
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import timber.log.Timber

/**
 * A plan as the storefront presents it.
 *
 * The copy states only what commercial catalog version 1 ratifies: the
 * reference price and the bank-connection capacity. Catalog version 1 assigns
 * no other feature, limit, trial, or support promise to a tier, so this screen
 * must not claim one.
 */
data class TierPricing(
    val tier: EntitlementTier,
    val displayName: String,
    val monthlyPrice: String,
    val yearlyPrice: String,
    val bankConnections: String,
    val notes: List<String>,
    val isCurrentTier: Boolean,
)

/**
 * UI state for the paywall / upgrade screen.
 *
 * [entitlement] is display-only. Manual entry, import, export, deletion,
 * privacy and security controls, accessibility, and existing financial data
 * are never gated by it.
 */
data class PaywallUiState(
    val entitlement: EntitlementDisplayState = EntitlementDisplayState.PENDING,
    val tiers: List<TierPricing> = emptyList(),
    val isPurchasing: Boolean = false,
    val isLoading: Boolean = true,
    val confirmation: PurchaseConfirmationPhase = PurchaseConfirmationPhase.IDLE,
) {
    val currentTier: EntitlementTier get() = entitlement.tier
}

/**
 * ViewModel for the subscription upgrade flow (#337, #4403).
 *
 * The displayed plan comes from the shared minimized entitlement contract via
 * [EntitlementCoordinator]. Purchases and restores are delegated to
 * [SubscriptionManager], whose confirmation phases describe an operation, not
 * an entitlement.
 */
class PaywallViewModel(
    private val subscriptionManager: SubscriptionManager,
    private val entitlementCoordinator: EntitlementCoordinator,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PaywallUiState())
    val uiState: StateFlow<PaywallUiState> = _uiState.asStateFlow()
    private var boundaryRefresh: Job? = null

    init {
        observeSubscriptionState()
        observeEntitlementState()
        loadPaywall()
    }

    /** Initiate a purchase for the offer matching [tier]. */
    fun purchase(tier: EntitlementTier) {
        viewModelScope.launch {
            subscriptionManager.launchPurchase(tier)
        }
    }

    /** Restore previous purchases. */
    fun restorePurchases() {
        viewModelScope.launch {
            subscriptionManager.restorePurchases()
        }
    }

    /** Re-read the projection, e.g. after returning to the screen. */
    fun refreshEntitlement() {
        viewModelScope.launch {
            entitlementCoordinator.refresh()
        }
    }

    /** Re-evaluate server-issued bounds when the screen returns to the foreground. */
    fun refreshEntitlementIfNeeded() {
        viewModelScope.launch {
            entitlementCoordinator.refreshIfNeeded()
        }
    }

    private fun loadPaywall() {
        viewModelScope.launch {
            entitlementCoordinator.restoreCachedSnapshot()
            entitlementCoordinator.refresh()
            _uiState.update { current ->
                current.copy(
                    isLoading = false,
                    tiers = catalogTiers(current.currentTier),
                )
            }
            Timber.d("Paywall loaded")
        }
    }

    private fun observeSubscriptionState() {
        viewModelScope.launch {
            subscriptionManager.state.collect(::applySubscriptionState)
        }
    }

    private fun observeEntitlementState() {
        viewModelScope.launch {
            entitlementCoordinator.state.collect(::applyEntitlementState)
        }
    }

    private fun applySubscriptionState(subscriptionState: SubscriptionState) {
        _uiState.update { current ->
            current.copy(
                isPurchasing = subscriptionState.isPurchasing,
                confirmation = subscriptionState.confirmation,
            )
        }
    }

    private fun applyEntitlementState(entitlement: EntitlementDisplayState) {
        _uiState.update { current ->
            current.copy(
                entitlement = entitlement,
                tiers = catalogTiers(entitlement.tier),
            )
        }
        scheduleBoundaryRefresh(entitlement)
    }

    private fun scheduleBoundaryRefresh(entitlement: EntitlementDisplayState) {
        boundaryRefresh?.cancel()
        val boundary =
            listOfNotNull(entitlement.refreshAfter, entitlement.downgradeAt).minOrNull()
                ?: return
        val delayMillis = boundary.toEpochMilliseconds() - Clock.System.now().toEpochMilliseconds()
        if (delayMillis <= 0L) return
        boundaryRefresh =
            viewModelScope.launch {
                delay(delayMillis)
                entitlementCoordinator.refreshIfNeeded()
            }
    }

    override fun onCleared() {
        boundaryRefresh?.cancel()
        super.onCleared()
    }

    private fun catalogTiers(currentTier: EntitlementTier): List<TierPricing> =
        PaywallCatalog.plansFor(currentTier)
}
