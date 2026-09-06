// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.core.entitlement.Tier
import com.finance.models.types.SyncId
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
        userTier = Tier.PREMIUM,
        householdTier = null,
        bankConnectionAllowance = 10,
        isPremiumSponsor = false,
        isFamilyBound = false,
        effectiveAt = "2026-09-06T12:00:00Z",
        expiresAt = null,
        projectionVersion = 1,
        serverTime = "2026-09-06T12:00:01Z",
        status = FinanceProjectionStatus.CURRENT,
    )

fun freeProjection(version: Long = 2): FinanceEntitlementProjection =
    FinanceEntitlementProjection.FREE.copy(
        projectionVersion = version,
        effectiveAt = "2026-09-06T13:00:00Z",
        serverTime = "2026-09-06T13:00:01Z",
    )

class FakeRevenueCatPurchaseAdapter : RevenueCatPurchaseAdapter {
    var purchaseResult: NativePurchaseResult = NativePurchaseResult.Pending
    var restoreEvidence: List<VerifiedPurchaseEvidence> = emptyList()
    var purchaseCount = 0
    var acknowledgementCount = 0

    override suspend fun purchase(targetTier: Tier): NativePurchaseResult {
        purchaseCount += 1
        return purchaseResult
    }

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
    var transportError: EntitlementTransportException? = null

    override suspend fun isAuthenticated(): Boolean = authenticated

    override suspend fun confirm(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation {
        when (request.operation) {
            RevenueCatConfirmationOperation.CONFIRM -> purchaseRequests += request
            RevenueCatConfirmationOperation.RESTORE -> restoreRequests += request
        }
        transportError?.let { throw it }
        if (shouldThrow) throw EntitlementTransportException()
        return when (request.operation) {
            RevenueCatConfirmationOperation.CONFIRM -> purchaseResponse
            RevenueCatConfirmationOperation.RESTORE -> restoreResponse
        }
    }

    override suspend fun fetchProjection(
        context: FinanceEntitlementContext,
        eligibleHousehold: EligibleHouseholdSelection?,
    ): FinanceServerConfirmation {
        transportError?.let { throw it }
        if (shouldThrow) throw EntitlementTransportException()
        return projectionResponse
    }
}

fun evidence(
    token: String = "synthetic-provider-operation",
): VerifiedPurchaseEvidence =
    VerifiedPurchaseEvidence(
        opaqueProviderReference = token,
    )

private class DelayedEntitlementTransport : AuthenticatedEntitlementTransport {
    private val purchaseCalls = AtomicInteger()
    private val firstStarted = CompletableDeferred<Unit>()
    private val firstReleaseGate = CompletableDeferred<Unit>()

    override suspend fun isAuthenticated(): Boolean = true

    override suspend fun confirm(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation =
        if (
            request.operation == RevenueCatConfirmationOperation.CONFIRM &&
            purchaseCalls.incrementAndGet() == 1
        ) {
            firstStarted.complete(Unit)
            firstReleaseGate.await()
            FinanceServerConfirmation.Confirmed(premiumProjection)
        } else {
            FinanceServerConfirmation.Pending(
                FinanceEntitlementProjection.FREE.copy(projectionVersion = 2),
            )
        }

    override suspend fun fetchProjection(
        context: FinanceEntitlementContext,
        eligibleHousehold: EligibleHouseholdSelection?,
    ): FinanceServerConfirmation =
        FinanceServerConfirmation.Pending(
            FinanceEntitlementProjection.FREE.copy(projectionVersion = 2),
        )

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
        assertEquals(
            RevenueCatConfirmationOperation.CONFIRM,
            transport.purchaseRequests.single().operation,
        )
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
        assertEquals(
            RevenueCatConfirmationOperation.RESTORE,
            transport.restoreRequests.single().operation,
        )
    }

    @Test
    fun `restore submits one server operation without local evidence`() = runTest {
        val transport = FakeEntitlementTransport()
        val manager = SubscriptionManager(FakeRevenueCatPurchaseAdapter(), transport)

        manager.restorePurchases()

        assertEquals(1, transport.restoreRequests.size)
        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
    }

