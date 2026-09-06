// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

import com.finance.core.entitlement.BankConnectionAllowance
import com.finance.core.entitlement.DowngradeStatus
import com.finance.core.entitlement.ENTITLEMENT_CATALOG_VERSION
import com.finance.core.entitlement.ENTITLEMENT_CONTRACT_VERSION
import com.finance.core.entitlement.EntitlementAccessState
import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementScope
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementValidity
import com.finance.core.entitlement.MinimizedEntitlement
import com.finance.core.entitlement.PendingDowngrade
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ProductBillingModelsTest {
    private val serverTime = Instant.parse("2033-05-18T03:33:21Z")
    private val refreshAfter = Instant.parse("2033-06-18T03:33:20Z")

    @Test
    fun `checkout success and session id remain pending`() {
        val free = envelope()
        val result = stateFromCheckoutReturn(
            "?billing=pending&session_id=cs_attacker",
            free,
        )
        assertEquals(ProductBillingState.Pending(free), result)
    }

    @Test
    fun `only a valid Finance envelope confirms paid display`() {
        val paid = envelope(
            tier = EntitlementTier.PREMIUM,
            accessState = EntitlementAccessState.GRANTED,
            refreshAfter = refreshAfter,
            downgradeStatus = DowngradeStatus.SCHEDULED,
            downgradeAt = refreshAfter,
        )
        assertEquals(ProductBillingState.Confirmed(paid), stateFromCheckoutReturn("", paid))

        val forged = paid.copy(contractVersion = 99)
        assertEquals(ProductBillingState.Idle(forged), stateFromCheckoutReturn("", forged))
    }

    @Test
    fun `direct distribution uses Stripe and Store remains deferred`() {
        assertEquals(WindowsBillingChannel.DIRECT_STRIPE, fakeRepository().channel)
        assertEquals("MICROSOFT_STORE_FUTURE", WindowsBillingChannel.MICROSOFT_STORE_FUTURE.name)
    }

    @Test
    fun `external billing launcher accepts only Stripe HTTPS destinations`() {
        var opened: String? = null
        openTrustedStripeUrl("https://checkout.stripe.com/c/pay/placeholder") {
            opened = it.toString()
        }
        assertEquals("https://checkout.stripe.com/c/pay/placeholder", opened)

        assertFailsWith<IllegalArgumentException> {
            openTrustedStripeUrl("https://example.test/checkout") {}
        }
        assertFailsWith<IllegalArgumentException> {
            openTrustedStripeUrl("http://checkout.stripe.com/c/pay/placeholder") {}
        }
    }

    private fun envelope(
        tier: EntitlementTier = EntitlementTier.FREE,
        accessState: EntitlementAccessState = EntitlementAccessState.NOT_ENTITLED,
        refreshAfter: Instant? = null,
        downgradeStatus: DowngradeStatus = DowngradeStatus.NONE,
        downgradeAt: Instant? = null,
    ) = EntitlementEnvelope(
        contractVersion = ENTITLEMENT_CONTRACT_VERSION,
        catalogVersion = ENTITLEMENT_CATALOG_VERSION,
        entitlement = MinimizedEntitlement(
            scope = EntitlementScope.USER,
            tier = tier,
            userTier = tier,
            householdTier = null,
            accessState = accessState,
            lifecycle = null,
            isPremiumSponsor = false,
            isFamilyBound = false,
            bankConnections = BankConnectionAllowance(0, 0, 0),
            validity = EntitlementValidity(
                effectiveAt = serverTime,
                refreshAfter = refreshAfter,
                serverTime = serverTime,
                projectionVersion = 1,
            ),
            downgrade = PendingDowngrade(downgradeStatus, downgradeAt),
        ),
    )

    private fun fakeRepository() = object : ProductBillingRepository {
        override val channel = WindowsBillingChannel.DIRECT_STRIPE

        override suspend fun startCheckout(
            choice: BillingCatalogChoice,
            householdIntent: String?,
        ) = Result.success("https://checkout.example.test/placeholder")

        override suspend fun openPortal() =
            Result.success("https://portal.example.test/placeholder")

        override suspend fun reconcile() = Result.success(Unit)
    }
}
