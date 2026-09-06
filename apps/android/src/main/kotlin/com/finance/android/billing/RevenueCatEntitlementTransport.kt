// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.sync.auth.AuthManager
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException

internal const val REVENUECAT_CONFIRM_PATH = "/functions/v1/revenuecat-confirm"

internal object RevenueCatEntitlementWireCodec {
    private val json = Json { ignoreUnknownKeys = true }

    fun encode(request: FinanceEntitlementRequest): String =
        buildJsonObject {
            put(
                "operation",
                when (request.operation) {
                    RevenueCatConfirmationOperation.CONFIRM -> "confirm"
                    RevenueCatConfirmationOperation.RESTORE -> "restore"
                },
            )
            put("app_id", request.context.appId)
            put(
                "environment",
                when (request.context.environment) {
                    FinanceBillingEnvironment.SANDBOX -> "sandbox"
                    FinanceBillingEnvironment.PRODUCTION -> "production"
                },
            )
            request.eligibleHousehold?.let { put("household_id", it.value) }
        }.toString()

    /**
     * Read the confirmation phase, and nothing else.
     *
     * The endpoint also echoes a projection. That echo is deliberately
     * ignored: the entitlement a client may display is read from
     * `entitlements-v1` through the shared minimized contract, so a
     * confirmation response can never become a second, divergent authority.
     */
    fun decode(body: String): FinanceServerConfirmation =
        when (parseObject(body).string("status")) {
            "pending" -> FinanceServerConfirmation.PENDING
            "confirmed" -> FinanceServerConfirmation.CONFIRMED
            else -> throw EntitlementTransportException(retryable = false)
        }

    private fun parseObject(body: String): JsonObject =
        try {
            json.parseToJsonElement(body).jsonObject
        } catch (_: IllegalArgumentException) {
            throw EntitlementTransportException(retryable = false)
        }

    fun error(body: String, statusCode: Int): EntitlementTransportException {
        val code =
            try {
                json.parseToJsonElement(body).jsonObject["error"]?.jsonPrimitive?.contentOrNull
            } catch (_: IllegalArgumentException) {
                null
            }
        val retryable =
            statusCode == 429 ||
                statusCode >= 500 ||
                (statusCode == 503 && code == "temporarily_unavailable")
        return EntitlementTransportException(retryable = retryable)
    }

    private fun Map<String, kotlinx.serialization.json.JsonElement>.string(name: String): String =
        this[name]?.jsonPrimitive?.contentOrNull
            ?: throw EntitlementTransportException(retryable = false)
}

/**
 * Authenticated client for `/functions/v1/revenuecat-confirm`.
 *
 * Native purchase evidence is deliberately absent from the wire request.
 * The endpoint derives the RevenueCat customer from the Finance JWT, and the
 * only thing this transport reads back is whether Finance recorded the
 * operation — never an entitlement.
 */
class RevenueCatEntitlementTransport(
    supabaseUrl: String,
    private val authManager: AuthManager,
    private val httpClient: HttpClient,
) : AuthenticatedEntitlementTransport {
    private val endpointUrl = "${supabaseUrl.trimEnd('/')}$REVENUECAT_CONFIRM_PATH"

    override suspend fun isAuthenticated(): Boolean =
        authManager.currentSession.value?.accessToken?.isNotEmpty() == true

    override suspend fun confirm(
        request: FinanceEntitlementRequest,
    ): FinanceServerConfirmation {
        if (request.context.appId.isBlank() || request.context.appId.startsWith("YOUR_")) {
            throw EntitlementTransportException(retryable = false)
        }
        val response =
            try {
                httpClient.post(endpointUrl) {
                    authenticatedHeader()
                    contentType(ContentType.Application.Json)
                    setBody(RevenueCatEntitlementWireCodec.encode(request))
                }
            } catch (error: EntitlementTransportException) {
                throw error
            } catch (_: IOException) {
                throw EntitlementTransportException(retryable = true)
            }
        return response.toConfirmation()
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authenticatedHeader() {
        val accessToken =
            authManager.currentSession.value?.accessToken
                ?: throw EntitlementTransportException(retryable = false)
        header(HttpHeaders.Authorization, "Bearer $accessToken")
        header(HttpHeaders.Accept, ContentType.Application.Json.toString())
    }

    private suspend fun HttpResponse.toConfirmation(): FinanceServerConfirmation {
        val body = bodyAsText()
        if (status.value != 200) {
            throw RevenueCatEntitlementWireCodec.error(body, status.value)
        }
        return RevenueCatEntitlementWireCodec.decode(body)
    }
}
