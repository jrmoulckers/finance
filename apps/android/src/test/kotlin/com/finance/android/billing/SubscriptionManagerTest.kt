// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.core.entitlement.Tier
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

val premiumProjection =
    FinanceEntitlementProjection(
        tier = Tier.PREMIUM,
        status = FinanceProjectionStatus.CURRENT,
        isHouseholdBound = false,
    )

class FakeRevenueCatPurchaseAdapter : RevenueCatPurchaseAdapter {
    var purchaseResult: NativePurchaseResult = NativePurchaseResult.Pending
    var restoreEvidence: List<VerifiedPurchaseEvidence> = emptyList()
    var acknowledgementCount = 0

    override suspend fun purchase(targetTier: Tier): NativePurchaseResult = purchaseResult

    override suspend fun restore(): List<VerifiedPurchaseEvidence> = restoreEvidence

    override suspend fun acknowledge(evidence: VerifiedPurchaseEvidence) {
        acknowledgementCount += 1
    }
}

class FakeEntitlementTransport : AuthenticatedEntitlementTransport {
    var authenticated = true
    var shouldThrow = false
    var purchaseResponse: FinanceServerConfirmation =
        FinanceServerConfirmation.Pending(FinanceEntitlementProjection.FREE)
    var restoreResponse: FinanceServerConfirmation =
        FinanceServerConfirmation.Pending(FinanceEntitlementProjection.FREE)
    var projectionResponse: FinanceServerConfirmation =
        FinanceServerConfirmation.Confirmed(FinanceEntitlementProjection.FREE)
    val purchaseRequests = mutableListOf<FinanceEntitlementRequest>()
    val restoreRequests = mutableListOf<FinanceEntitlementRequest>()

    override suspend fun isAuthenticated(): Boolean = authenticated

    override suspend fun confirmPurchase(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation {
        purchaseRequests += request
        if (shouldThrow) throw EntitlementTransportException()
        return purchaseResponse
    }

    override suspend fun confirmRestore(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation {
        restoreRequests += request
        if (shouldThrow) throw EntitlementTransportException()
        return restoreResponse
    }

    override suspend fun fetchProjection(
        context: FinanceEntitlementContext,
    ): FinanceServerConfirmation {
        if (shouldThrow) throw EntitlementTransportException()
        return projectionResponse
    }
}

fun evidence(
    token: String = "synthetic-provider-operation",
): VerifiedPurchaseEvidence =
    VerifiedPurchaseEvidence(
        provider = PurchaseEvidenceProvider.REVENUECAT_GOOGLE,
        opaqueValue = token,
    )

private class DelayedEntitlementTransport : AuthenticatedEntitlementTransport {
    private val purchaseCalls = AtomicInteger()
    private val firstStarted = CompletableDeferred<Unit>()
    private val firstReleaseGate = CompletableDeferred<Unit>()

    override suspend fun isAuthenticated(): Boolean = true

    override suspend fun confirmPurchase(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation =
        if (purchaseCalls.incrementAndGet() == 1) {
            firstStarted.complete(Unit)
            firstReleaseGate.await()
            FinanceServerConfirmation.Confirmed(premiumProjection)
        } else {
            FinanceServerConfirmation.Confirmed(FinanceEntitlementProjection.FREE)
        }

    override suspend fun confirmRestore(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation = FinanceServerConfirmation.Confirmed(FinanceEntitlementProjection.FREE)

    override suspend fun fetchProjection(
        context: FinanceEntitlementContext,
    ): FinanceServerConfirmation = FinanceServerConfirmation.Confirmed(FinanceEntitlementProjection.FREE)

    suspend fun waitUntilFirstStarts() {
        firstStarted.await()
    }

    fun releaseFirst() {
        firstReleaseGate.complete(Unit)
    }
}

class SubscriptionManagerTest {
    @Test
    fun `purchase callback cannot grant before server confirmation`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport = FakeEntitlementTransport()
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(Tier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
        assertEquals(0, adapter.acknowledgementCount)
        assertEquals(1, transport.purchaseRequests.size)
    }

    @Test
    fun `pending operation preserves server confirmed paid projection`() {
        val state =
            SubscriptionState(
                projection = premiumProjection,
                confirmation = PurchaseConfirmationPhase.PENDING,
            )

        assertTrue(state.authorizesNewCostIncurringActions)
        assertEquals(Tier.PREMIUM, state.tier)
    }

    @Test
    fun `server confirmation grants then acknowledges`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                purchaseResponse = FinanceServerConfirmation.Confirmed(premiumProjection)
            }
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(Tier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.CONFIRMED, manager.state.value.confirmation)
        assertEquals(Tier.PREMIUM, manager.currentTier)
        assertEquals(1, adapter.acknowledgementCount)
    }

    @Test
    fun `restore cannot grant before server confirmation`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                restoreEvidence = listOf(evidence())
            }
        val transport = FakeEntitlementTransport()
        val manager = SubscriptionManager(adapter, transport)

        manager.restorePurchases()

        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
        assertEquals(0, adapter.acknowledgementCount)
        assertEquals(1, transport.restoreRequests.size)
    }

    @Test
    fun `provider update cannot grant before server confirmation`() = runTest {
        val manager = SubscriptionManager(
            FakeRevenueCatPurchaseAdapter(),
            FakeEntitlementTransport(),
        )

        manager.onPurchaseUpdated(evidence())

        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
    }

