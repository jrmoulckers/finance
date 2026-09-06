// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The cached snapshot is display-only and follows the bounds the **server**
 * issued: `validity.refresh_after` for refresh, and `downgrade.effective_at`
 * only for a reduction the projection actually proved.
 */
class EntitlementDisplayStateTest {
    private val insideBounds = Instant.parse("2026-09-20T12:00:00Z")
    private val pastRefreshBound = Instant.parse("2026-10-06T12:00:01Z")

    private val premium = EntitlementFixtures.decoded(EntitlementFixtures.premium())
    private val family = EntitlementFixtures.decoded(EntitlementFixtures.family())
    private val undetermined =
        EntitlementFixtures.decoded(EntitlementFixtures.undeterminedDowngrade())
    private val free = EntitlementFixtures.decoded(EntitlementFixtures.free())

    private fun offline(cached: com.finance.core.entitlement.EntitlementEnvelope?, now: Instant) =
        EntitlementDisplayState.from(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE),
            cached,
            now,
        )

    @Test
    fun `a fresh server answer displays as current`() {
        val state =
            EntitlementDisplayState.from(
                EntitlementResult.Available(family),
                null,
                insideBounds,
            )

        assertEquals(EntitlementDisplayStatus.CURRENT, state.status)
        assertEquals(EntitlementTier.FAMILY, state.tier)
        assertEquals(4L, state.bankConnectionAllowance)
        assertEquals(EntitlementFixtures.refreshAfter, state.refreshAfter)
        assertFalse(state.needsRefresh)
    }

    @Test
    fun `a cached snapshot inside its bounds stays displayable offline`() {
        val state = offline(premium, insideBounds)

        assertEquals(EntitlementDisplayStatus.OFFLINE_VALID, state.status)
        assertEquals(EntitlementTier.PREMIUM, state.tier)
        assertFalse(state.needsRefresh)
    }

    @Test
    fun `a proven reduction boundary ends offline display at Free`() {
        val state = offline(premium, pastRefreshBound)

        assertEquals(EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED, state.status)
        assertEquals(EntitlementTier.FREE, state.tier)
        assertEquals(0L, state.bankConnectionAllowance)
        assertTrue(state.needsRefresh)
    }

    @Test
    fun `an unproven bound asks for a refresh instead of expiring access`() {
        val state = offline(undetermined, pastRefreshBound)

        assertEquals(EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED, state.status)
        // The collapsed bound may belong to the grant that determines neither
        // the tier nor the allowance, so display must not fall to Free.
        assertEquals(EntitlementTier.PREMIUM, state.tier)
        assertEquals(2L, state.bankConnectionAllowance)
    }

    @Test
    fun `a reachable server with an unusable answer keeps the last proven snapshot`() {
        val state =
            EntitlementDisplayState.from(
                EntitlementResult.Unavailable(
                    EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
                ),
                premium,
                insideBounds,
            )

        assertEquals(EntitlementDisplayStatus.STALE, state.status)
        assertEquals(EntitlementTier.PREMIUM, state.tier)
        assertTrue(state.needsRefresh)
    }

    @Test
    fun `an identity or membership denial discards the cached subject`() {
        listOf(
            EntitlementUnavailableReason.UNAUTHENTICATED,
            EntitlementUnavailableReason.FORBIDDEN,
        ).forEach { reason ->
            val state =
                EntitlementDisplayState.from(
                    EntitlementResult.Unavailable(reason),
                    family,
                    insideBounds,
                )

            assertEquals(EntitlementDisplayStatus.UNAVAILABLE, state.status, reason.name)
            assertEquals(EntitlementTier.FREE, state.tier, reason.name)
            assertEquals(0L, state.bankConnectionAllowance, reason.name)
        }
    }

    @Test
    fun `a malformed answer with no cache is unavailable and Free`() {
        val state =
            EntitlementDisplayState.from(
                EntitlementResult.Unavailable(EntitlementUnavailableReason.MALFORMED),
                null,
                insideBounds,
            )

        assertEquals(EntitlementDisplayStatus.UNAVAILABLE, state.status)
        assertEquals(EntitlementTier.FREE, state.tier)
        assertEquals(EntitlementUnavailableReason.MALFORMED, state.unavailableReason)
    }

    @Test
    fun `a Free snapshot never claims paid display`() {
        val state = offline(free, insideBounds)

        assertEquals(EntitlementTier.FREE, state.tier)
        assertEquals(0L, state.bankConnectionAllowance)
    }

    @Test
    fun `a server answer already past its refresh bound is reported stale`() {
        val state =
            EntitlementDisplayState.from(
                EntitlementResult.Available(premium),
                null,
                pastRefreshBound,
            )

        assertEquals(EntitlementDisplayStatus.STALE, state.status)
        assertEquals(EntitlementTier.FREE, state.tier)
    }

    @Test
    fun `the pending state claims nothing`() {
        assertEquals(EntitlementDisplayStatus.PENDING, EntitlementDisplayState.PENDING.status)
        assertEquals(EntitlementTier.FREE, EntitlementDisplayState.PENDING.tier)
        assertTrue(EntitlementDisplayState.PENDING.isPending)
    }
}
