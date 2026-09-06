// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.android.entitlement.EntitlementCoordinator
import com.finance.core.entitlement.EntitlementTier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/**
 * Purchase and restore progress. Deliberately carries no entitlement.
 *
 * What the user is entitled to is read from `entitlements-v1` through
 * [EntitlementCoordinator]; a purchase callback, a provider state, or a
 * confirmation response can never stand in for it.
 */
data class SubscriptionState(
    val confirmation: PurchaseConfirmationPhase = PurchaseConfirmationPhase.IDLE,
    val isLoading: Boolean = false,
    val isPurchasing: Boolean = false,
)

/**
 * Coordinates native purchase evidence with Finance's entitlement authority.
 *
 * RevenueCat/Google callbacks never grant locally. Evidence is acknowledged
 * only after Finance confirms it. Pending, unavailable, and failed evidence
 * remains unacknowledged so the provider can replay it for an idempotent
 * retry.
 *
 * Once Finance has recorded an operation, the entitlement projection is
 * re-read through [EntitlementCoordinator] so display follows the server
 * rather than the store SDK.
 */
class SubscriptionManager(
    private val purchaseAdapter: RevenueCatPurchaseAdapter = UnavailableRevenueCatPurchaseAdapter,
    private val transport: AuthenticatedEntitlementTransport = UnavailableEntitlementTransport,
    private val eligibleHouseholdProvider: EligibleHouseholdProvider = NoEligibleHouseholdProvider,
    private val entitlementCoordinator: EntitlementCoordinator? = null,
    appId: String = "YOUR_REVENUECAT_APP_ID",
    environment: FinanceBillingEnvironment = FinanceBillingEnvironment.SANDBOX,
) {
    private val context =
        FinanceEntitlementContext(
            appId = appId,
            environment = environment,
        )

    private val _state = MutableStateFlow(SubscriptionState())
    val state: StateFlow<SubscriptionState> = _state.asStateFlow()

    /**
     * Start a store purchase for the offer matching [targetTier].
     *
     * [targetTier] selects an offer; it never claims access, and it is never
     * sent to Finance.
     */
    suspend fun launchPurchase(targetTier: EntitlementTier) {
        if (targetTier == EntitlementTier.FREE || targetTier == EntitlementTier.UNKNOWN) {
            _state.update { it.copy(confirmation = PurchaseConfirmationPhase.ERROR) }
            return
        }

        val eligibleHousehold = eligibleHouseholdProvider.currentEligibleHousehold()
        if (targetTier == EntitlementTier.FAMILY && eligibleHousehold == null) {
            _state.update {
                it.copy(confirmation = PurchaseConfirmationPhase.ERROR)
            }
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
                is NativePurchaseResult.Verified ->
                    confirm(
                        listOf(result.evidence),
                        operation = RevenueCatConfirmationOperation.CONFIRM,
                        eligibleHousehold = eligibleHousehold,
                    )
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
            confirm(
                evidenceItems,
                operation = RevenueCatConfirmationOperation.RESTORE,
                eligibleHousehold = eligibleHouseholdProvider.currentEligibleHousehold(),
            )
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
        confirm(
            listOf(evidence),
            operation = RevenueCatConfirmationOperation.CONFIRM,
            eligibleHousehold = eligibleHouseholdProvider.currentEligibleHousehold(),
        )
    }

    private suspend fun confirm(
        evidenceItems: List<VerifiedPurchaseEvidence>,
        operation: RevenueCatConfirmationOperation,
        eligibleHousehold: EligibleHouseholdSelection?,
    ) {
        if (!transport.isAuthenticated()) {
            updatePhase(PurchaseConfirmationPhase.ERROR)
            return
        }

        val request =
            FinanceEntitlementRequest(
                operation = operation,
                context = context,
                eligibleHousehold = eligibleHousehold,
            )

        try {
            val response = transport.confirm(request)
            updatePhase(
                when (response) {
                    FinanceServerConfirmation.PENDING -> PurchaseConfirmationPhase.PENDING
                    FinanceServerConfirmation.CONFIRMED -> PurchaseConfirmationPhase.CONFIRMED
                },
            )

            if (response == FinanceServerConfirmation.CONFIRMED) {
                evidenceItems.forEach { evidence ->
                    try {
                        purchaseAdapter.acknowledge(evidence)
                    } catch (_: PurchaseAcknowledgementException) {
                        // Finance remains authoritative; the unacknowledged provider
                        // item will be replayed and confirmed idempotently.
                        Timber.w("Provider acknowledgement should be retried")
                    }
                }
            }
            // Display follows the server projection, never this response.
            entitlementCoordinator?.refresh()
        } catch (error: EntitlementTransportException) {
            updateTransportFailure(error, "Purchase confirmation failed")
        }
    }

    private fun updatePhase(phase: PurchaseConfirmationPhase) {
        _state.update { it.copy(confirmation = phase) }
    }

    private fun updateTransportFailure(
        error: EntitlementTransportException,
        message: String,
    ) {
        Timber.w(message)
        updatePhase(
            if (error.retryable) {
                PurchaseConfirmationPhase.RETRY
            } else {
                PurchaseConfirmationPhase.ERROR
            },
        )
    }
}
