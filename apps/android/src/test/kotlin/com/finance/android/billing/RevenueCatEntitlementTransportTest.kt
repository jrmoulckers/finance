// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.models.types.SyncId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RevenueCatEntitlementTransportTest {
    @Test
    fun `confirmation encoding matches the server allowlist`() {
        val request =
            FinanceEntitlementRequest(
                operation = RevenueCatConfirmationOperation.CONFIRM,
                context =
                    FinanceEntitlementContext(
                        appId = "app_synthetic_google",
                        environment = FinanceBillingEnvironment.SANDBOX,
                    ),
                eligibleHousehold = null,
            )

        val body = Json.parseToJsonElement(RevenueCatEntitlementWireCodec.encode(request)).jsonObject

        assertEquals(setOf("operation", "app_id", "environment"), body.keys)
        assertEquals("confirm", body.getValue("operation").jsonPrimitive.content)
        assertEquals("app_synthetic_google", body.getValue("app_id").jsonPrimitive.content)
        assertEquals("sandbox", body.getValue("environment").jsonPrimitive.content)
        assertFalse("provider" in body)
        assertFalse("receipt" in body)
        assertFalse("tier" in body)
        assertFalse("operation_reference" in body)
    }

    @Test
    fun `eligible membership encodes only constrained household uuid`() {
        val household =
            requireNotNull(
                EligibleHouseholdSelection.fromAuthenticatedMembership(
                    SyncId("44010000-0000-4000-8000-000000000001"),
                ),
            )
        val request =
            FinanceEntitlementRequest(
                operation = RevenueCatConfirmationOperation.RESTORE,
                context =
                    FinanceEntitlementContext(
                        appId = "app_synthetic_google",
                        environment = FinanceBillingEnvironment.PRODUCTION,
                    ),
                eligibleHousehold = household,
            )

        val body = Json.parseToJsonElement(RevenueCatEntitlementWireCodec.encode(request)).jsonObject

        assertEquals(
            setOf("operation", "app_id", "environment", "household_id"),
            body.keys,
        )
        assertEquals("restore", body.getValue("operation").jsonPrimitive.content)
        assertEquals(
            "44010000-0000-4000-8000-000000000001",
            body.getValue("household_id").jsonPrimitive.content,
        )
    }

    @Test
    fun `invalid household selection is rejected`() {
        assertEquals(
            null,
            EligibleHouseholdSelection.fromAuthenticatedMembership(SyncId("not-a-uuid")),
        )
    }

    @Test
    fun `only the confirmation phase is read back`() {
        assertEquals(
            FinanceServerConfirmation.PENDING,
            RevenueCatEntitlementWireCodec.decode("""{"status":"pending"}"""),
        )
        assertEquals(
            FinanceServerConfirmation.CONFIRMED,
            RevenueCatEntitlementWireCodec.decode("""{"status":"confirmed"}"""),
        )
    }

    @Test
    fun `a projection echoed by the confirmation endpoint is ignored`() {
        val response =
            RevenueCatEntitlementWireCodec.decode(
                """
                {
                  "status": "pending",
                  "entitlement": {
                    "userTier": "premium",
                    "householdTier": "family",
                    "bankConnectionAllowance": 99,
                    "isPremiumSponsor": true,
                    "isFamilyBound": true,
                    "expiresAt": null,
                    "projectionVersion": 7,
                    "serverTime": "2026-09-06T12:00:01Z"
                  }
                }
                """.trimIndent(),
            )

        // The echo cannot become a second entitlement authority: the wire type
        // exposes a phase and nothing else.
        assertEquals(FinanceServerConfirmation.PENDING, response)
        assertTrue(
            FinanceServerConfirmation.entries.map { it.name }.containsAll(
                listOf("PENDING", "CONFIRMED"),
            ),
        )
        assertEquals(2, FinanceServerConfirmation.entries.size)
    }

    @Test
    fun `an unknown or malformed status fails closed`() {
        assertFailsWith<EntitlementTransportException> {
            RevenueCatEntitlementWireCodec.decode("""{"status":"granted"}""")
        }
        assertFailsWith<EntitlementTransportException> {
            RevenueCatEntitlementWireCodec.decode("{ not json")
        }
        assertFailsWith<EntitlementTransportException> {
            RevenueCatEntitlementWireCodec.decode("""{"entitlement":{"userTier":"premium"}}""")
        }
    }

    @Test
    fun `transport errors are retry classified and privacy safe`() {
        val marker = "synthetic-provider-identifier"
        val error =
            RevenueCatEntitlementWireCodec.error(
                """{"status":"error","error":"temporarily_unavailable","detail":"$marker"}""",
                503,
            )

        assertTrue(error.retryable)
        assertFalse(error.toString().contains(marker))
        assertEquals(REVENUECAT_CONFIRM_PATH, "/functions/v1/revenuecat-confirm")
    }
}
