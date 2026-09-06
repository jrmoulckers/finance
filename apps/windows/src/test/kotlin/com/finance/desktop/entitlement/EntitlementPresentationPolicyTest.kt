// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

import com.finance.core.entitlement.BankConnectionAllowance
import com.finance.core.entitlement.DowngradeStatus
import com.finance.core.entitlement.ENTITLEMENT_CATALOG_VERSION
import com.finance.core.entitlement.ENTITLEMENT_CONTRACT_VERSION
import com.finance.core.entitlement.EntitlementAccessState
import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementScope
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.core.entitlement.EntitlementValidity
import com.finance.core.entitlement.MinimizedEntitlement
import com.finance.core.entitlement.PendingDowngrade
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals

class EntitlementPresentationPolicyTest {
    private val serverTime = Instant.parse("2033-05-18T03:33:21Z")
    private val refreshAfter = Instant.parse("2033-06-18T03:33:20Z")

    @Test
    fun `offline cache before refresh deadline remains explicitly offline valid`() {
        val presentation = EntitlementPresentationPolicy.fallback(
            unavailable = offline(),
            cached = familyEnvelope(),
            now = serverTime,
        )

        assertEquals(EntitlementDisplayStatus.OFFLINE_VALID, presentation.status)
        assertEquals(EntitlementTier.FAMILY, presentation.tier)
        assertEquals(4L, presentation.bankConnectionAllowance)
    }

    @Test
    fun `refresh deadline requests refresh without reducing an unproven entitlement`() {
        val presentation = EntitlementPresentationPolicy.fallback(
            unavailable = offline(),
            cached = familyEnvelope(
                userTier = EntitlementTier.PLUS,
                downgradeStatus = DowngradeStatus.UNDETERMINED,
                downgradeAt = null,
            ),
            now = refreshAfter,
        )

        assertEquals(EntitlementDisplayStatus.REFRESH_NEEDED, presentation.status)
        assertEquals(EntitlementTier.FAMILY, presentation.tier)
        assertEquals(4L, presentation.bankConnectionAllowance)
    }

    @Test
    fun `offline display reduces only at a proven downgrade boundary`() {
        val presentation = EntitlementPresentationPolicy.fallback(
            unavailable = offline(),
            cached = familyEnvelope(),
            now = refreshAfter,
        )

        assertEquals(EntitlementDisplayStatus.OFFLINE_EXPIRED, presentation.status)
        assertEquals(EntitlementTier.FREE, presentation.tier)
        assertEquals(0L, presentation.bankConnectionAllowance)
    }

    @Test
    fun `non-network failure with cache is explicitly stale`() {
        val presentation = EntitlementPresentationPolicy.fallback(
            unavailable = EntitlementResult.Unavailable(
                EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
            ),
            cached = familyEnvelope(),
            now = serverTime,
        )

        assertEquals(EntitlementDisplayStatus.STALE, presentation.status)
        assertEquals(EntitlementTier.FAMILY, presentation.tier)
    }

    @Test
    fun `unavailable without protected cache fails closed for display`() {
        val presentation = EntitlementPresentationPolicy.fallback(
            unavailable = offline(),
            cached = null,
            now = serverTime,
        )

        assertEquals(EntitlementDisplayStatus.UNAVAILABLE, presentation.status)
        assertEquals(EntitlementTier.FREE, presentation.tier)
    }

    @Test
    fun `authorization and contract failures never display a cached echo`() {
        val deniedReasons = listOf(
            EntitlementUnavailableReason.UNAUTHENTICATED,
            EntitlementUnavailableReason.FORBIDDEN,
            EntitlementUnavailableReason.INVALID_REQUEST,
            EntitlementUnavailableReason.MALFORMED,
            EntitlementUnavailableReason.UNSUPPORTED_CONTRACT_VERSION,
            EntitlementUnavailableReason.UNSUPPORTED_CATALOG_VERSION,
        )

        deniedReasons.forEach { reason ->
            val presentation = EntitlementPresentationPolicy.fallback(
                unavailable = EntitlementResult.Unavailable(reason),
                cached = familyEnvelope(),
                now = serverTime,
            )
            assertEquals(EntitlementDisplayStatus.UNAVAILABLE, presentation.status, reason.name)
            assertEquals(EntitlementTier.FREE, presentation.tier, reason.name)
        }
    }

    private fun offline() =
        EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE)

    private fun familyEnvelope(
        userTier: EntitlementTier = EntitlementTier.FREE,
        downgradeStatus: DowngradeStatus = DowngradeStatus.SCHEDULED,
        downgradeAt: Instant? = refreshAfter,
    ) = EntitlementEnvelope(
        contractVersion = ENTITLEMENT_CONTRACT_VERSION,
        catalogVersion = ENTITLEMENT_CATALOG_VERSION,
        entitlement = MinimizedEntitlement(
            scope = EntitlementScope.HOUSEHOLD,
            tier = EntitlementTier.FAMILY,
            userTier = userTier,
            householdTier = EntitlementTier.FAMILY,
            accessState = EntitlementAccessState.GRANTED,
            lifecycle = null,
            isPremiumSponsor = false,
            isFamilyBound = true,
            bankConnections = BankConnectionAllowance(4, 4, 0),
            validity = EntitlementValidity(
                effectiveAt = serverTime,
                refreshAfter = refreshAfter,
                serverTime = serverTime,
                projectionVersion = 7,
            ),
            downgrade = PendingDowngrade(downgradeStatus, downgradeAt),
        ),
    )
}
