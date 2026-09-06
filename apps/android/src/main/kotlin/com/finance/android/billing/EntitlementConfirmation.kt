// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.android.auth.HouseholdIdProvider
import com.finance.core.entitlement.EntitlementTier
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
        householdIdProvider.verifiedHouseholdId.value?.let(
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

/**
 * What Finance said about the submitted evidence.
 *
 * This is a **confirmation phase only**. It deliberately carries no tier,
 * allowance, validity, or projection echo: the entitlement a client displays
 * comes from `entitlements-v1` through
 * [com.finance.android.entitlement.EntitlementCoordinator], and a
 * cost-incurring server action re-reads the projection server-side.
 */
enum class FinanceServerConfirmation {
    /** Finance accepted the operation but no verified grant applies yet. */
    PENDING,

    /** Finance recorded a verified grant, so the evidence may be acknowledged. */
    CONFIRMED,
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
 * [targetTier] selects which store offer to present; it is never an access
 * claim and is never sent to Finance.
 */
interface RevenueCatPurchaseAdapter {
    suspend fun purchase(targetTier: EntitlementTier): NativePurchaseResult

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
}

internal object UnavailableRevenueCatPurchaseAdapter : RevenueCatPurchaseAdapter {
    override suspend fun purchase(targetTier: EntitlementTier): NativePurchaseResult =
        NativePurchaseResult.Error

    override suspend fun restore(): List<VerifiedPurchaseEvidence> = emptyList()

    override suspend fun acknowledge(evidence: VerifiedPurchaseEvidence) = Unit
}