    @Test
    fun `confirmation outage is explicit and retryable`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                shouldThrow = true
            }
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(Tier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.RETRY, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
        assertEquals(0, adapter.acknowledgementCount)
    }

    @Test
    fun `paid projection survives cancelled and retry operations`() = runTest {
        val adapter = FakeRevenueCatPurchaseAdapter()
        val transport =
            FakeEntitlementTransport().apply {
                projectionResponse = FinanceServerConfirmation.Confirmed(premiumProjection)
            }
        val manager = SubscriptionManager(adapter, transport)
        manager.refreshEntitlement()

        adapter.purchaseResult = NativePurchaseResult.Verified(evidence())
        transport.purchaseResponse =
            FinanceServerConfirmation.Pending(FinanceEntitlementProjection.FREE)
        manager.launchPurchase(Tier.PLUS)
        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
        assertEquals(Tier.PREMIUM, manager.currentTier)

        adapter.purchaseResult = NativePurchaseResult.Cancelled
        manager.launchPurchase(Tier.PLUS)
        assertEquals(PurchaseConfirmationPhase.CANCELLED, manager.state.value.confirmation)
        assertEquals(Tier.PREMIUM, manager.currentTier)

        adapter.purchaseResult = NativePurchaseResult.Verified(evidence())
        transport.shouldThrow = true
        manager.launchPurchase(Tier.PLUS)
        assertEquals(PurchaseConfirmationPhase.RETRY, manager.state.value.confirmation)
        assertEquals(Tier.PREMIUM, manager.currentTier)
    }

    @Test
    fun `newer confirmed denial replaces paid access`() = runTest {
        val transport =
            FakeEntitlementTransport().apply {
                projectionResponse = FinanceServerConfirmation.Confirmed(premiumProjection)
            }
        val manager = SubscriptionManager(FakeRevenueCatPurchaseAdapter(), transport)
        manager.refreshEntitlement()
        assertEquals(Tier.PREMIUM, manager.currentTier)

        transport.projectionResponse =
            FinanceServerConfirmation.Confirmed(FinanceEntitlementProjection.FREE)
        manager.refreshEntitlement()

        assertEquals(PurchaseConfirmationPhase.CONFIRMED, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
    }

    @Test
    fun `older paid response cannot overwrite newer denial`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport = DelayedEntitlementTransport()
        val manager = SubscriptionManager(adapter, transport)

        val older = async { manager.onPurchaseUpdated(evidence("older-operation")) }
        transport.waitUntilFirstStarts()
        val newer = async { manager.onPurchaseUpdated(evidence("newer-operation")) }
        newer.await()
        transport.releaseFirst()
        older.await()

        assertEquals(PurchaseConfirmationPhase.CONFIRMED, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
        assertEquals(FinanceEntitlementProjection.FREE, manager.state.value.projection)
    }

    @Test
    fun `unauthenticated purchaser cannot submit evidence`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                authenticated = false
            }
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(Tier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.ERROR, manager.state.value.confirmation)
        assertTrue(transport.purchaseRequests.isEmpty())
        assertEquals(Tier.FREE, manager.currentTier)
    }

    @Test
    fun `stale expired and unbound family projections cannot authorize new costs`() {
        val stale = premiumProjection.copy(status = FinanceProjectionStatus.STALE)
        val expired = premiumProjection.copy(status = FinanceProjectionStatus.EXPIRED)
        val unboundFamily =
            premiumProjection.copy(
                tier = Tier.FAMILY,
                isHouseholdBound = false,
            )

        assertFalse(stale.authorizesNewCostIncurringActions)
        assertFalse(expired.authorizesNewCostIncurringActions)
        assertFalse(unboundFamily.authorizesNewCostIncurringActions)
        assertEquals(Tier.FREE, stale.authorizedTier)
    }

    @Test
    fun `confirmation request cannot carry client selected grants`() {
        val fieldNames = FinanceEntitlementRequest::class.java.declaredFields.map { it.name }.toSet()
        val contextFieldNames =
            FinanceEntitlementContext::class.java.declaredFields.map { it.name }.toSet()
        val forbidden =
            setOf(
                "tier",
                "price",
                "allowance",
                "quantity",
                "validity",
                "customerId",
                "providerAccountId",
                "grantScope",
                "eligibleHouseholdIntent",
                "householdId",
            )

        assertTrue(fieldNames.intersect(forbidden).isEmpty())
        assertTrue(contextFieldNames.intersect(forbidden).isEmpty())
    }

    @Test
    fun `state and request descriptions exclude provider identifiers`() {
        val token = "synthetic-secret-operation-reference"
        val purchaseEvidence = evidence(token)
        val request =
            FinanceEntitlementRequest(
                context =
                    FinanceEntitlementContext(
                        application = FinanceApplication.FINANCE,
                        environment = FinanceClientEnvironment.DEVELOPMENT,
                    ),
                provider = PurchaseEvidenceProvider.REVENUECAT_GOOGLE,
                opaqueEvidence = token,
            )
        val state =
            SubscriptionState(
                confirmation = PurchaseConfirmationPhase.PENDING,
            )

        assertFalse(purchaseEvidence.toString().contains(token))
        assertFalse(request.toString().contains(token))
        assertFalse(state.toString().contains(token))
        assertFalse(state.toString().contains("REVENUECAT_GOOGLE"))
    }

    @Test
    fun `cancelled purchase remains distinct from error`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Cancelled
            }
        val manager = SubscriptionManager(adapter, FakeEntitlementTransport())

        manager.launchPurchase(Tier.PLUS)

        assertEquals(PurchaseConfirmationPhase.CANCELLED, manager.state.value.confirmation)
        assertFalse(manager.state.value.isPurchasing)
    }
}
