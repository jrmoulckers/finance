// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Contract tests for the minimized entitlement response (#4403).
 *
 * These assert the shared client behaviour the server depends on: every
 * catalog tier and scope decodes, and every malformed, unknown, stale, or
 * inconsistent payload fails closed instead of presenting an entitlement.
 */
class MinimizedEntitlementContractTest {

    private val serverTime = Instant.parse("2033-05-18T03:33:21Z")
    private val expiry = Instant.parse("2033-06-18T03:33:20Z")

    private fun payload(
        contractVersion: String = "1",
        scope: String = "user",
        tier: String = "free",
        userTier: String = "free",
        householdTier: String = "null",
        accessState: String = "not_entitled",
        lifecycle: String = "null",
        isPremiumSponsor: Boolean = false,
        isFamilyBound: Boolean = false,
        allowance: Long = 0,
        baseAllowance: Long = 0,
        addonAllowance: Long = 0,
        expiresAt: String = "null",
        projectionVersion: Long = 3,
        downgradePending: Boolean = false,
        downgradeEffectiveAt: String = "null",
        downgradeAllowance: Long = 0,
    ): String = """
        {
          "contract_version": $contractVersion,
          "catalog_version": 1,
          "entitlement": {
            "scope": "$scope",
            "tier": "$tier",
            "user_tier": "$userTier",
            "household_tier": ${quoteOrNull(householdTier)},
            "access_state": "$accessState",
            "lifecycle": ${quoteOrNull(lifecycle)},
            "is_premium_sponsor": $isPremiumSponsor,
            "is_family_bound": $isFamilyBound,
            "bank_connections": {
              "allowance": $allowance,
              "base_allowance": $baseAllowance,
              "addon_allowance": $addonAllowance
            },
            "validity": {
              "effective_at": "2033-05-18T03:33:20Z",
              "expires_at": ${quoteOrNull(expiresAt)},
              "server_time": "$serverTime",
              "projection_version": $projectionVersion
            },
            "downgrade": {
              "pending": $downgradePending,
              "effective_at": ${quoteOrNull(downgradeEffectiveAt)},
              "bank_connection_allowance": $downgradeAllowance
            }
          }
        }
    """.trimIndent()

    private fun quoteOrNull(value: String): String = if (value == "null") "null" else "\"$value\""

    private fun premiumHouseholdPayload(): String = payload(
        scope = "user",
        tier = "premium",
        userTier = "premium",
        householdTier = "premium",
        accessState = "granted",
        isPremiumSponsor = true,
        allowance = 5,
        baseAllowance = 2,
        addonAllowance = 3,
        expiresAt = expiry.toString(),
        downgradePending = true,
        downgradeEffectiveAt = expiry.toString(),
    )

    private fun familyPayload(): String = payload(
        scope = "household",
        tier = "family",
        userTier = "free",
        householdTier = "family",
        accessState = "granted",
        isFamilyBound = true,
        allowance = 4,
        baseAllowance = 4,
        expiresAt = expiry.toString(),
        downgradePending = true,
        downgradeEffectiveAt = expiry.toString(),
    )

    private fun decodeAvailable(raw: String): EntitlementEnvelope {
        val result = MinimizedEntitlementCodec.decode(raw)
        assertIs<EntitlementResult.Available>(result, "expected a decodable payload: $raw")
        return result.envelope
    }

    private fun assertUnavailable(raw: String, reason: EntitlementUnavailableReason) {
        val result = MinimizedEntitlementCodec.decode(raw)
        assertIs<EntitlementResult.Unavailable>(result, "expected fail-closed for: $raw")
        assertEquals(reason, result.reason)
    }

    // ── Catalog coverage ─────────────────────────────────────────────

    @Test
    fun `free projection decodes as a non-entitled user scope`() {
        val envelope = decodeAvailable(payload())
        assertEquals(ENTITLEMENT_CONTRACT_VERSION, envelope.contractVersion)
        assertEquals(ENTITLEMENT_CATALOG_VERSION, envelope.catalogVersion)
        assertEquals(EntitlementTier.FREE, envelope.entitlement.tier)
        assertEquals(EntitlementScope.USER, envelope.entitlement.scope)
        assertEquals(EntitlementAccessState.NOT_ENTITLED, envelope.entitlement.accessState)
        assertNull(envelope.entitlement.householdTier)
        assertNull(envelope.entitlement.lifecycle)
        assertEquals(0L, envelope.entitlement.bankConnections.allowance)
        assertFalse(envelope.entitlement.downgrade.pending)
    }

