// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.billing

import com.finance.core.entitlement.Tier
import com.finance.sync.auth.AuthManager
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.io.IOException

internal const val REVENUECAT_CONFIRM_PATH = "/functions/v1/revenuecat-confirm"

private data class RevenueCatEntitlementWireProjection(
    val userTier: String,
    val householdTier: String?,
    val bankConnectionAllowance: Long,
    val isPremiumSponsor: Boolean,
    val isFamilyBound: Boolean,
    val effectiveAt: String,
    val expiresAt: String?,
    val projectionVersion: Long,
    val serverTime: String,
)

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

    fun decode(body: String): FinanceServerConfirmation {
        val root = parseObject(body)
        val entitlement = entitlementObject(root)
        val projection =
            RevenueCatEntitlementWireProjection(
                userTier = entitlement.string("userTier"),
                householdTier = entitlement.optionalString("householdTier"),
                bankConnectionAllowance = entitlement.long("bankConnectionAllowance"),
                isPremiumSponsor = entitlement.boolean("isPremiumSponsor"),
                isFamilyBound = entitlement.boolean("isFamilyBound"),
                effectiveAt = entitlement.string("effectiveAt"),
                expiresAt = entitlement.optionalString("expiresAt"),
                projectionVersion = entitlement.long("projectionVersion"),
                serverTime = entitlement.string("serverTime"),
            ).toProjection()
        return confirmation(root.string("status"), projection)
    }

    private fun parseObject(body: String): JsonObject =
        try {
            json.parseToJsonElement(body).jsonObject
        } catch (_: IllegalArgumentException) {
            throw EntitlementTransportException(retryable = false)
        }

    private fun entitlementObject(root: JsonObject): JsonObject {
        val value = root["entitlement"] ?: throw EntitlementTransportException(retryable = false)
        return try {
            value.jsonObject
        } catch (_: IllegalArgumentException) {
            throw EntitlementTransportException(retryable = false)
        }
    }

    private fun confirmation(
        status: String,
        projection: FinanceEntitlementProjection,
    ): FinanceServerConfirmation =
        when (status) {
            "pending" -> FinanceServerConfirmation.Pending(projection)
            "confirmed" -> FinanceServerConfirmation.Confirmed(projection)
            else -> throw EntitlementTransportException(retryable = false)
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

    private fun Map<String, kotlinx.serialization.json.JsonElement>.optionalString(
        name: String,
    ): String? = this[name]?.jsonPrimitive?.contentOrNull

    private fun Map<String, kotlinx.serialization.json.JsonElement>.long(name: String): Long =
        this[name]?.jsonPrimitive?.longOrNull
            ?: throw EntitlementTransportException(retryable = false)

    private fun Map<String, kotlinx.serialization.json.JsonElement>.boolean(name: String): Boolean {
        val value = this[name]?.jsonPrimitive?.contentOrNull
        return when (value) {
            "true" -> true
            "false" -> false
            else -> throw EntitlementTransportException(retryable = false)
        }
    }

    private fun RevenueCatEntitlementWireProjection.toProjection(): FinanceEntitlementProjection {
        val mappedUserTier = userTierValue(userTier)
        val mappedHouseholdTier = householdTierValue(householdTier)
        val tiersAreValid =
            mappedUserTier != null &&
                (householdTier == null || mappedHouseholdTier != null)
        val valuesAreValid = bankConnectionAllowance >= 0 && projectionVersion >= 1
        val datesAreValid =
            isInstant(effectiveAt) &&
                expiresAt?.let(::isInstant) != false &&
                isInstant(serverTime)
        if (!tiersAreValid || !valuesAreValid || !datesAreValid) {
            throw EntitlementTransportException(retryable = false)
        }
        val confirmedUserTier =
            mappedUserTier ?: throw EntitlementTransportException(retryable = false)
        return FinanceEntitlementProjection(
            userTier = confirmedUserTier,
            householdTier = mappedHouseholdTier,
            bankConnectionAllowance = bankConnectionAllowance,
            isPremiumSponsor = isPremiumSponsor,
            isFamilyBound = isFamilyBound,
            effectiveAt = effectiveAt,
            expiresAt = expiresAt,
            projectionVersion = projectionVersion,
            serverTime = serverTime,
            status = FinanceProjectionStatus.CURRENT,
        )
    }

    private fun userTierValue(value: String): Tier? =
        when (value) {
            "free" -> Tier.FREE
            "plus" -> Tier.PLUS
            "premium" -> Tier.PREMIUM
            else -> null
        }

    private fun householdTierValue(value: String?): Tier? =
        when (value) {
            null -> null
            "free" -> Tier.FREE
            "premium" -> Tier.PREMIUM
            "family" -> Tier.FAMILY
            else -> null
        }

    private fun isInstant(value: String): Boolean =
        try {
            Instant.parse(value)
            true
        } catch (_: IllegalArgumentException) {
            false
        }
}

/**
 * Authenticated client for `/functions/v1/revenuecat-confirm`.
 *
 * Native purchase evidence is deliberately absent from the wire request.
 * The endpoint derives the RevenueCat customer from the Finance JWT.
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

    override suspend fun fetchProjection(
        context: FinanceEntitlementContext,
        eligibleHousehold: EligibleHouseholdSelection?,
    ): FinanceServerConfirmation {
        val response =
            try {
                httpClient.get(endpointUrl) {
                    authenticatedHeader()
                    eligibleHousehold?.let {
                        url.parameters.append("household_id", it.value)
                    }
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
