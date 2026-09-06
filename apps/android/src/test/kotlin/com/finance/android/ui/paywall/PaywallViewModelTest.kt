// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import com.finance.android.billing.FakeEntitlementTransport
import com.finance.android.billing.FakeRevenueCatPurchaseAdapter
import com.finance.android.billing.FinanceServerConfirmation
import com.finance.android.billing.NativePurchaseResult
import com.finance.android.billing.PurchaseConfirmationPhase
import com.finance.android.billing.RecordingEntitlementRepository
import com.finance.android.billing.SubscriptionManager
import com.finance.android.billing.evidence
import com.finance.android.entitlement.EntitlementCoordinator
import com.finance.android.entitlement.EntitlementDisplayStatus
import com.finance.android.entitlement.EntitlementFixtures
import com.finance.android.entitlement.InMemoryEntitlementSnapshotStore
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.core.entitlement.MinimizedEntitlementCodec
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

private class FixedTestClock(var instant: Instant) : Clock {
    override fun now(): Instant = instant
}

@OptIn(ExperimentalCoroutinesApi::class)
class PaywallViewModelTest {
    private val insideBounds = Instant.parse("2026-09-20T12:00:00Z")

    @Test
    fun `the paywall shows only what the projection proves`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository =
                RecordingEntitlementRepository(
                    MinimizedEntitlementCodec.decode(EntitlementFixtures.premium()),
                )
            val clock = FixedTestClock(insideBounds)
            val entitlements =
                EntitlementCoordinator(
                    repository = repository,
                    snapshotStore = InMemoryEntitlementSnapshotStore(),
                    userScopeProvider = { "user-a" },
                    clock = clock,
                )
            val transport = FakeEntitlementTransport()
            val purchaseAdapter = FakeRevenueCatPurchaseAdapter()
            val manager =
                SubscriptionManager(
                    purchaseAdapter = purchaseAdapter,
                    transport = transport,
                    entitlementCoordinator = entitlements,
                )
            val viewModel = PaywallViewModel(manager, entitlements)
            advanceUntilIdle()

            assertEquals(EntitlementTier.PREMIUM, viewModel.uiState.value.currentTier)
            assertEquals(
                EntitlementDisplayStatus.CURRENT,
                viewModel.uiState.value.entitlement.status,
            )
            assertTrue(
                viewModel.uiState.value.tiers
                    .single { it.tier == EntitlementTier.PREMIUM }
                    .isCurrentTier,
            )

            // A cancelled purchase changes the operation phase, never the plan.
            purchaseAdapter.purchaseResult = NativePurchaseResult.Cancelled
            viewModel.purchase(EntitlementTier.PLUS)
            advanceUntilIdle()
            assertEquals(
                PurchaseConfirmationPhase.CANCELLED,
                viewModel.uiState.value.confirmation,
            )
            assertEquals(EntitlementTier.PREMIUM, viewModel.uiState.value.currentTier)

            // A confirmed purchase still waits for the projection to say so.
            purchaseAdapter.purchaseResult = NativePurchaseResult.Verified(evidence())
            transport.purchaseResponse = FinanceServerConfirmation.CONFIRMED
            repository.result = MinimizedEntitlementCodec.decode(EntitlementFixtures.free())
            viewModel.purchase(EntitlementTier.PREMIUM)
            advanceUntilIdle()

            assertEquals(
                PurchaseConfirmationPhase.CONFIRMED,
                viewModel.uiState.value.confirmation,
            )
            assertEquals(EntitlementTier.FREE, viewModel.uiState.value.currentTier)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `an offline projection keeps the last proven plan and asks to refresh`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository =
                RecordingEntitlementRepository(
                    MinimizedEntitlementCodec.decode(EntitlementFixtures.family()),
                )
            val entitlements =
                EntitlementCoordinator(
                    repository = repository,
                    snapshotStore = InMemoryEntitlementSnapshotStore(),
                    userScopeProvider = { "user-a" },
                    clock = FixedTestClock(insideBounds),
                )
            val viewModel =
                PaywallViewModel(
                    SubscriptionManager(entitlementCoordinator = entitlements),
                    entitlements,
                )
            advanceUntilIdle()
            assertEquals(EntitlementTier.FAMILY, viewModel.uiState.value.currentTier)

            repository.result =
                EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE)
            viewModel.refreshEntitlement()
            advanceUntilIdle()

            assertEquals(
                EntitlementDisplayStatus.OFFLINE_VALID,
                viewModel.uiState.value.entitlement.status,
            )
            assertEquals(EntitlementTier.FAMILY, viewModel.uiState.value.currentTier)
            assertEquals(4L, viewModel.uiState.value.entitlement.bankConnectionAllowance)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun `a projection outage falls back to Free presentation`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val repository =
                RecordingEntitlementRepository(
                    EntitlementResult.Unavailable(
                        EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
                    ),
                )
            val entitlements =
                EntitlementCoordinator(
                    repository = repository,
                    snapshotStore = InMemoryEntitlementSnapshotStore(),
                    userScopeProvider = { "user-a" },
                    clock = FixedTestClock(insideBounds),
                )
            val viewModel =
                PaywallViewModel(
                    SubscriptionManager(entitlementCoordinator = entitlements),
                    entitlements,
                )
            advanceUntilIdle()

            assertEquals(
                EntitlementDisplayStatus.UNAVAILABLE,
                viewModel.uiState.value.entitlement.status,
            )
            assertEquals(EntitlementTier.FREE, viewModel.uiState.value.currentTier)
            assertTrue(viewModel.uiState.value.entitlement.needsRefresh)
        } finally {
            Dispatchers.resetMain()
        }
    }
}
