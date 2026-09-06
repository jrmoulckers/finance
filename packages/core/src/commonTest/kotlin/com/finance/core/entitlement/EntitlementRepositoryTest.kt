// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/**
 * Repository contract tests (#4403).
 *
 * A repository decodes exactly what `entitlements-v1` served. It never
 * synthesizes an entitlement, and the household scope it forwards is only ever
 * re-authorized server-side, so no client input can widen access.
 */
class EntitlementRepositoryTest {

    private val serverTime = Instant.parse("2033-05-18T03:33:21Z")

    private class FakeEntitlementRepository(
        private val responses: Map<String?, String>,
    ) : EntitlementRepository {
        val requestedScopes = mutableListOf<String?>()

        override suspend fun load(householdId: String?): EntitlementResult {
            requestedScopes += householdId
            val payload = responses[householdId]
                ?: return EntitlementResult.Unavailable(EntitlementUnavailableReason.FORBIDDEN)
            return MinimizedEntitlementCodec.decode(payload)
        }
    }

    private fun familyPayload(): String = """
        {
          "contract_version": 1,
          "catalog_version": 1,
          "entitlement": {
            "scope": "household",
            "tier": "family",
            "user_tier": "free",
            "household_tier": "family",
            "access_state": "granted",
            "lifecycle": null,
            "is_premium_sponsor": false,
            "is_family_bound": true,
            "bank_connections": {
              "allowance": 4,
              "base_allowance": 4,
              "addon_allowance": 0
            },
            "validity": {
              "effective_at": "2033-05-18T03:33:20Z",
              "expires_at": "2033-06-18T03:33:20Z",
              "server_time": "2033-05-18T03:33:21Z",
              "projection_version": 7
            },
            "downgrade": {
              "pending": true,
              "effective_at": "2033-06-18T03:33:20Z"
            }
          }
        }
    """.trimIndent()

    @Test
    fun `an unscoped read defaults to the authenticated purchaser`() = runTest {
        val repository = FakeEntitlementRepository(emptyMap())
        repository.load()
        assertEquals(listOf<String?>(null), repository.requestedScopes)
    }

    @Test
    fun `a household read decodes the household subject`() = runTest {
        val householdId = "30000000-0000-4000-8000-000000000002"
        val repository = FakeEntitlementRepository(mapOf(householdId to familyPayload()))
        val result = repository.load(householdId)
        assertIs<EntitlementResult.Available>(result)
        assertEquals(EntitlementScope.HOUSEHOLD, result.envelope.entitlement.scope)
        assertEquals(EntitlementTier.FAMILY, result.envelope.entitlement.tier)
        assertEquals(
            EntitlementTier.FAMILY,
            EntitlementDisplayPolicy.displayTier(result, serverTime),
        )
    }

    @Test
    fun `a household the caller cannot read fails closed`() = runTest {
        val repository = FakeEntitlementRepository(
            mapOf("30000000-0000-4000-8000-000000000002" to familyPayload()),
        )
        val result = repository.load("40000000-0000-4000-8000-000000000009")
        assertIs<EntitlementResult.Unavailable>(result)
        assertEquals(EntitlementUnavailableReason.FORBIDDEN, result.reason)
        assertEquals(
            EntitlementTier.FREE,
            EntitlementDisplayPolicy.displayTier(result, serverTime),
        )
    }

    @Test
    fun `a truncated response fails closed rather than degrading to a lower tier`() = runTest {
        val truncated = familyPayload().substring(0, familyPayload().length / 2)
        val repository = FakeEntitlementRepository(mapOf(null to truncated))
        val result = repository.load()
        assertIs<EntitlementResult.Unavailable>(result)
        assertEquals(EntitlementUnavailableReason.MALFORMED, result.reason)
    }
}
