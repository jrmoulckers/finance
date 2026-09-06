// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import kotlinx.coroutines.test.runTest
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

private class FakeEntitlementHttpClient(
    var response: EntitlementHttpResponse =
        EntitlementHttpResponse(200, EntitlementFixtures.premium()),
    var failure: Throwable? = null,
) : EntitlementHttpClient {
    val urls = mutableListOf<String>()
    val tokens = mutableListOf<String>()

    override suspend fun get(url: String, accessToken: String): EntitlementHttpResponse {
        urls += url
        tokens += accessToken
        failure?.let { throw it }
        return response
    }
}

class EntitlementsV1RepositoryTest {
    private val household = "44010000-0000-4000-8000-000000000001"

    private fun repository(
        httpClient: EntitlementHttpClient,
        token: String? = "synthetic-session-credential",
    ) = EntitlementsV1Repository(
        supabaseUrl = "https://project.example.test/",
        accessTokenProvider = { token },
        httpClient = httpClient,
    )

    @Test
    fun `reads the versioned endpoint and decodes through the shared contract`() = runTest {
        val http = FakeEntitlementHttpClient()

        val result = repository(http).load()

        val available = assertIs<EntitlementResult.Available>(result)
        assertEquals(EntitlementTier.PREMIUM, available.envelope.entitlement.tier)
        assertEquals(
            "https://project.example.test/functions/v1/entitlements-v1",
            http.urls.single(),
        )
    }

    @Test
    fun `household scope is the only request parameter`() = runTest {
        val http = FakeEntitlementHttpClient(
            EntitlementHttpResponse(200, EntitlementFixtures.family()),
        )

        val result = repository(http).load(household)

        assertIs<EntitlementResult.Available>(result)
        assertEquals(
            "https://project.example.test/functions/v1/entitlements-v1?household_id=$household",
            http.urls.single(),
        )
    }

    @Test
    fun `a malformed household is never sent`() = runTest {
        val http = FakeEntitlementHttpClient()

        val result = repository(http).load("' or true --")

        assertEquals(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.INVALID_REQUEST),
            result,
        )
        assertTrue(http.urls.isEmpty())
    }

    @Test
    fun `an unauthenticated session never reaches the network`() = runTest {
        val http = FakeEntitlementHttpClient()

        val result = repository(http, token = null).load()

        assertEquals(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.UNAUTHENTICATED),
            result,
        )
        assertTrue(http.urls.isEmpty())
    }

    @Test
    fun `each documented failure maps to its own non-authorizing reason`() = runTest {
        val cases =
            mapOf(
                401 to EntitlementUnavailableReason.UNAUTHENTICATED,
                403 to EntitlementUnavailableReason.FORBIDDEN,
                400 to EntitlementUnavailableReason.INVALID_REQUEST,
                405 to EntitlementUnavailableReason.INVALID_REQUEST,
                429 to EntitlementUnavailableReason.RATE_LIMITED,
                503 to EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
                500 to EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
                302 to EntitlementUnavailableReason.MALFORMED,
            )

        cases.forEach { (status, reason) ->
            val http =
                FakeEntitlementHttpClient(
                    EntitlementHttpResponse(status, """{"error":"denied","code":"forbidden"}"""),
                )

            assertEquals(
                EntitlementResult.Unavailable(reason),
                repository(http).load(),
                "status $status",
            )
        }
    }

    @Test
    fun `a lost connection is reported as offline, not as a denial`() = runTest {
        val http = FakeEntitlementHttpClient(failure = IOException("synthetic socket failure"))

        assertEquals(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.OFFLINE),
            repository(http).load(),
        )
    }

    @Test
    fun `an unreadable body fails closed as malformed`() = runTest {
        val http = FakeEntitlementHttpClient(EntitlementHttpResponse(200, "{ not json"))

        assertEquals(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.MALFORMED),
            repository(http).load(),
        )
    }

    @Test
    fun `an unknown tier fails closed instead of displaying access`() = runTest {
        val http =
            FakeEntitlementHttpClient(
                EntitlementHttpResponse(200, EntitlementFixtures.unknownTier()),
            )

        assertEquals(
            EntitlementResult.Unavailable(EntitlementUnavailableReason.MALFORMED),
            repository(http).load(),
        )
    }

    @Test
    fun `a newer contract version is refused rather than guessed`() = runTest {
        val http =
            FakeEntitlementHttpClient(
                EntitlementHttpResponse(
                    200,
                    EntitlementFixtures.premium().replace(
                        "\"contract_version\": 1",
                        "\"contract_version\": 2",
                    ),
                ),
            )

        assertEquals(
            EntitlementResult.Unavailable(
                EntitlementUnavailableReason.UNSUPPORTED_CONTRACT_VERSION,
            ),
            repository(http).load(),
        )
    }

    @Test
    fun `the request carries no client supplied entitlement claim`() = runTest {
        val http = FakeEntitlementHttpClient()

        repository(http).load()

        val url = http.urls.single()
        listOf("tier", "allowance", "product", "receipt", "expires", "provider").forEach { field ->
            assertTrue(field !in url, "request must not carry $field")
        }
        assertNull(http.urls.firstOrNull { it.contains("?") })
    }
}
