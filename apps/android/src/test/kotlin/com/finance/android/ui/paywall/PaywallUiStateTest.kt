// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import com.finance.android.entitlement.EntitlementDisplayState
import com.finance.android.entitlement.EntitlementDisplayStatus
import com.finance.android.billing.PurchaseConfirmationPhase
import com.finance.core.entitlement.EntitlementCatalog
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Paywall presentation rules.
 *
 * Catalog version 1 allocates only bank-connection capacity and household
 * scope to a paid tier, so the screen must not describe another capability as
 * paid, and every entitlement state must have its own spoken explanation.
 */
class PaywallUiStateTest {

    @Test
    fun `default state is loading and claims nothing`() {
        val state = PaywallUiState()

        assertTrue(state.isLoading)
        assertEquals(EntitlementTier.FREE, state.currentTier)
        assertEquals(EntitlementDisplayStatus.PENDING, state.entitlement.status)
    }

    @Test
    fun `plan copy states only catalog version 1 obligations`() {
        val forbidden =
            listOf(
                "export",
                "history",
                "delete",
                "privacy",
                "accessib",
                "budget",
                "goal",
                "account",
                "insight",
                "report",
                "support",
                "trial",
            )

        PaywallCatalog.plans
            .filter { it.tier != EntitlementTier.FREE }
            .forEach { plan ->
                val paidClaims =
                    (listOf(plan.bankConnections) + plan.notes).joinToString(" ").lowercase()
                forbidden.forEach { term ->
                    assertFalse(term in paidClaims, "${plan.displayName} must not gate $term")
                }
            }
    }

    @Test
    fun `the Free plan states what is never a paid entitlement`() {
        val free = PaywallCatalog.plans.single { it.tier == EntitlementTier.FREE }
        val copy = free.notes.joinToString(" ").lowercase()

        listOf("export", "history", "privacy", "accessibility").forEach { term ->
            assertTrue(term in copy, "the Free plan must state that $term is included")
        }
    }

    @Test
    fun `paid plan capacity matches the shared catalog`() {
        val premium = PaywallCatalog.plans.single { it.tier == EntitlementTier.PREMIUM }
        val family = PaywallCatalog.plans.single { it.tier == EntitlementTier.FAMILY }

        assertTrue(
            EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.PREMIUM).toString()
                in premium.bankConnections,
        )
        assertTrue(
            EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.FAMILY).toString()
                in family.bankConnections,
        )
    }

    @Test
    fun `only the displayed plan is marked current`() {
        val plans = PaywallCatalog.plansFor(EntitlementTier.PREMIUM)

        assertEquals(
            EntitlementTier.PREMIUM,
            plans.single { it.isCurrentTier }.tier,
        )
    }

    @Test
    fun `every entitlement state has its own spoken explanation`() {
        val details =
            EntitlementDisplayStatus.entries.map { status ->
                EntitlementStatusMessages.detail(
                    EntitlementDisplayState(status = status, tier = EntitlementTier.PREMIUM),
                )
            }

        assertEquals(details.size, details.toSet().size)
        details.forEach { assertTrue(it.isNotBlank()) }
    }

    @Test
    fun `offline and stale states say what is still available`() {
        val offline =
            EntitlementStatusMessages.detail(
                EntitlementDisplayState(
                    status = EntitlementDisplayStatus.UNAVAILABLE,
                    unavailableReason = EntitlementUnavailableReason.OFFLINE,
                ),
            )

        assertTrue("export" in offline)
        assertTrue("history" in offline)
    }

    @Test
    fun `the pending state never announces a tier`() {
        val pending = EntitlementStatusMessages.headline(EntitlementDisplayState.PENDING)

        assertFalse("Premium" in pending)
        assertFalse("Family" in pending)
    }

    @Test
    fun `an unknown tier is presented as Free`() {
        assertEquals("Free", EntitlementStatusMessages.planName(EntitlementTier.UNKNOWN))
    }

    @Test
    fun `confirmation phases are announced, and idle says nothing`() {
        assertNull(EntitlementStatusMessages.confirmationMessage(PurchaseConfirmationPhase.IDLE))
        PurchaseConfirmationPhase.entries
            .filter { it != PurchaseConfirmationPhase.IDLE }
            .forEach { phase ->
                assertNotNull(
                    EntitlementStatusMessages.confirmationMessage(phase),
                    phase.name,
                )
            }
    }
}
