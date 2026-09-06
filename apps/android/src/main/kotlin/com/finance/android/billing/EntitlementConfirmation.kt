// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.core.entitlement.Tier

enum class FinanceApplication {
    FINANCE,
}

enum class FinanceClientEnvironment {
    DEVELOPMENT,
    STAGING,
    PRODUCTION,
}

enum class PurchaseEvidenceProvider {
    GOOGLE_PLAY,
    REVENUECAT_GOOGLE,
}

/**
 * Verified provider evidence that is eligible for server transport.
 *
 * The opaque value is never included in state or diagnostic descriptions.
 */
class VerifiedPurchaseEvidence internal constructor(
    val provider: PurchaseEvidenceProvider,
    internal val opaqueValue: String,
) {
    override fun toString(): String = "VerifiedPurchaseEvidence(redacted)"
}

data class FinanceEntitlementContext(
    val application: FinanceApplication,
    val environment: FinanceClientEnvironment,
    val eligibleHouseholdIntent: String?,
)

/**
 * Minimized confirmation request. Tier, price, allowance, quantity, validity,
 * provider account/customer IDs, and grant scope cannot be supplied.
 */
class FinanceEntitlementRequest(
    val context: FinanceEntitlementContext,
    val provider: PurchaseEvidenceProvider,
    internal val opaqueEvidence: String,
) {
    override fun toString(): String = "FinanceEntitlementRequest(redacted)"
}

enum class FinanceProjectionStatus {
    CURRENT,
    STALE,
    EXPIRED,
}

data class FinanceEntitlementProjection(
    val tier: Tier,
    val status: FinanceProjectionStatus,
    val isHouseholdBound: Boolean,
) {
    /**
     * Freshness is server-derived. The device clock and cached tier ordinal
     * never authorize a new cost-incurring action.
     */
    val authorizesNewCostIncurringActions: Boolean
        get() =
            status == FinanceProjectionStatus.CURRENT &&
                tier != Tier.FREE &&
                (tier != Tier.FAMILY || isHouseholdBound)

    val authorizedTier: Tier
        get() = if (authorizesNewCostIncurringActions) tier else Tier.FREE

    companion object {
        val FREE =
            FinanceEntitlementProjection(
                tier = Tier.FREE,
                status = FinanceProjectionStatus.CURRENT,
                isHouseholdBound = false,
            )
    }
}

sealed interface FinanceServerConfirmation {
    val projection: FinanceEntitlementProjection

    data class Pending(
        override val projection: FinanceEntitlementProjection,
    ) : FinanceServerConfirmation

    data class Confirmed(
        override val projection: FinanceEntitlementProjection,
    ) : FinanceServerConfirmation

    data class Error(
        override val projection: FinanceEntitlementProjection,
    ) : FinanceServerConfirmation
}

enum class PurchaseConfirmationPhase {
    IDLE,
    PENDING,
    CONFIRMED,
    RETRY,
    ERROR,
    CANCELLED,
}

/** Implementations bind all requests to their authenticated Finance session. */
interface AuthenticatedEntitlementTransport {
    suspend fun isAuthenticated(): Boolean

    suspend fun confirmPurchase(request: FinanceEntitlementRequest): FinanceServerConfirmation

    suspend fun confirmRestore(request: FinanceEntitlementRequest): FinanceServerConfirmation

    suspend fun fetchProjection(context: FinanceEntitlementContext): FinanceServerConfirmation
}

sealed interface NativePurchaseResult {
    data object Cancelled : NativePurchaseResult

    data object Pending : NativePurchaseResult

    data object Error : NativePurchaseResult

    data class Verified(
        val evidence: VerifiedPurchaseEvidence,
    ) : NativePurchaseResult
}

/**
 * Thin boundary for RevenueCat/Google purchase and restore callbacks.
 *
 * Provider state is evidence only and cannot expose an entitlement tier.
 */
interface RevenueCatPurchaseAdapter {
    suspend fun purchase(targetTier: Tier): NativePurchaseResult

    suspend fun restore(): List<VerifiedPurchaseEvidence>

    suspend fun acknowledge(evidence: VerifiedPurchaseEvidence)
}

class PurchaseAdapterException : Exception()

class EntitlementTransportException : Exception()

class PurchaseAcknowledgementException : Exception()

internal object UnavailableEntitlementTransport : AuthenticatedEntitlementTransport {
    override suspend fun isAuthenticated(): Boolean = false

    override suspend fun confirmPurchase(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation = FinanceServerConfirmation.Error(FinanceEntitlementProjection.FREE)

    override suspend fun confirmRestore(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation = FinanceServerConfirmation.Error(FinanceEntitlementProjection.FREE)

    override suspend fun fetchProjection(
        context: FinanceEntitlementContext,
    ): FinanceServerConfirmation = FinanceServerConfirmation.Error(FinanceEntitlementProjection.FREE)
}

internal object UnavailableRevenueCatPurchaseAdapter : RevenueCatPurchaseAdapter {
    override suspend fun purchase(targetTier: Tier): NativePurchaseResult = NativePurchaseResult.Error

    override suspend fun restore(): List<VerifiedPurchaseEvidence> = emptyList()

    override suspend fun acknowledge(evidence: VerifiedPurchaseEvidence) = Unit
}