    @Test
    fun `plus projection decodes as a granted user scope`() {
        val envelope = decodeAvailable(
            payload(
                tier = "plus",
                userTier = "plus",
                accessState = "granted",
                expiresAt = expiry.toString(),
            ),
        )
        assertEquals(EntitlementTier.PLUS, envelope.entitlement.tier)
        assertEquals(EntitlementScope.USER, envelope.entitlement.scope)
        assertEquals(expiry, envelope.entitlement.validity.expiresAt)
        // Plus carries no bank allowance, so no reduction is scheduled.
        assertFalse(envelope.entitlement.downgrade.pending)
    }

    @Test
    fun `premium add-ons decode above the catalog base`() {
        val entitlement = decodeAvailable(premiumHouseholdPayload()).entitlement
        assertEquals(EntitlementTier.PREMIUM, entitlement.tier)
        assertEquals(EntitlementScope.USER, entitlement.scope)
        assertTrue(entitlement.isPremiumSponsor)
        assertEquals(5L, entitlement.bankConnections.allowance)
        assertEquals(2L, entitlement.bankConnections.baseAllowance)
        assertEquals(3L, entitlement.bankConnections.addonAllowance)
        assertEquals(expiry, entitlement.downgrade.effectiveAt)
        assertEquals(0L, entitlement.downgrade.bankConnectionAllowance)
    }

    @Test
    fun `family projection decodes as a household scope for a free member`() {
        val entitlement = decodeAvailable(familyPayload()).entitlement
        assertEquals(EntitlementTier.FAMILY, entitlement.tier)
        assertEquals(EntitlementScope.HOUSEHOLD, entitlement.scope)
        assertEquals(EntitlementTier.FREE, entitlement.userTier)
        assertTrue(entitlement.isFamilyBound)
        assertEquals(4L, entitlement.bankConnections.allowance)
        assertEquals(0L, entitlement.bankConnections.addonAllowance)
    }

    @Test
    fun `every catalog tier maps to the feature-gate tier`() {
        assertEquals(Tier.FREE, EntitlementTier.FREE.toFeatureGateTier())
        assertEquals(Tier.PLUS, EntitlementTier.PLUS.toFeatureGateTier())
        assertEquals(Tier.PREMIUM, EntitlementTier.PREMIUM.toFeatureGateTier())
        assertEquals(Tier.FAMILY, EntitlementTier.FAMILY.toFeatureGateTier())
        assertNull(EntitlementTier.UNKNOWN.toFeatureGateTier())
    }

