// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith

class ProductBillingModelsTest {
    private val freeProjection = ProductEntitlementProjection(
        userTier = UserEntitlementTier.FREE,
        householdTier = null,
        bankConnectionAllowance = 0,
        isPremiumSponsor = false,
        isFamilyBound = false,
        effectiveAt = "2033-05-18T03:33:20Z",
        expiresAt = null,
        projectionVersion = 1,
        serverTime = "2033-05-18T03:33:21Z",
    )

    @Test
    fun `checkout success and session id remain pending`() {
        val result = stateFromCheckoutReturn(
            "?billing=pending&session_id=cs_attacker",
            freeProjection,
        )
        assertEquals(ProductBillingState.Pending(freeProjection), result)
        assertFalse(freeProjection.confirmsPaidAccess)
    }

    @Test
    fun `only Finance projection confirms paid access`() {
        val paid = freeProjection.copy(
            userTier = UserEntitlementTier.PREMIUM,
            expiresAt = "2033-06-18T03:33:20Z",
            projectionVersion = 2,
        )
        assertEquals(ProductBillingState.Confirmed(paid), stateFromCheckoutReturn("", paid))
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

    private fun fakeRepository() = object : ProductBillingRepository {
        override val channel = WindowsBillingChannel.DIRECT_STRIPE
        override suspend fun startCheckout(
            choice: BillingCatalogChoice,
            householdIntent: String?,
        ) = Result.success("https://checkout.example.test/placeholder")

        override suspend fun openPortal() =
            Result.success("https://portal.example.test/placeholder")

        override suspend fun reconcile() = Result.success(Unit)

        override suspend fun loadProjection(householdId: String?) =
            Result.success(freeProjection)
    }
}
