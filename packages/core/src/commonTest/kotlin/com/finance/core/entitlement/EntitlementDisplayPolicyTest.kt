// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Bounded-display tests for a cached minimized entitlement (#4403).
 *
 * A cached snapshot may keep the UI coherent while offline, but only through
 * the server-issued validity bound. None of this authorizes a server action —
 * these tests assert that a device clock can only ever *reduce* what is shown.
 */
class EntitlementDisplayPolicyTest {

    private val serverTime = Instant.parse("2033-05-18T03:33:21Z")
    private val expiry = Instant.parse("2033-06-18T03:33:20Z")

    private fun envelope(
        contractVersion: Int = ENTITLEMENT_CONTRACT_VERSION,
        scope: EntitlementScope = EntitlementScope.HOUSEHOLD,
        tier: EntitlementTier = EntitlementTier.FAMILY,
        userTier: EntitlementTier = EntitlementTier.FREE,
        householdTier: EntitlementTier? = EntitlementTier.FAMILY,
        accessState: EntitlementAccessState = EntitlementAccessState.GRANTED,
        allowance: Long = 4,
        baseAllowance: Long = 4,
        addonAllowance: Long = 0,
        expiresAt: Instant? = expiry,
        downgradePending: Boolean = true,
        downgradeEffectiveAt: Instant? = expiry,
    ) = EntitlementEnvelope(
        contractVersion = contractVersion,
        catalogVersion = ENTITLEMENT_CATALOG_VERSION,
        entitlement = MinimizedEntitlement(
            scope = scope,
            tier = tier,
            userTier = userTier,
            householdTier = householdTier,
            accessState = accessState,
            lifecycle = null,
            isPremiumSponsor = false,
            isFamilyBound = householdTier == EntitlementTier.FAMILY,
            bankConnections = BankConnectionAllowance(allowance, baseAllowance, addonAllowance),
            validity = EntitlementValidity(
                effectiveAt = Instant.parse("2033-05-18T03:33:20Z"),
                expiresAt = expiresAt,
                serverTime = serverTime,
                projectionVersion = 7,
            ),
            downgrade = PendingDowngrade(downgradePending, downgradeEffectiveAt, 0),
        ),
    )

    @Test
    fun `a granted snapshot displays its tier before the server-issued bound`() {
        val cached = envelope()
        assertTrue(EntitlementDisplayPolicy.isDisplayableAt(cached, serverTime))
        assertEquals(
            EntitlementTier.FAMILY,
            EntitlementDisplayPolicy.displayTier(cached, Instant.parse("2033-06-18T03:33:19Z")),
        )
        assertEquals(
            4L,
            EntitlementDisplayPolicy.displayBankConnectionAllowance(cached, serverTime),
        )
    }

    @Test
    fun `display stops exactly at the server-issued bound`() {
        val cached = envelope()
        assertFalse(EntitlementDisplayPolicy.isDisplayableAt(cached, expiry))
        assertEquals(EntitlementTier.FREE, EntitlementDisplayPolicy.displayTier(cached, expiry))
        assertEquals(
            0L,
            EntitlementDisplayPolicy.displayBankConnectionAllowance(cached, expiry),
        )
    }

    @Test
    fun `a client clock rolled back cannot extend a bound that already passed`() {
        val lapsed = envelope(
            accessState = EntitlementAccessState.LAPSED,
            expiresAt = Instant.parse("2033-05-18T03:00:00Z"),
            downgradePending = false,
            downgradeEffectiveAt = null,
        )
        // Even asked about an instant well before the expiry, a lapsed
        // server verdict never displays a paid tier.
        assertFalse(
            EntitlementDisplayPolicy.isDisplayableAt(lapsed, Instant.parse("2020-01-01T00:00:00Z")),
        )
        assertEquals(
            EntitlementTier.FREE,
            EntitlementDisplayPolicy.displayTier(lapsed, Instant.parse("2020-01-01T00:00:00Z")),
        )
    }

    @Test
    fun `a free snapshot never displays a paid tier`() {
        val free = envelope(
            scope = EntitlementScope.USER,
            tier = EntitlementTier.FREE,
            userTier = EntitlementTier.FREE,
            householdTier = null,
            accessState = EntitlementAccessState.NOT_ENTITLED,
            allowance = 0,
            baseAllowance = 0,
            expiresAt = null,
            downgradePending = false,
            downgradeEffectiveAt = null,
        )
        assertFalse(EntitlementDisplayPolicy.isDisplayableAt(free, serverTime))
        assertEquals(EntitlementTier.FREE, EntitlementDisplayPolicy.displayTier(free, serverTime))
    }

    @Test
    fun `a locally modified snapshot is not displayable`() {
        // A tampered cache that claims Family while both subjects are Free.
        val forged = envelope(
            scope = EntitlementScope.USER,
            tier = EntitlementTier.FAMILY,
            userTier = EntitlementTier.FREE,
            householdTier = null,
            allowance = 0,
            baseAllowance = 0,
        )
        assertFalse(EntitlementDisplayPolicy.isDisplayableAt(forged, serverTime))
        assertEquals(EntitlementTier.FREE, EntitlementDisplayPolicy.displayTier(forged, serverTime))

        // A tampered cache that inflates its own bank allowance.
        val inflated = envelope(allowance = 40, addonAllowance = 36)
        assertEquals(
            0L,
            EntitlementDisplayPolicy.displayBankConnectionAllowance(inflated, serverTime),
        )
    }

    @Test
    fun `a snapshot from an unsupported contract version is not displayable`() {
        val future = envelope(contractVersion = 2)
        assertFalse(EntitlementDisplayPolicy.isDisplayableAt(future, serverTime))
    }

    @Test
    fun `every unavailable reason displays free`() {
        for (reason in EntitlementUnavailableReason.entries) {
            assertEquals(
                EntitlementTier.FREE,
                EntitlementDisplayPolicy.displayTier(
                    EntitlementResult.Unavailable(reason),
                    serverTime,
                ),
                reason.name,
            )
        }
    }

    @Test
    fun `an available result displays through the same bounded rule`() {
        val result = EntitlementResult.Available(envelope())
        assertEquals(
            EntitlementTier.FAMILY,
            EntitlementDisplayPolicy.displayTier(result, serverTime),
        )
        assertEquals(EntitlementTier.FREE, EntitlementDisplayPolicy.displayTier(result, expiry))
    }
}
