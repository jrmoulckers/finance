// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import com.finance.android.billing.PurchaseConfirmationPhase
import com.finance.android.entitlement.EntitlementDisplayState
import com.finance.android.entitlement.EntitlementDisplayStatus
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason

/**
 * User-facing copy for the entitlement presentation states (#4403).
 *
 * Each state is announced explicitly so TalkBack users hear why a plan is
 * shown the way it is instead of inferring it from a visual treatment. None
 * of this copy promises capability: it describes what Finance could confirm.
 */
object EntitlementStatusMessages {

    /** Display name for a logical catalog plan. */
    fun planName(tier: EntitlementTier): String = when (tier) {
        EntitlementTier.FREE -> "Free"
        EntitlementTier.PLUS -> "Plus"
        EntitlementTier.PREMIUM -> "Premium"
        EntitlementTier.FAMILY -> "Family"
        EntitlementTier.UNKNOWN -> "Free"
    }

    /** Short headline shown next to the current plan. */
    fun headline(state: EntitlementDisplayState): String = when (state.status) {
        EntitlementDisplayStatus.PENDING -> "Checking your plan"
        EntitlementDisplayStatus.CURRENT -> planName(state.tier)
        EntitlementDisplayStatus.STALE -> "${planName(state.tier)} — refresh needed"
        EntitlementDisplayStatus.OFFLINE_VALID -> "${planName(state.tier)} — offline"
        EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED ->
            "${planName(state.tier)} — offline, refresh needed"

        EntitlementDisplayStatus.UNAVAILABLE -> "Plan unavailable"
    }

    /** Full explanation, used verbatim as the accessible description. */
    fun detail(state: EntitlementDisplayState): String = when (state.status) {
        EntitlementDisplayStatus.PENDING ->
            "Finance is checking your plan. Your data, entry, import, export, and history " +
                "are available as usual."

        EntitlementDisplayStatus.CURRENT ->
            "Finance confirmed the ${planName(state.tier)} plan."

        EntitlementDisplayStatus.STALE ->
            "Finance is showing your last confirmed ${planName(state.tier)} plan and needs to " +
                "check again. Purchases are confirmed by Finance when you make them."

        EntitlementDisplayStatus.OFFLINE_VALID ->
            "You are offline. Finance is showing your last confirmed ${planName(state.tier)} " +
                "plan."

        EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED ->
            "You are offline and your last confirmation has expired. Finance will check your " +
                "plan again when you reconnect."

        EntitlementDisplayStatus.UNAVAILABLE -> unavailableDetail(state.unavailableReason)
    }

    /** Announcement for a purchase or restore operation, if any is active. */
    fun confirmationMessage(phase: PurchaseConfirmationPhase): String? = when (phase) {
        PurchaseConfirmationPhase.IDLE -> null
        PurchaseConfirmationPhase.PENDING ->
            "Finance is confirming this purchase. Your plan changes only after Finance " +
                "confirms it."

        PurchaseConfirmationPhase.CONFIRMED -> "Finance confirmed this purchase."
        PurchaseConfirmationPhase.RETRY ->
            "Finance could not confirm this purchase yet and will retry. You have not been " +
                "charged twice."

        PurchaseConfirmationPhase.ERROR -> "Finance could not confirm this purchase."
        PurchaseConfirmationPhase.CANCELLED -> "The purchase was cancelled."
    }

    private fun unavailableDetail(reason: EntitlementUnavailableReason?): String = when (reason) {
        EntitlementUnavailableReason.UNAUTHENTICATED ->
            "Sign in to see your plan. Your existing data stays available."

        EntitlementUnavailableReason.FORBIDDEN ->
            "This household's plan is not available to your account."

        EntitlementUnavailableReason.RATE_LIMITED ->
            "Finance is checking your plan too often. Try again in a moment."

        EntitlementUnavailableReason.OFFLINE ->
            "You are offline, so Finance cannot check your plan. Your data, entry, import, " +
                "export, and history are available as usual."

        else ->
            "Finance cannot confirm your plan right now. Your data, entry, import, export, " +
                "and history are available as usual."
    }
}
