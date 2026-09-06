// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.entitlement

import com.finance.core.entitlement.EntitlementDisplayPolicy
import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import kotlinx.datetime.Instant

/** Accessible presentation states for the non-authorizing entitlement display. */
enum class EntitlementDisplayStatus {
    PENDING,
    CURRENT,
    UNAVAILABLE,
    STALE,
    OFFLINE_VALID,
    OFFLINE_EXPIRED,
    REFRESH_NEEDED,
}

data class EntitlementPresentation(
    val status: EntitlementDisplayStatus,
    val tier: EntitlementTier,
    val bankConnectionAllowance: Long,
    val envelope: EntitlementEnvelope?,
    val message: String,
)

/**
 * Maps shared repository outcomes to Windows display state.
 *
 * All tier and validity decisions delegate to [EntitlementDisplayPolicy].
 * Device time can therefore only stop presentation at a server-proven
 * downgrade boundary; the refresh deadline requests a refresh and is surfaced
 * without inventing an expiry.
 */
object EntitlementPresentationPolicy {
    fun current(envelope: EntitlementEnvelope, now: Instant): EntitlementPresentation {
        val needsRefresh = EntitlementDisplayPolicy.needsRefreshAt(envelope, now)
        return presentation(
            status = if (needsRefresh) {
                EntitlementDisplayStatus.REFRESH_NEEDED
            } else {
                EntitlementDisplayStatus.CURRENT
            },
            envelope = envelope,
            now = now,
            message = if (needsRefresh) {
                "Subscription status needs a server refresh."
            } else {
                "Subscription status is current."
            },
        )
    }

    fun fallback(
        unavailable: EntitlementResult.Unavailable,
        cached: EntitlementEnvelope?,
        now: Instant,
    ): EntitlementPresentation {
        if (cached == null || !unavailable.reason.allowsDisplayCache()) {
            return EntitlementPresentation(
                status = EntitlementDisplayStatus.UNAVAILABLE,
                tier = EntitlementTier.FREE,
                bankConnectionAllowance = 0,
                envelope = null,
                message = unavailableMessage(unavailable.reason),
            )
        }

        val displayable = EntitlementDisplayPolicy.isDisplayableAt(cached, now)
        val needsRefresh = EntitlementDisplayPolicy.needsRefreshAt(cached, now)
        val status = when {
            unavailable.reason == EntitlementUnavailableReason.OFFLINE && !displayable ->
                EntitlementDisplayStatus.OFFLINE_EXPIRED
            needsRefresh -> EntitlementDisplayStatus.REFRESH_NEEDED
            unavailable.reason == EntitlementUnavailableReason.OFFLINE ->
                EntitlementDisplayStatus.OFFLINE_VALID
            else -> EntitlementDisplayStatus.STALE
        }
        val message = when (status) {
            EntitlementDisplayStatus.OFFLINE_EXPIRED ->
                "Offline. Paid access is no longer displayed after a server-proven boundary."
            EntitlementDisplayStatus.REFRESH_NEEDED ->
                "Saved subscription status needs a server refresh."
            EntitlementDisplayStatus.OFFLINE_VALID ->
                "Offline. Showing the last protected subscription status."
            EntitlementDisplayStatus.STALE ->
                "Showing saved subscription status while the server status is unavailable."
            else -> unavailableMessage(unavailable.reason)
        }
        return presentation(status, cached, now, message)
    }

    private fun presentation(
        status: EntitlementDisplayStatus,
        envelope: EntitlementEnvelope,
        now: Instant,
        message: String,
    ) = EntitlementPresentation(
        status = status,
        tier = EntitlementDisplayPolicy.displayTier(envelope, now),
        bankConnectionAllowance =
            EntitlementDisplayPolicy.displayBankConnectionAllowance(envelope, now),
        envelope = envelope,
        message = message,
    )

    private fun unavailableMessage(reason: EntitlementUnavailableReason): String = when (reason) {
        EntitlementUnavailableReason.UNAUTHENTICATED ->
            "Sign in to view subscription status."
        EntitlementUnavailableReason.FORBIDDEN ->
            "Subscription status is unavailable for this household."
        EntitlementUnavailableReason.INVALID_REQUEST ->
            "Subscription status could not be requested."
        EntitlementUnavailableReason.RATE_LIMITED ->
            "Subscription status is temporarily rate limited. Try again shortly."
        EntitlementUnavailableReason.UNSUPPORTED_CONTRACT_VERSION,
        EntitlementUnavailableReason.UNSUPPORTED_CATALOG_VERSION,
        EntitlementUnavailableReason.MALFORMED,
        EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
        EntitlementUnavailableReason.OFFLINE,
        -> "Subscription status is currently unavailable."
    }

}

internal fun EntitlementUnavailableReason.allowsDisplayCache(): Boolean = when (this) {
    EntitlementUnavailableReason.OFFLINE,
    EntitlementUnavailableReason.PROJECTION_UNAVAILABLE,
    EntitlementUnavailableReason.RATE_LIMITED,
    -> true
    EntitlementUnavailableReason.UNAUTHENTICATED,
    EntitlementUnavailableReason.FORBIDDEN,
    EntitlementUnavailableReason.INVALID_REQUEST,
    EntitlementUnavailableReason.MALFORMED,
    EntitlementUnavailableReason.UNSUPPORTED_CONTRACT_VERSION,
    EntitlementUnavailableReason.UNSUPPORTED_CATALOG_VERSION,
    -> false
}
