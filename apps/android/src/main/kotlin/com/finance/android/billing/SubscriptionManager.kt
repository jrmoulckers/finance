// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.core.entitlement.Tier
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicLong
import timber.log.Timber

data class SubscriptionState(
    val projection: FinanceEntitlementProjection = FinanceEntitlementProjection.FREE,
    val confirmation: PurchaseConfirmationPhase = PurchaseConfirmationPhase.IDLE,
    val isLoading: Boolean = false,
    val isPurchasing: Boolean = false,
) {
    val authorizesNewCostIncurringActions: Boolean
        get() = projection.authorizesNewCostIncurringActions

    val tier: Tier
        get() = projection.authorizedTier
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
    private val eligibleHouseholdProvider: EligibleHouseholdProvider = NoEligibleHouseholdProvider,
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
    private val operationGeneration = AtomicLong()
    private val projectionMutex = Mutex()
    private var latestProjectionGeneration = 0L

    /** Safe tier derived only from a current, server-returned projection. */
    val currentTier: Tier
        get() = _state.value.tier

    suspend fun launchPurchase(targetTier: Tier) {
        if (targetTier == Tier.FREE) {
            _state.update { it.copy(confirmation = PurchaseConfirmationPhase.ERROR) }
            return
        }

        val eligibleHousehold =
            if (targetTier == Tier.FAMILY) {
                eligibleHouseholdProvider.currentEligibleHousehold()
                    ?: run {
                        _state.update {
                            it.copy(confirmation = PurchaseConfirmationPhase.ERROR)
                        }
                        return
                    }
            } else {
                null
            }
        val generation = beginOperation()
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
                        generation = generation,
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
        val generation = beginOperation()
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
                generation = generation,
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
        val generation = beginOperation()
        _state.update { it.copy(confirmation = PurchaseConfirmationPhase.PENDING) }
        confirm(
            listOf(evidence),
            operation = RevenueCatConfirmationOperation.CONFIRM,
            eligibleHousehold = eligibleHouseholdProvider.currentEligibleHousehold(),
            generation = generation,
        )
    }

    suspend fun refreshEntitlement() {
        val generation = beginOperation()
        if (!transport.isAuthenticated()) {
            updatePhase(PurchaseConfirmationPhase.ERROR)
            return
        }

        try {
            apply(
                transport.fetchProjection(
                    context,
                    eligibleHouseholdProvider.currentEligibleHousehold(),
                ),
                generation,
            )
        } catch (error: EntitlementTransportException) {
            updateTransportFailure(error, "Entitlement refresh failed")
        }
    }

    private suspend fun confirm(
        evidenceItems: List<VerifiedPurchaseEvidence>,
        operation: RevenueCatConfirmationOperation,
        eligibleHousehold: EligibleHouseholdSelection?,
        generation: Long,
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
            apply(response, generation)

            if (response is FinanceServerConfirmation.Confirmed) {
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
        } catch (error: EntitlementTransportException) {
            updateTransportFailure(error, "Purchase confirmation failed")
        }
    }

    private suspend fun apply(
        response: FinanceServerConfirmation,
        generation: Long,
    ) {
        val phase =
            when (response) {
                is FinanceServerConfirmation.Pending -> PurchaseConfirmationPhase.PENDING
                is FinanceServerConfirmation.Confirmed -> PurchaseConfirmationPhase.CONFIRMED
            }
        projectionMutex.withLock {
            _state.update { current ->
                val candidate = response.projection
                val isNewerVersion =
                    candidate.projectionVersion > current.projection.projectionVersion
                val isCurrentVersionAndOperation =
                    candidate.projectionVersion == current.projection.projectionVersion &&
                        generation >= latestProjectionGeneration
                when {
                    isNewerVersion || isCurrentVersionAndOperation -> {
                        latestProjectionGeneration = generation
                        current.copy(
                            projection = candidate,
                            confirmation = phase,
                        )
                    }
                    else -> current.copy(confirmation = phase)
                }
            }
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

    private fun beginOperation(): Long = operationGeneration.incrementAndGet()
}
