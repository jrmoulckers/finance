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
        catalogVersion: String = "1",
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
        downgradeStatus: String = "none",
        downgradeEffectiveAt: String = "null",
    ): String = """
        {
          "contract_version": $contractVersion,
          "catalog_version": $catalogVersion,
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
              "refresh_after": ${quoteOrNull(expiresAt)},
              "server_time": "$serverTime",
              "projection_version": $projectionVersion
            },
            "downgrade": {
              "status": "$downgradeStatus",
              "effective_at": ${quoteOrNull(downgradeEffectiveAt)}
            }
          }
        }
    """.trimIndent()

    private fun quoteOrNull(value: String): String = if (value == "null") "null" else "\"$value\""

    /** A purchaser who also sponsors their household: two contributing grants. */
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
        downgradeStatus = "undetermined",
    )

    /** A sponsored member holds no purchaser grant, so the bound is provable. */
    private fun sponsoredMemberPayload(): String = payload(
        scope = "household",
        tier = "premium",
        userTier = "free",
        householdTier = "premium",
        accessState = "granted",
        allowance = 5,
        baseAllowance = 2,
        addonAllowance = 3,
        expiresAt = expiry.toString(),
        downgradeStatus = "scheduled",
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
        downgradeStatus = "scheduled",
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
        assertEquals(DowngradeStatus.NONE, envelope.entitlement.downgrade.status)
    }

    @Test
    fun `plus projection decodes as a granted user scope`() {
        val envelope = decodeAvailable(
            payload(
                tier = "plus",
                userTier = "plus",
                accessState = "granted",
                expiresAt = expiry.toString(),
                downgradeStatus = "scheduled",
                downgradeEffectiveAt = expiry.toString(),
            ),
        )
        assertEquals(EntitlementTier.PLUS, envelope.entitlement.tier)
        assertEquals(EntitlementScope.USER, envelope.entitlement.scope)
        assertEquals(expiry, envelope.entitlement.validity.refreshAfter)
        // A purchaser-only grant is the sole contributor, so its lapse to Free
        // is a provable reduction even though Plus carries no bank allowance.
        assertEquals(DowngradeStatus.SCHEDULED, envelope.entitlement.downgrade.status)
        assertEquals(expiry, envelope.entitlement.downgrade.effectiveAt)
    }

    @Test
    fun `a purchaser-only tier that can lapse never reports nothing to reduce`() {
        // `none` would deny that Plus lapses to Free at a known instant.
        assertUnavailable(
            payload(
                tier = "plus",
                userTier = "plus",
                accessState = "granted",
                expiresAt = expiry.toString(),
                downgradeStatus = "none",
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
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
    }

    @Test
    fun `a scheduled downgrade states its boundary and no post-boundary allowance`() {
        val envelope = decodeAvailable(sponsoredMemberPayload())
        assertEquals(DowngradeStatus.SCHEDULED, envelope.entitlement.downgrade.status)
        // A sponsored member holds no purchaser grant, so the bound provably
        // governs the reduction. Nothing claims what capacity survives it,
        // because the Premium base may.
        assertEquals(expiry, envelope.entitlement.downgrade.effectiveAt)
        assertFalse(
            MinimizedEntitlementCodec.encode(envelope).contains("bank_connection_allowance"),
            "the contract must not state a post-boundary allowance",
        )
    }

    @Test
    fun `a weaker purchaser grant never dictates the household boundary`() {
        // Plus lapses tomorrow while the Family household survives for a
        // month. The projection collapses both bounds, so the earlier one
        // belongs to the grant that does not determine the effective tier or
        // allowance and must not be claimed as the reduction instant.
        val entitlement = decodeAvailable(
            payload(
                scope = "household",
                tier = "family",
                userTier = "plus",
                householdTier = "family",
                accessState = "granted",
                isFamilyBound = true,
                allowance = 4,
                baseAllowance = 4,
                expiresAt = expiry.toString(),
                downgradeStatus = "undetermined",
            ),
        ).entitlement
        assertEquals(EntitlementTier.FAMILY, entitlement.tier)
        assertEquals(EntitlementScope.HOUSEHOLD, entitlement.scope)
        assertEquals(DowngradeStatus.UNDETERMINED, entitlement.downgrade.status)
        assertNull(entitlement.downgrade.effectiveAt)
        // The bound is still disclosed: it is when the response stops being
        // guaranteed accurate, which is when the client refreshes.
        assertEquals(expiry, entitlement.validity.refreshAfter)
    }

    @Test
    fun `an equal-rank purchaser grant also leaves the boundary undetermined`() {
        val entitlement = decodeAvailable(premiumHouseholdPayload()).entitlement
        assertEquals(EntitlementTier.PREMIUM, entitlement.tier)
        assertEquals(DowngradeStatus.UNDETERMINED, entitlement.downgrade.status)
        assertNull(entitlement.downgrade.effectiveAt)
    }

    @Test
    fun `a claimed boundary is refused when two grants contribute`() {
        // The exact defect: a response that attributes the collapsed bound to
        // the household while a purchaser grant also contributes.
        assertUnavailable(
            payload(
                scope = "household",
                tier = "family",
                userTier = "plus",
                householdTier = "family",
                accessState = "granted",
                isFamilyBound = true,
                allowance = 4,
                baseAllowance = 4,
                expiresAt = expiry.toString(),
                downgradeStatus = "scheduled",
                downgradeEffectiveAt = expiry.toString(),
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
        // And the converse: a provable single-grant bound may not be hidden.
        assertUnavailable(
            familyPayload()
                .replace("\"status\": \"scheduled\"", "\"status\": \"undetermined\"")
                .replace("\"effective_at\": \"$expiry\"", "\"effective_at\": null"),
            EntitlementUnavailableReason.MALFORMED,
        )
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
    fun `the minimized contract offers no bridge into the legacy feature matrix`() {
        // Catalog version 1 states that privacy, encryption, accessibility,
        // data export, data deletion, and access to existing financial data are
        // never paid entitlements. The legacy FeatureGate matrix does gate
        // export history and account count by tier, so this contract
        // intentionally provides no conversion into it: its only outputs are a
        // display tier and a bank-connection capacity.
        val envelope = decodeAvailable(familyPayload())
        assertEquals(
            EntitlementTier.FAMILY,
            EntitlementDisplayPolicy.displayTier(envelope, serverTime),
        )
        assertEquals(
            4L,
            EntitlementDisplayPolicy.displayBankConnectionAllowance(envelope, serverTime),
        )
        // Failing closed reduces only those two outputs.
        val unavailable = EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE)
        assertEquals(
            EntitlementTier.FREE,
            EntitlementDisplayPolicy.displayTier(unavailable, serverTime),
        )
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
                    downgradeStatus = "scheduled",
                    downgradeEffectiveAt = expiry.toString(),
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
    fun `an unsupported catalog version is refused rather than read with v1 rules`() {
        // The capacity checks below encode catalog version 1 exactly, so a
        // later catalog must not be interpreted with them.
        assertUnavailable(
            payload(catalogVersion = "2"),
            EntitlementUnavailableReason.UNSUPPORTED_CATALOG_VERSION,
        )
        assertUnavailable(
            payload(
                catalogVersion = "2",
                scope = "household",
                tier = "family",
                householdTier = "family",
                accessState = "granted",
                isFamilyBound = true,
                allowance = 4,
                baseAllowance = 4,
                expiresAt = expiry.toString(),
                downgradeStatus = "scheduled",
                downgradeEffectiveAt = expiry.toString(),
            ),
            EntitlementUnavailableReason.UNSUPPORTED_CATALOG_VERSION,
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
                downgradeStatus = "scheduled",
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
    fun `Family capacity is fixed at exactly four and never accrues add-ons`() {
        // Catalog version 1 makes add-ons Premium-only, so an over-allocated
        // Family household is not a bigger entitlement — it is unreadable.
        assertUnavailable(
            familyPayload()
                .replace("\"allowance\": 4", "\"allowance\": 6")
                .replace("\"addon_allowance\": 0", "\"addon_allowance\": 2"),
            EntitlementUnavailableReason.MALFORMED,
        )
        assertUnavailable(
            familyPayload().replace("\"allowance\": 4", "\"allowance\": 3"),
            EntitlementUnavailableReason.MALFORMED,
        )
        assertUnavailable(
            familyPayload().replace("\"addon_allowance\": 0", "\"addon_allowance\": 1"),
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
    fun `a lapsed state is decodable and reports no reducible capacity`() {
        val entitlement = decodeAvailable(
            payload(
                tier = "plus",
                userTier = "plus",
                accessState = "lapsed",
                expiresAt = "2033-05-18T03:33:00Z",
            ),
        ).entitlement
        assertEquals(EntitlementAccessState.LAPSED, entitlement.accessState)
        assertEquals(DowngradeStatus.NONE, entitlement.downgrade.status)
    }

    @Test
    fun `a non-positive projection version is refused`() {
        assertUnavailable(payload(projectionVersion = 0), EntitlementUnavailableReason.MALFORMED)
    }

    @Test
    fun `a downgrade status that does not match its boundary is refused`() {
        // `scheduled` must name the server-issued bound exactly.
        assertUnavailable(
            sponsoredMemberPayload().replace(
                "\"effective_at\": \"$expiry\"",
                "\"effective_at\": null",
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
        assertUnavailable(
            sponsoredMemberPayload().replace(
                "\"effective_at\": \"$expiry\"",
                "\"effective_at\": \"2099-01-01T00:00:00Z\"",
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
        // `none` may not be claimed while capacity can still reduce.
        assertUnavailable(
            sponsoredMemberPayload()
                .replace("\"status\": \"scheduled\"", "\"status\": \"none\"")
                .replace("\"effective_at\": \"$expiry\"", "\"effective_at\": null"),
            EntitlementUnavailableReason.MALFORMED,
        )
        // `undetermined` may not carry an instant.
        assertUnavailable(
            premiumHouseholdPayload().replace(
                "\"effective_at\": null",
                "\"effective_at\": \"$expiry\"",
            ),
            EntitlementUnavailableReason.MALFORMED,
        )
        // An unknown status is not understood and never authorizes.
        assertUnavailable(
            sponsoredMemberPayload().replace("\"status\": \"scheduled\"", "\"status\": \"soon\""),
            EntitlementUnavailableReason.MALFORMED,
        )
    }

    @Test
    fun `encoding round-trips through the same contract`() {
        val envelope = decodeAvailable(familyPayload())
        assertEquals(envelope, decodeAvailable(MinimizedEntitlementCodec.encode(envelope)))
    }
}
