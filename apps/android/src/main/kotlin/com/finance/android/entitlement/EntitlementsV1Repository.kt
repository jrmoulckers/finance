// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import com.finance.core.entitlement.EntitlementRepository
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.core.entitlement.MinimizedEntitlementCodec
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import java.io.IOException

/** The only endpoint a client may read an entitlement from (#4403). */
internal const val ENTITLEMENTS_V1_PATH = "/functions/v1/entitlements-v1"

/** The single query parameter `entitlements-v1` accepts. */
private const val HOUSEHOLD_PARAM = "household_id"

private val HOUSEHOLD_ID_PATTERN =
    Regex(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    )

/** Supplies the Finance session credential. Never logged, never cached here. */
fun interface EntitlementAccessTokenProvider {
    suspend fun accessToken(): String?
}

/** One authenticated read. Implementations raise [IOException] when offline. */
interface EntitlementHttpClient {
    suspend fun get(url: String, accessToken: String): EntitlementHttpResponse
}

/** Raw transport answer. The body is only ever handed to the shared codec. */
data class EntitlementHttpResponse(val statusCode: Int, val body: String)

/** [EntitlementHttpClient] backed by the app's shared authenticated Ktor client. */
class KtorEntitlementHttpClient(
    private val httpClient: HttpClient,
) : EntitlementHttpClient {
    override suspend fun get(url: String, accessToken: String): EntitlementHttpResponse {
        val response =
            httpClient.get(url) {
                header(HttpHeaders.Authorization, "Bearer $accessToken")
                header(HttpHeaders.Accept, ContentType.Application.Json.toString())
            }
        return EntitlementHttpResponse(response.status.value, response.bodyAsText())
    }
}

/**
 * Reads the authenticated caller's minimized entitlement from `entitlements-v1`.
 *
 * The request carries a session credential and, at most, a household the
 * server independently re-authorizes. No tier, allowance, product, purchase,
 * provider, receipt, or validity value can be supplied, and nothing returned
 * here authorizes a cost-incurring action — the server re-reads its own
 * projection for that.
 *
 * Every failure is mapped to an explicit, non-authorizing reason. Neither the
 * response body nor any identifier is logged.
 */
class EntitlementsV1Repository(
    supabaseUrl: String,
    private val accessTokenProvider: EntitlementAccessTokenProvider,
    private val httpClient: EntitlementHttpClient,
) : EntitlementRepository {
    private val endpointUrl = "${supabaseUrl.trimEnd('/')}$ENTITLEMENTS_V1_PATH"

    override suspend fun load(householdId: String?): EntitlementResult {
        if (householdId != null && !HOUSEHOLD_ID_PATTERN.matches(householdId)) {
            // A household the client cannot even shape correctly is never sent.
            return unavailable(EntitlementUnavailableReason.INVALID_REQUEST)
        }
        val accessToken = accessTokenProvider.accessToken()
        if (accessToken.isNullOrEmpty()) {
            return unavailable(EntitlementUnavailableReason.UNAUTHENTICATED)
        }

        val response =
            try {
                httpClient.get(requestUrl(householdId), accessToken)
            } catch (_: IOException) {
                return unavailable(EntitlementUnavailableReason.OFFLINE)
            }

        if (response.statusCode != HTTP_OK) {
            return unavailable(reasonFor(response.statusCode))
        }
        return MinimizedEntitlementCodec.decode(response.body)
    }

    private fun requestUrl(householdId: String?): String =
        if (householdId == null) endpointUrl else "$endpointUrl?$HOUSEHOLD_PARAM=$householdId"

    private fun reasonFor(statusCode: Int): EntitlementUnavailableReason = when (statusCode) {
        HTTP_UNAUTHORIZED -> EntitlementUnavailableReason.UNAUTHENTICATED
        HTTP_FORBIDDEN -> EntitlementUnavailableReason.FORBIDDEN
        HTTP_BAD_REQUEST, HTTP_METHOD_NOT_ALLOWED -> EntitlementUnavailableReason.INVALID_REQUEST
        HTTP_TOO_MANY_REQUESTS -> EntitlementUnavailableReason.RATE_LIMITED
        in HTTP_SERVER_ERROR..HTTP_STATUS_MAX -> EntitlementUnavailableReason.PROJECTION_UNAVAILABLE
        else -> EntitlementUnavailableReason.MALFORMED
    }

    private fun unavailable(reason: EntitlementUnavailableReason) =
        EntitlementResult.Unavailable(reason)

    private companion object {
        const val HTTP_OK = 200
        const val HTTP_BAD_REQUEST = 400
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_FORBIDDEN = 403
        const val HTTP_METHOD_NOT_ALLOWED = 405
        const val HTTP_TOO_MANY_REQUESTS = 429
        const val HTTP_SERVER_ERROR = 500
        const val HTTP_STATUS_MAX = 599
    }
}
