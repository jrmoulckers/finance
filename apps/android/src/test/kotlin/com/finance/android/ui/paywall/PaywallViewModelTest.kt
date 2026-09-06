// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import com.finance.android.billing.FakeEntitlementTransport
import com.finance.android.billing.FakeRevenueCatPurchaseAdapter
import com.finance.android.billing.FinanceServerConfirmation
import com.finance.android.billing.NativePurchaseResult
import com.finance.android.billing.PurchaseConfirmationPhase
import com.finance.android.billing.SubscriptionManager
import com.finance.android.billing.evidence
import com.finance.android.billing.freeProjection
import com.finance.android.billing.premiumProjection
import com.finance.core.entitlement.Tier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class PaywallViewModelTest {
    @Test
    fun `manager updates reach paywall and denial replaces paid tier`() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val transport = FakeEntitlementTransport()
            val purchaseAdapter = FakeRevenueCatPurchaseAdapter()
            val manager = SubscriptionManager(purchaseAdapter, transport)
            val viewModel = PaywallViewModel(manager)
            advanceUntilIdle()

            transport.purchaseResponse = FinanceServerConfirmation.Confirmed(premiumProjection)
            manager.onPurchaseUpdated(evidence())
            advanceUntilIdle()

            assertEquals(PurchaseConfirmationPhase.CONFIRMED, viewModel.uiState.value.confirmation)
            assertEquals(Tier.PREMIUM, viewModel.uiState.value.currentTier)
            assertTrue(
                viewModel.uiState.value.tiers
                    .single { it.tier == Tier.PREMIUM }
                    .isCurrentTier,
            )

            purchaseAdapter.purchaseResult = NativePurchaseResult.Cancelled
            viewModel.purchase(Tier.PLUS)
            advanceUntilIdle()
            assertEquals(PurchaseConfirmationPhase.CANCELLED, viewModel.uiState.value.confirmation)
            assertEquals(Tier.PREMIUM, viewModel.uiState.value.currentTier)

            purchaseAdapter.purchaseResult = NativePurchaseResult.Verified(evidence())
            transport.shouldThrow = true
            viewModel.purchase(Tier.PLUS)
            advanceUntilIdle()
            assertEquals(PurchaseConfirmationPhase.RETRY, viewModel.uiState.value.confirmation)
            assertEquals(Tier.PREMIUM, viewModel.uiState.value.currentTier)

            transport.shouldThrow = false
            transport.projectionResponse =
                FinanceServerConfirmation.Confirmed(freeProjection())
            manager.refreshEntitlement()
            advanceUntilIdle()

            assertEquals(Tier.FREE, viewModel.uiState.value.currentTier)
        } finally {
            Dispatchers.resetMain()
        }
    }
}
