// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

import com.finance.core.entitlement.EntitlementRepository
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementUnavailableReason
import com.finance.core.entitlement.MinimizedEntitlementCodec
import com.finance.desktop.data.repository.AuthRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.CancellationException

/**
 * Windows adapter for the shared minimized Finance entitlement repository.
 *
 * Identity comes only from the active session credential. The response is
 * decoded by the shared contract and is used for presentation only; server
 * actions independently re-read the authoritative projection.
 */
class WindowsEntitlementRepository(
    private val httpClient: HttpClient,
    supabaseUrl: String,
    private val supabaseAnonKey: String,
    private val authRepository: AuthRepository,
) : EntitlementRepository {
    private val endpoint = "${supabaseUrl.trimEnd('/')}/functions/v1/entitlements-v1"

    override suspend fun load(householdId: String?): EntitlementResult {
        val session = authRepository.currentSession.value
            ?: return unavailable(EntitlementUnavailableReason.UNAUTHENTICATED)
        val suffix = householdId?.let { "?household_id=${it.encodeURLParameter()}" }.orEmpty()

        return try {
            val response = httpClient.get("$endpoint$suffix") {
                header(
                    HttpHeaders.Authorization,
                    listOf("Bearer", session.accessToken).joinToString(" "),
                )
                header("apikey", supabaseAnonKey)
            }
            decode(response)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            unavailable(EntitlementUnavailableReason.OFFLINE)
        }
    }

    private suspend fun decode(response: HttpResponse): EntitlementResult = when {
        response.status.value in 200..299 ->
            MinimizedEntitlementCodec.decode(response.body<String>())
        else -> unavailable(entitlementUnavailableReasonForStatus(response.status))
    }

    private fun unavailable(reason: EntitlementUnavailableReason): EntitlementResult =
        EntitlementResult.Unavailable(reason)
}

internal fun entitlementUnavailableReasonForStatus(
    status: HttpStatusCode,
): EntitlementUnavailableReason = when (status) {
    HttpStatusCode.BadRequest -> EntitlementUnavailableReason.INVALID_REQUEST
    HttpStatusCode.Unauthorized -> EntitlementUnavailableReason.UNAUTHENTICATED
    HttpStatusCode.Forbidden -> EntitlementUnavailableReason.FORBIDDEN
    HttpStatusCode.TooManyRequests -> EntitlementUnavailableReason.RATE_LIMITED
    else -> if (status.value >= 500) {
        EntitlementUnavailableReason.PROJECTION_UNAVAILABLE
    } else {
        EntitlementUnavailableReason.MALFORMED
    }
}
