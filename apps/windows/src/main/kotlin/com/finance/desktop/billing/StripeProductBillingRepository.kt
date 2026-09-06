// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

import com.finance.desktop.data.repository.AuthRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.encodeURLParameter
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put
import kotlinx.coroutines.CancellationException

class StripeProductBillingRepository(
    private val httpClient: HttpClient,
    supabaseUrl: String,
    private val supabaseAnonKey: String,
    private val authRepository: AuthRepository,
) : ProductBillingRepository {
    override val channel: WindowsBillingChannel = WindowsBillingChannel.DIRECT_STRIPE
    private val functionsBaseUrl = "${supabaseUrl.trimEnd('/')}/functions/v1"
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun startCheckout(
        choice: BillingCatalogChoice,
        householdIntent: String?,
    ): Result<String> = billingRequest {
        val response = httpClient.post("$functionsBaseUrl/stripe-checkout") {
            authorized()
            contentType(ContentType.Application.Json)
            setBody(
                buildJsonObject {
                    put("catalog_choice", choice.wireValue)
                    householdIntent?.let { put("household_intent", it) }
                }.toString(),
            )
        }
        response.requireSuccess()
        response.jsonObject().requiredString("checkout_url")
    }

    override suspend fun openPortal(): Result<String> = billingRequest {
        val response = httpClient.post("$functionsBaseUrl/stripe-portal") {
            authorized()
            contentType(ContentType.Application.Json)
            setBody("{}")
        }
        response.requireSuccess()
        response.jsonObject().requiredString("portal_url")
    }

    override suspend fun reconcile(): Result<Unit> = billingRequest {
        val response = httpClient.post("$functionsBaseUrl/stripe-reconcile") {
            authorized()
            contentType(ContentType.Application.Json)
            setBody("{}")
        }
        response.requireSuccess()
    }

    override suspend fun loadProjection(
        householdId: String?,
    ): Result<ProductEntitlementProjection> = billingRequest {
        val suffix = householdId?.let { "?household_id=${it.encodeURLParameter()}" }.orEmpty()
        val response = httpClient.get("$functionsBaseUrl/stripe-status$suffix") {
            authorized()
        }
        response.requireSuccess()
        val projection = response.jsonObject()["projection"]?.jsonObject
            ?: throw ProductBillingException("Entitlement status is temporarily unavailable.")
        ProductEntitlementProjection(
            userTier = projection.requiredUserTier(),
            householdTier = projection.requiredHouseholdTier(),
            bankConnectionAllowance = projection["bank_connection_allowance"]?.jsonPrimitive?.long
                ?: throw ProductBillingException("Entitlement status is temporarily unavailable."),
            isPremiumSponsor = projection["is_premium_sponsor"]?.jsonPrimitive?.boolean
                ?: throw ProductBillingException("Entitlement status is temporarily unavailable."),
            isFamilyBound = projection["is_family_bound"]?.jsonPrimitive?.boolean
                ?: throw ProductBillingException("Entitlement status is temporarily unavailable."),
            effectiveAt = projection.requiredString("effective_at"),
            expiresAt = projection["expires_at"]?.jsonPrimitive?.contentOrNull,
            projectionVersion = projection["projection_version"]?.jsonPrimitive?.long
                ?: throw ProductBillingException("Entitlement status is temporarily unavailable."),
            serverTime = projection.requiredString("server_time"),
        )
    }

    private fun io.ktor.client.request.HttpRequestBuilder.authorized() {
        val session = authRepository.currentSession.value
            ?: throw ProductBillingException("Sign in to manage billing.")
        header(HttpHeaders.Authorization, listOf("Bearer", session.accessToken).joinToString(" "))
        header("apikey", supabaseAnonKey)
    }

    private suspend fun HttpResponse.jsonObject(): JsonObject =
        json.parseToJsonElement(body<String>()).jsonObject

    private fun JsonObject.requiredString(name: String): String =
        this[name]?.jsonPrimitive?.contentOrNull
            ?: throw ProductBillingException("Billing service returned an invalid response.")

    private fun JsonObject.requiredUserTier(): UserEntitlementTier {
        val value = requiredString("user_display_tier")
        return UserEntitlementTier.entries.find { it.wireValue == value }
            ?: throw ProductBillingException("Entitlement status is temporarily unavailable.")
    }

    private fun JsonObject.requiredHouseholdTier(): HouseholdEntitlementTier? {
        val value = this["household_display_tier"]?.jsonPrimitive?.contentOrNull ?: return null
        return HouseholdEntitlementTier.entries.find { it.wireValue == value }
            ?: throw ProductBillingException("Entitlement status is temporarily unavailable.")
    }

    private fun HttpResponse.requireSuccess() {
        if (!status.isSuccess()) {
            throw ProductBillingException("Billing request could not be completed.")
        }
    }

    private suspend inline fun <T> billingRequest(block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (error: CancellationException) {
            throw error
        } catch (error: ProductBillingException) {
            Result.failure(error)
        } catch (_: Exception) {
            Result.failure(ProductBillingException("Billing service is temporarily unavailable."))
        }
}

class ProductBillingException(message: String) : Exception(message)