    @Test
    fun `catalog base allowances follow the ratified plan table`() {
        assertEquals(0L, EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.FREE))
        assertEquals(0L, EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.PLUS))
        assertEquals(2L, EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.PREMIUM))
        assertEquals(4L, EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.FAMILY))
        assertEquals(0L, EntitlementCatalog.baseBankConnectionAllowance(null))
        assertEquals(0L, EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.UNKNOWN))
    }

    // ── Lifecycle vocabulary ─────────────────────────────────────────

    @Test
    fun `every ratified lifecycle is represented with its catalog access rule`() {
        val wireValues = EntitlementLifecycle.entries
            .filter { it != EntitlementLifecycle.UNKNOWN }
            .map { it.wireValue }
        assertEquals(
            listOf(
                "trialing",
                "active",
                "cancelled_paid_through",
                "past_due_grace",
                "paused_paid_through",
                "expired",
                "refunded",
                "chargeback",
            ),
            wireValues,
        )
        assertEquals(
            listOf(
                EntitlementLifecycle.TRIALING,
                EntitlementLifecycle.ACTIVE,
                EntitlementLifecycle.CANCELLED_PAID_THROUGH,
                EntitlementLifecycle.PAST_DUE_GRACE,
                EntitlementLifecycle.PAUSED_PAID_THROUGH,
            ),
            EntitlementLifecycle.entries.filter { it.isAccessBearing },
        )
    }

    @Test
    fun `a future contract version that names a lifecycle stays decodable`() {
        for (lifecycle in EntitlementLifecycle.entries) {
            if (lifecycle == EntitlementLifecycle.UNKNOWN) continue
            val entitlement = decodeAvailable(
                payload(
                    tier = "plus",
                    userTier = "plus",
                    accessState = "granted",
                    lifecycle = lifecycle.wireValue,
                    expiresAt = expiry.toString(),
                ),
            ).entitlement
            assertEquals(lifecycle, entitlement.lifecycle)
        }
    }

    // ── Fail-closed behaviour ────────────────────────────────────────

    @Test
    fun `an unreadable payload is malformed`() {
        assertUnavailable("", EntitlementUnavailableReason.MALFORMED)
        assertUnavailable("{", EntitlementUnavailableReason.MALFORMED)
        assertUnavailable("[]", EntitlementUnavailableReason.MALFORMED)
        assertUnavailable("""{"contract_version":1}""", EntitlementUnavailableReason.MALFORMED)
    }

    @Test
    fun `an unreadable timestamp is malformed`() {
        assertUnavailable(
            payload(tier = "plus", userTier = "plus", accessState = "granted", expiresAt = "soon"),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `an unsupported contract version is refused before any tier is read`() {
        assertUnavailable(
            payload(contractVersion = "2", tier = "family", userTier = "premium"),
            EntitlementUnavailableReason.UNSUPPORTED_CONTRACT_VERSION,
        )
    }

    @Test
    fun `unknown enum values decode without throwing and then fail closed`() {
        assertUnavailable(payload(tier = "enterprise"), EntitlementUnavailableReason.MALFORMED)
        assertUnavailable(payload(scope = "org"), EntitlementUnavailableReason.MALFORMED)
        assertUnavailable(payload(accessState = "maybe"), EntitlementUnavailableReason.MALFORMED)
        assertUnavailable(
            payload(
                tier = "plus",
                userTier = "plus",
                accessState = "granted",
                lifecycle = "escrowed",
                expiresAt = expiry.toString(),
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `an unknown key is ignored so a newer server stays readable`() {
        val raw = payload().replace(
            "\"catalog_version\": 1,",
            "\"catalog_version\": 1,\n  \"future_field\": {\"nested\": true},",
        )
        assertEquals(EntitlementTier.FREE, decodeAvailable(raw).entitlement.tier)
    }

    @Test
    fun `a tier that contradicts its scope is refused`() {
        // Claims Family while both subjects are Free.
        assertUnavailable(payload(tier = "family"), EntitlementUnavailableReason.MALFORMED)
        // Household grant present but the response reports the user subject.
        assertUnavailable(
            payload(
                scope = "user",
                tier = "family",
                userTier = "free",
                householdTier = "family",
                accessState = "granted",
                allowance = 4,
                baseAllowance = 4,
                expiresAt = expiry.toString(),
                downgradePending = true,
                downgradeEffectiveAt = expiry.toString(),
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `sponsorship or family binding without a household scope is refused`() {
        assertUnavailable(
            payload(isPremiumSponsor = true),
            EntitlementUnavailableReason.MALFORMED,
        )
        assertUnavailable(payload(isFamilyBound = true), EntitlementUnavailableReason.MALFORMED)
    }

    @Test
    fun `an allowance that contradicts the catalog is refused`() {
        // Free scope cannot carry connections.
        assertUnavailable(
            payload(allowance = 2, addonAllowance = 2),
            EntitlementUnavailableReason.MALFORMED,
        )
        // Base does not match the household tier.
        assertUnavailable(
            premiumHouseholdPayload().replace("\"base_allowance\": 2", "\"base_allowance\": 4"),
            EntitlementUnavailableReason.MALFORMED,
        )
        // Add-on count does not reconcile with the total.
        assertUnavailable(
            premiumHouseholdPayload().replace("\"addon_allowance\": 3", "\"addon_allowance\": 9"),
            EntitlementUnavailableReason.MALFORMED,
        )
        // Negative capacity is never valid.
        assertUnavailable(
            premiumHouseholdPayload().replace("\"allowance\": 5", "\"allowance\": -5"),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `a granted state past its own server time is refused`() {
        assertUnavailable(
            payload(
                tier = "plus",
                userTier = "plus",
                accessState = "granted",
                expiresAt = serverTime.toString(),
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `a granted state without a trusted expiry is refused`() {
        assertUnavailable(
            payload(tier = "plus", userTier = "plus", accessState = "granted"),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `a lapsed state is decodable and reports no pending downgrade`() {
        val entitlement = decodeAvailable(
            payload(
                tier = "plus",
                userTier = "plus",
                accessState = "lapsed",
                expiresAt = "2033-05-18T03:33:00Z",
            ),
        ).entitlement
        assertEquals(EntitlementAccessState.LAPSED, entitlement.accessState)
        assertFalse(entitlement.downgrade.pending)
    }

    @Test
    fun `a non-positive projection version is refused`() {
        assertUnavailable(payload(projectionVersion = 0), EntitlementUnavailableReason.MALFORMED)
    }

    @Test
    fun `a pending downgrade that does not reduce anything is refused`() {
        assertUnavailable(
            premiumHouseholdPayload().replace(
                "\"bank_connection_allowance\": 0",
                "\"bank_connection_allowance\": 5",
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
        assertUnavailable(
            premiumHouseholdPayload().replace("\"pending\": true", "\"pending\": false"),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `encoding round-trips through the same contract`() {
        val envelope = decodeAvailable(familyPayload())
        assertEquals(envelope, decodeAvailable(MinimizedEntitlementCodec.encode(envelope)))
    }
}
