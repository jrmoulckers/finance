// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.entitlement.EntitlementCoordinator
import com.finance.android.entitlement.EntitlementDisplayStatus
import com.finance.android.entitlement.EntitlementFixtures
import com.finance.android.entitlement.InMemoryEntitlementSnapshotStore
import com.finance.core.entitlement.EntitlementRepository
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.core.entitlement.MinimizedEntitlementCodec
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FakeRevenueCatPurchaseAdapter : RevenueCatPurchaseAdapter {
    var purchaseResult: NativePurchaseResult = NativePurchaseResult.Pending
    var restoreEvidence: List<VerifiedPurchaseEvidence> = emptyList()
    var purchaseCount = 0
    var acknowledgementCount = 0

    override suspend fun purchase(targetTier: EntitlementTier): NativePurchaseResult {
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
    var purchaseResponse: FinanceServerConfirmation = FinanceServerConfirmation.PENDING
    var restoreResponse: FinanceServerConfirmation = FinanceServerConfirmation.PENDING
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
}

/** Repository stand-in so the manager can be observed without a network. */
class RecordingEntitlementRepository(
    var result: EntitlementResult =
        EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE),
) : EntitlementRepository {
    var reads = 0
    val households = mutableListOf<String?>()

    override suspend fun load(householdId: String?): EntitlementResult {
        reads += 1
        households += householdId
        return result
    }
}

private class HouseholdMembershipState(
    userScope: SyncId?,
    verifiedScope: SyncId?,
) : HouseholdIdProvider {
    override val householdId: StateFlow<SyncId?> = MutableStateFlow(userScope)
    override val verifiedHouseholdId = MutableStateFlow(verifiedScope)
}

fun evidence(
    token: String = "synthetic-provider-operation",
): VerifiedPurchaseEvidence =
    VerifiedPurchaseEvidence(
        opaqueProviderReference = token,
    )

private class FixedTestClock(private val instant: Instant) : Clock {
    override fun now(): Instant = instant
}

private fun coordinator(repository: EntitlementRepository) =
    EntitlementCoordinator(
        repository = repository,
        snapshotStore = InMemoryEntitlementSnapshotStore(),
        userScopeProvider = { "user-a" },
        clock = FixedTestClock(Instant.parse("2026-09-20T12:00:00Z")),
    )

class SubscriptionManagerTest {
    @Test
    fun `purchase callback cannot grant before server confirmation`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport = FakeEntitlementTransport()
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(EntitlementTier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
        assertEquals(0, adapter.acknowledgementCount)
        assertEquals(1, transport.purchaseRequests.size)
    }