    @Test
    fun `confirmed restore acknowledges all evidence after one server operation`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                restoreEvidence = listOf(evidence("first"), evidence("second"))
            }
        val transport =
            FakeEntitlementTransport().apply {
                restoreResponse = FinanceServerConfirmation.Confirmed(premiumProjection)
            }
        val manager = SubscriptionManager(adapter, transport)

        manager.restorePurchases()

        assertEquals(1, transport.restoreRequests.size)
        assertEquals(2, adapter.acknowledgementCount)
        assertEquals(Tier.PREMIUM, manager.currentTier)
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
            FinanceServerConfirmation.Pending(freeProjection())
        manager.refreshEntitlement()

        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
    }

    @Test
    fun `pending denial projection replaces older paid access`() = runTest {
        val transport =
            FakeEntitlementTransport().apply {
                projectionResponse = FinanceServerConfirmation.Confirmed(premiumProjection)
            }
        val manager = SubscriptionManager(FakeRevenueCatPurchaseAdapter(), transport)
        manager.refreshEntitlement()

        transport.projectionResponse = FinanceServerConfirmation.Pending(freeProjection())
        manager.refreshEntitlement()

        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
        assertEquals(Tier.FREE, manager.currentTier)
        assertEquals(2L, manager.state.value.projection.projectionVersion)
    }

    @Test
    fun `server error preserves paid projection and is not pending`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                projectionResponse = FinanceServerConfirmation.Confirmed(premiumProjection)
            }
        val manager = SubscriptionManager(adapter, transport)
        manager.refreshEntitlement()

        transport.transportError = EntitlementTransportException(retryable = false)
        manager.launchPurchase(Tier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.ERROR, manager.state.value.confirmation)
        assertEquals(Tier.PREMIUM, manager.currentTier)
        assertEquals(0, adapter.acknowledgementCount)
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
        assertEquals(freeProjection(), manager.state.value.projection)
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
    fun `family purchase requires eligible authenticated household`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                purchaseResponse =
                    FinanceServerConfirmation.Confirmed(
                        premiumProjection.copy(
                            userTier = Tier.FREE,
                            householdTier = Tier.FAMILY,
                            isFamilyBound = true,
                            projectionVersion = 2,
                        ),
                    )
            }
        val household =
            requireNotNull(
                EligibleHouseholdSelection.fromAuthenticatedMembership(
                    SyncId("44010000-0000-4000-8000-000000000001"),
                ),
            )
        val manager =
            SubscriptionManager(
                purchaseAdapter = adapter,
                transport = transport,
                eligibleHouseholdProvider = EligibleHouseholdProvider { household },
            )

        manager.launchPurchase(Tier.FAMILY)

        assertEquals(household, transport.purchaseRequests.single().eligibleHousehold)
        assertEquals(Tier.FAMILY, manager.currentTier)
    }

    @Test
    fun `family purchase cannot start without eligible authenticated household`() = runTest {
        val adapter = FakeRevenueCatPurchaseAdapter()
        val transport = FakeEntitlementTransport()
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(Tier.FAMILY)

        assertEquals(PurchaseConfirmationPhase.ERROR, manager.state.value.confirmation)
        assertEquals(0, adapter.purchaseCount)
        assertTrue(transport.purchaseRequests.isEmpty())
    }

    @Test
    fun `stale expired and unbound family projections cannot authorize new costs`() {
        val stale = premiumProjection.copy(status = FinanceProjectionStatus.STALE)
        val expired = premiumProjection.copy(status = FinanceProjectionStatus.EXPIRED)
        val unboundFamily =
            premiumProjection.copy(
                userTier = Tier.FREE,
                householdTier = Tier.FAMILY,
                isFamilyBound = false,
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
                "provider",
                "opaqueEvidence",
                "opaqueProviderReference",
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
                operation = RevenueCatConfirmationOperation.CONFIRM,
                context =
                    FinanceEntitlementContext(
                        appId = "app_synthetic",
                        environment = FinanceBillingEnvironment.SANDBOX,
                    ),
                eligibleHousehold = null,
            )
        val state =
            SubscriptionState(
                confirmation = PurchaseConfirmationPhase.PENDING,
            )

        assertFalse(purchaseEvidence.toString().contains(token))
        assertFalse(request.toString().contains(token))
        assertFalse(state.toString().contains(token))
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
