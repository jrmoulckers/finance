// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.android.auth.HouseholdIdProvider
import com.finance.core.entitlement.Tier
import com.finance.models.types.SyncId

enum class FinanceBillingEnvironment {
    SANDBOX,
    PRODUCTION,
}

enum class RevenueCatConfirmationOperation {
    CONFIRM,
    RESTORE,
}

/**
 * Verified provider evidence retained only for safe acknowledgement.
 *
 * The opaque provider reference stays local and is never included in the
 * Finance request, state, or diagnostic descriptions.
 */
class VerifiedPurchaseEvidence internal constructor(
    internal val opaqueProviderReference: String,
) {
    override fun toString(): String = "VerifiedPurchaseEvidence(redacted)"
}

data class FinanceEntitlementContext(
    val appId: String,
    val environment: FinanceBillingEnvironment,
)

@JvmInline
value class EligibleHouseholdSelection private constructor(
    val value: String,
) {
    companion object {
        private val uuidPattern =
            Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

        internal fun fromAuthenticatedMembership(id: SyncId): EligibleHouseholdSelection? =
            id.value.takeIf(uuidPattern::matches)?.let(::EligibleHouseholdSelection)
    }

    override fun toString(): String = "EligibleHouseholdSelection(redacted)"
}

fun interface EligibleHouseholdProvider {
    suspend fun currentEligibleHousehold(): EligibleHouseholdSelection?
}

class AuthenticatedHouseholdEligibilityProvider(
    private val householdIdProvider: HouseholdIdProvider,
) : EligibleHouseholdProvider {
    override suspend fun currentEligibleHousehold(): EligibleHouseholdSelection? =
        householdIdProvider.householdId.value?.let(
            EligibleHouseholdSelection::fromAuthenticatedMembership,
        )
}

internal val NoEligibleHouseholdProvider = EligibleHouseholdProvider { null }

/**
 * Minimized confirmation request. Tier, price, allowance, quantity, validity,
 * provider account/customer/reference IDs, receipt, and grant scope cannot be supplied.
 */
class FinanceEntitlementRequest(
    val operation: RevenueCatConfirmationOperation,
    val context: FinanceEntitlementContext,
    val eligibleHousehold: EligibleHouseholdSelection?,
) {
    override fun toString(): String = "FinanceEntitlementRequest(redacted)"
}

enum class FinanceProjectionStatus {
    CURRENT,
    STALE,
    EXPIRED,
}

data class FinanceEntitlementProjection(
    val userTier: Tier,
    val householdTier: Tier?,
    val bankConnectionAllowance: Long,
    val isPremiumSponsor: Boolean,
    val isFamilyBound: Boolean,
    val effectiveAt: String,
    val expiresAt: String?,
    val projectionVersion: Long,
    val serverTime: String,
    val status: FinanceProjectionStatus,
) {
    val tier: Tier
        get() =
            when {
                householdTier == Tier.FAMILY && isFamilyBound -> Tier.FAMILY
                householdTier == Tier.PREMIUM -> Tier.PREMIUM
                else -> userTier
            }

    /**
     * Freshness is server-derived. The device clock and cached tier ordinal
     * never authorize a new cost-incurring action.
     */
    val authorizesNewCostIncurringActions: Boolean
        get() =
            status == FinanceProjectionStatus.CURRENT &&
                tier != Tier.FREE &&
                (tier != Tier.FAMILY || isFamilyBound)

    val authorizedTier: Tier
        get() = if (authorizesNewCostIncurringActions) tier else Tier.FREE

    companion object {
        val FREE =
            FinanceEntitlementProjection(
                userTier = Tier.FREE,
                householdTier = null,
                bankConnectionAllowance = 0,
                isPremiumSponsor = false,
                isFamilyBound = false,
                effectiveAt = "1970-01-01T00:00:00Z",
                expiresAt = null,
                projectionVersion = 0,
                serverTime = "1970-01-01T00:00:00Z",
                status = FinanceProjectionStatus.CURRENT,
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

    suspend fun confirm(request: FinanceEntitlementRequest): FinanceServerConfirmation

    suspend fun fetchProjection(
        context: FinanceEntitlementContext,
        eligibleHousehold: EligibleHouseholdSelection?,
    ): FinanceServerConfirmation
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

class EntitlementTransportException(
    val retryable: Boolean = true,
) : Exception("Finance entitlement transport failed")

class PurchaseAcknowledgementException : Exception()

internal object UnavailableEntitlementTransport : AuthenticatedEntitlementTransport {
    override suspend fun isAuthenticated(): Boolean = false

    override suspend fun confirm(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation = throw EntitlementTransportException(retryable = false)

    override suspend fun fetchProjection(
        context: FinanceEntitlementContext,
        eligibleHousehold: EligibleHouseholdSelection?,
    ): FinanceServerConfirmation = throw EntitlementTransportException(retryable = false)
}

internal object UnavailableRevenueCatPurchaseAdapter : RevenueCatPurchaseAdapter {
    override suspend fun purchase(targetTier: Tier): NativePurchaseResult = NativePurchaseResult.Error

    override suspend fun restore(): List<VerifiedPurchaseEvidence> = emptyList()

    override suspend fun acknowledge(evidence: VerifiedPurchaseEvidence) = Unit
}