    @Test
    fun `server confirmation acknowledges evidence and re-reads the projection`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                purchaseResponse = FinanceServerConfirmation.CONFIRMED
            }
        val repository =
            RecordingEntitlementRepository(
                MinimizedEntitlementCodec.decode(EntitlementFixtures.premium()),
            )
        val entitlements = coordinator(repository)
        val manager =
            SubscriptionManager(
                purchaseAdapter = adapter,
                transport = transport,
                entitlementCoordinator = entitlements,
            )

        manager.launchPurchase(EntitlementTier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.CONFIRMED, manager.state.value.confirmation)
        assertEquals(1, adapter.acknowledgementCount)
        assertEquals(1, repository.reads)
        // The displayed tier came from `entitlements-v1`, not the confirmation.
        assertEquals(EntitlementDisplayStatus.CURRENT, entitlements.state.value.status)
        assertEquals(EntitlementTier.PREMIUM, entitlements.state.value.tier)
        assertEquals(
            RevenueCatConfirmationOperation.CONFIRM,
            transport.purchaseRequests.single().operation,
        )
    }

    @Test
    fun `a confirmed purchase does not display access the projection denies`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                purchaseResponse = FinanceServerConfirmation.CONFIRMED
            }
        val repository =
            RecordingEntitlementRepository(
                MinimizedEntitlementCodec.decode(EntitlementFixtures.free()),
            )
        val entitlements = coordinator(repository)
        val manager =
            SubscriptionManager(
                purchaseAdapter = adapter,
                transport = transport,
                entitlementCoordinator = entitlements,
            )

        manager.launchPurchase(EntitlementTier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.CONFIRMED, manager.state.value.confirmation)
        assertEquals(EntitlementTier.FREE, entitlements.state.value.tier)
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
        assertEquals(0, adapter.acknowledgementCount)
        assertEquals(1, transport.restoreRequests.size)
        assertEquals(
            RevenueCatConfirmationOperation.RESTORE,
            transport.restoreRequests.single().operation,
        )
    }

    @Test
    fun `confirmed restore acknowledges all evidence after one server operation`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                restoreEvidence = listOf(evidence("first"), evidence("second"))
            }
        val transport =
            FakeEntitlementTransport().apply {
                restoreResponse = FinanceServerConfirmation.CONFIRMED
            }
        val manager = SubscriptionManager(adapter, transport)

        manager.restorePurchases()

        assertEquals(1, transport.restoreRequests.size)
        assertEquals(2, adapter.acknowledgementCount)
    }

    @Test
    fun `provider update cannot grant before server confirmation`() = runTest {
        val manager =
            SubscriptionManager(
                FakeRevenueCatPurchaseAdapter(),
                FakeEntitlementTransport(),
            )

        manager.onPurchaseUpdated(evidence())

        assertEquals(PurchaseConfirmationPhase.PENDING, manager.state.value.confirmation)
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
        val repository = RecordingEntitlementRepository()
        val manager =
            SubscriptionManager(
                purchaseAdapter = adapter,
                transport = transport,
                entitlementCoordinator = coordinator(repository),
            )

        manager.launchPurchase(EntitlementTier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.RETRY, manager.state.value.confirmation)
        assertEquals(0, adapter.acknowledgementCount)
        assertEquals(0, repository.reads)
    }

    @Test
    fun `a rejected confirmation is an error rather than a retry`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                transportError = EntitlementTransportException(retryable = false)
            }
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(EntitlementTier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.ERROR, manager.state.value.confirmation)
        assertEquals(0, adapter.acknowledgementCount)
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

        manager.launchPurchase(EntitlementTier.PREMIUM)

        assertEquals(PurchaseConfirmationPhase.ERROR, manager.state.value.confirmation)
        assertTrue(transport.purchaseRequests.isEmpty())
    }

    @Test
    fun `family purchase requires eligible authenticated household`() = runTest {
        val adapter =
            FakeRevenueCatPurchaseAdapter().apply {
                purchaseResult = NativePurchaseResult.Verified(evidence())
            }
        val transport =
            FakeEntitlementTransport().apply {
                purchaseResponse = FinanceServerConfirmation.CONFIRMED
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

        manager.launchPurchase(EntitlementTier.FAMILY)

        assertEquals(household, transport.purchaseRequests.single().eligibleHousehold)
    }

    @Test
    fun `family purchase cannot start without eligible authenticated household`() = runTest {
        val adapter = FakeRevenueCatPurchaseAdapter()
        val transport = FakeEntitlementTransport()
        val manager = SubscriptionManager(adapter, transport)

        manager.launchPurchase(EntitlementTier.FAMILY)

        assertEquals(PurchaseConfirmationPhase.ERROR, manager.state.value.confirmation)
        assertEquals(0, adapter.purchaseCount)
        assertTrue(transport.purchaseRequests.isEmpty())
    }

    @Test
    fun `cold start user fallback is not treated as verified household membership`() = runTest {
        val userId = SyncId("44010000-0000-4000-8000-000000000001")
        val householdId = SyncId("44010000-0000-4000-8000-000000000002")
        val membershipState = HouseholdMembershipState(userId, null)
        val repository = RecordingEntitlementRepository()
        val entitlements =
            EntitlementCoordinator(
                repository = repository,
                snapshotStore = InMemoryEntitlementSnapshotStore(),
                householdScopeProvider = {
                    membershipState.verifiedHouseholdId.value?.value
                },
                userScopeProvider = { userId.value },
            )

        entitlements.refresh()
        membershipState.verifiedHouseholdId.value = householdId
        entitlements.refresh()

        assertEquals(listOf(null, householdId.value), repository.households)
    }

    @Test
    fun `an unpurchasable target is rejected without a store call`() = runTest {
        val adapter = FakeRevenueCatPurchaseAdapter()
        val manager = SubscriptionManager(adapter, FakeEntitlementTransport())

        manager.launchPurchase(EntitlementTier.FREE)
        manager.launchPurchase(EntitlementTier.UNKNOWN)

        assertEquals(PurchaseConfirmationPhase.ERROR, manager.state.value.confirmation)
        assertEquals(0, adapter.purchaseCount)
    }

    @Test
    fun `confirmation state carries no entitlement of its own`() {
        val stateFields = SubscriptionState::class.java.declaredFields.map { it.name }.toSet()
        val forbidden =
            setOf("tier", "projection", "allowance", "expiresAt", "entitlement", "grace")

        assertTrue(stateFields.intersect(forbidden).isEmpty())
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

        manager.launchPurchase(EntitlementTier.PLUS)

        assertEquals(PurchaseConfirmationPhase.CANCELLED, manager.state.value.confirmation)
        assertFalse(manager.state.value.isPurchasing)
    }
}
