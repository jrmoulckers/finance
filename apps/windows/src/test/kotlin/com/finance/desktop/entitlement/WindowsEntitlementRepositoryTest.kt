// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

import com.finance.core.entitlement.EntitlementUnavailableReason
import io.ktor.http.HttpStatusCode
import kotlin.test.Test
import kotlin.test.assertEquals

class WindowsEntitlementRepositoryTest {
    @Test
    fun `endpoint statuses preserve shared fail-closed reasons`() {
        val cases = mapOf(
            HttpStatusCode.BadRequest to EntitlementUnavailableReason.INVALID_REQUEST,
            HttpStatusCode.Unauthorized to EntitlementUnavailableReason.UNAUTHENTICATED,
            HttpStatusCode.Forbidden to EntitlementUnavailableReason.FORBIDDEN,
            HttpStatusCode.TooManyRequests to EntitlementUnavailableReason.RATE_LIMITED,
            HttpStatusCode.ServiceUnavailable to
                EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
            HttpStatusCode.NotFound to EntitlementUnavailableReason.MALFORMED,
        )

        cases.forEach { (status, reason) ->
            assertEquals(reason, entitlementUnavailableReasonForStatus(status), status.toString())
        }
    }
}
