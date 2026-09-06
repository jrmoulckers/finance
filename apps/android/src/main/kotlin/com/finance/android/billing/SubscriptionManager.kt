// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.core.entitlement.Tier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

data class SubscriptionState(
    val projection: FinanceEntitlementProjection = FinanceEntitlementProjection.FREE,
    val confirmation: PurchaseConfirmationPhase = PurchaseConfirmationPhase.IDLE,
    val isLoading: Boolean = false,
    val isPurchasing: Boolean = false,
) {
    val authorizesNewCostIncurringActions: Boolean
        get() =
            confirmation == PurchaseConfirmationPhase.CONFIRMED &&
                projection.authorizesNewCostIncurringActions

    val tier: Tier
        get() = if (authorizesNewCostIncurringActions) projection.tier else Tier.FREE
}

/**
 * Coordinates native purchase evidence with Finance's entitlement authority.
 *
 * RevenueCat/Google callbacks never grant locally. Evidence is acknowledged
 * only after Finance confirms it. Pending, unavailable, and failed evidence
 * remains unacknowledged so the provider can replay it for an idempotent retry.
 */
class SubscriptionManager(
    private val purchaseAdapter: RevenueCatPurchaseAdapter = UnavailableRevenueCatPurchaseAdapter,
    private val transport: AuthenticatedEntitlementTransport = UnavailableEntitlementTransport,
    environment: FinanceClientEnvironment = FinanceClientEnvironment.DEVELOPMENT,
    eligibleHouseholdIntent: String? = null,
) {
    private val context =
        FinanceEntitlementContext(
            application = FinanceApplication.FINANCE,
            environment = environment,
            eligibleHouseholdIntent = eligibleHouseholdIntent,
        )

    private val _state = MutableStateFlow(SubscriptionState())
    val state: StateFlow<SubscriptionState> = _state.asStateFlow()

    /** Safe tier derived only from a current, server-returned projection. */
    val currentTier: Tier
        get() = _state.value.tier

    suspend fun launchPurchase(targetTier: Tier) {
        if (targetTier == Tier.FREE) {
            _state.update { it.copy(confirmation = PurchaseConfirmationPhase.ERROR) }
            return
        }

        _state.update {
            it.copy(
                confirmation = PurchaseConfirmationPhase.PENDING,
                isPurchasing = true,
            )
        }
        Timber.d("Purchase confirmation flow started")

        try {
            when (val result = purchaseAdapter.purchase(targetTier)) {
                NativePurchaseResult.Cancelled -> updatePhase(PurchaseConfirmationPhase.CANCELLED)
                NativePurchaseResult.Pending -> updatePhase(PurchaseConfirmationPhase.PENDING)
                NativePurchaseResult.Error -> updatePhase(PurchaseConfirmationPhase.ERROR)
                is NativePurchaseResult.Verified -> confirm(result.evidence, restore = false)
            }
        } catch (_: PurchaseAdapterException) {
            Timber.w("Purchase flow unavailable")
            updatePhase(PurchaseConfirmationPhase.ERROR)
        } finally {
            _state.update { it.copy(isPurchasing = false) }
        }
    }

    suspend fun restorePurchases() {
        _state.update {
            it.copy(
                confirmation = PurchaseConfirmationPhase.PENDING,
                isLoading = true,
            )
        }

        try {
            val evidenceItems = purchaseAdapter.restore()
            if (evidenceItems.isEmpty()) {
                refreshEntitlement()
            } else {
                evidenceItems.forEach { confirm(it, restore = true) }
            }
            Timber.d("Restore confirmation flow completed")
        } catch (_: PurchaseAdapterException) {
            Timber.w("Restore flow unavailable")
            updatePhase(PurchaseConfirmationPhase.RETRY)
        } finally {
            _state.update { it.copy(isLoading = false) }
        }
    }

    /** Handles a provider update without treating it as an entitlement. */
    suspend fun onPurchaseUpdated(evidence: VerifiedPurchaseEvidence) {
        _state.update { it.copy(confirmation = PurchaseConfirmationPhase.PENDING) }
        confirm(evidence, restore = false)
    }

    suspend fun refreshEntitlement() {
        if (!transport.isAuthenticated()) {
            updatePhase(PurchaseConfirmationPhase.ERROR)
            return
        }

        try {
            apply(transport.fetchProjection(context))
        } catch (_: EntitlementTransportException) {
            Timber.w("Entitlement refresh should be retried")
            updatePhase(PurchaseConfirmationPhase.RETRY)
        }
    }

    private suspend fun confirm(
        evidence: VerifiedPurchaseEvidence,
        restore: Boolean,
    ) {
        if (!transport.isAuthenticated()) {
            updatePhase(PurchaseConfirmationPhase.ERROR)
            return
        }

        val request =
            FinanceEntitlementRequest(
                context = context,
                provider = evidence.provider,
                opaqueEvidence = evidence.opaqueValue,
            )

        try {
            val response =
                if (restore) {
                    transport.confirmRestore(request)
                } else {
                    transport.confirmPurchase(request)
                }
            apply(response)

            if (response is FinanceServerConfirmation.Confirmed) {
                try {
                    purchaseAdapter.acknowledge(evidence)
                } catch (_: PurchaseAcknowledgementException) {
                    // Finance remains authoritative; the unacknowledged provider
                    // item will be replayed and confirmed idempotently.
                    Timber.w("Provider acknowledgement should be retried")
                }
            }
        } catch (_: EntitlementTransportException) {
            Timber.w("Purchase confirmation should be retried")
            updatePhase(PurchaseConfirmationPhase.RETRY)
        }
    }

    private fun apply(response: FinanceServerConfirmation) {
        val phase =
            when (response) {
                is FinanceServerConfirmation.Pending -> PurchaseConfirmationPhase.PENDING
                is FinanceServerConfirmation.Confirmed -> PurchaseConfirmationPhase.CONFIRMED
                is FinanceServerConfirmation.Error -> PurchaseConfirmationPhase.ERROR
            }
        _state.update {
            it.copy(
                projection = response.projection,
                confirmation = phase,
            )
        }
    }

    private fun updatePhase(phase: PurchaseConfirmationPhase) {
        _state.update { it.copy(confirmation = phase) }
    }
}
