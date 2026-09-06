// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import com.finance.core.entitlement.EntitlementDisplayPolicy
import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.EntitlementTier
import com.finance.core.entitlement.EntitlementUnavailableReason
import kotlinx.datetime.Instant

/**
 * How much confidence the UI may express about what it is showing (#4403).
 *
 * Every value here is a **presentation** state. None of them authorizes
 * anything: a paid server action re-reads `entitlements-v1`, so a stale,
 * offline, or clock-manipulated device can at most change what one screen
 * shows.
 */
enum class EntitlementDisplayStatus {
    /** No answer yet in this session. Show progress, never a tier claim. */
    PENDING,

    /** A server-confirmed snapshot inside its server-issued refresh bound. */
    CURRENT,

    /**
     * The server was reachable but its answer was unusable, or the snapshot
     * passed its refresh deadline. The last proven snapshot keeps displaying
     * because it has not been disproven.
     */
    STALE,

    /** No connectivity, and the cached snapshot is still inside its bounds. */
    OFFLINE_VALID,

    /**
     * No connectivity, and the cached snapshot passed its server-issued
     * refresh deadline or its server-proved reduction boundary.
     */
    OFFLINE_REFRESH_NEEDED,

    /** Nothing usable to display. The UI falls back to Free presentation. */
    UNAVAILABLE,
}

/**
 * Display-only entitlement presentation derived from the shared minimized
 * contract in `packages/core`.
 *
 * Manual entry, import, export, account deletion, privacy and security
 * controls, accessibility, and access to existing financial data are never
 * paid entitlements and are never gated by any value here.
 */
data class EntitlementDisplayState(
    val status: EntitlementDisplayStatus = EntitlementDisplayStatus.PENDING,
    /** Tier to present. Free whenever nothing better has been proven. */
    val tier: EntitlementTier = EntitlementTier.FREE,
    /** Bank-connection capacity to present. Zero unless proven. */
    val bankConnectionAllowance: Long = 0L,
    /** Server-issued refresh deadline, when the response carried one. */
    val refreshAfter: Instant? = null,
    /** Server-proved reduction boundary, present only when proven. */
    val downgradeAt: Instant? = null,
    /** Why nothing better can be shown, for the accessible explanation. */
    val unavailableReason: EntitlementUnavailableReason? = null,
) {
    /** Whether the UI should keep showing a progress affordance. */
    val isPending: Boolean get() = status == EntitlementDisplayStatus.PENDING

    /** Whether a refresh is worth attempting when connectivity allows. */
    val needsRefresh: Boolean
        get() = when (status) {
            EntitlementDisplayStatus.STALE,
            EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED,
            EntitlementDisplayStatus.UNAVAILABLE,
            -> true

            EntitlementDisplayStatus.PENDING,
            EntitlementDisplayStatus.CURRENT,
            EntitlementDisplayStatus.OFFLINE_VALID,
            -> false
        }

    companion object {
        val PENDING = EntitlementDisplayState()

        /**
         * Resolve what to display from a repository answer and the cached
         * snapshot.
         *
         * [now] is used only to honour bounds the **server** issued — the
         * refresh deadline and, when the projection proved one, the reduction
         * boundary. It never extends access and never authorizes.
         */
        fun from(
            result: EntitlementResult,
            cached: EntitlementEnvelope?,
            now: Instant,
        ): EntitlementDisplayState = when (result) {
            is EntitlementResult.Available -> live(result.envelope, now)
            is EntitlementResult.Unavailable -> degraded(result.reason, cached, now)
        }

        private fun live(envelope: EntitlementEnvelope, now: Instant): EntitlementDisplayState =
            snapshot(
                envelope = envelope,
                now = now,
                status =
                    if (EntitlementDisplayPolicy.needsRefreshAt(envelope, now)) {
                        EntitlementDisplayStatus.STALE
                    } else {
                        EntitlementDisplayStatus.CURRENT
                    },
            )

        private fun degraded(
            reason: EntitlementUnavailableReason,
            cached: EntitlementEnvelope?,
            now: Instant,
        ): EntitlementDisplayState {
            // An identity or membership denial disproves the cached subject, so
            // its snapshot must not keep displaying.
            val identityDenied =
                reason == EntitlementUnavailableReason.UNAUTHENTICATED ||
                    reason == EntitlementUnavailableReason.FORBIDDEN
            val usable = cached?.takeUnless { identityDenied } ?: return unavailable(reason)

            val offline = reason == EntitlementUnavailableReason.OFFLINE
            // `isDisplayableAt` is false once the server-proved reduction
            // boundary passed, or when the snapshot never bore access at all.
            val displayable = EntitlementDisplayPolicy.isDisplayableAt(usable, now)
            val needsRefresh = EntitlementDisplayPolicy.needsRefreshAt(usable, now)

            val status = when {
                // Reachable server, unusable answer: the snapshot is not
                // disproven, so it keeps displaying and is flagged as stale.
                !offline -> if (displayable) {
                    EntitlementDisplayStatus.STALE
                } else {
                    return unavailable(reason)
                }

                displayable && !needsRefresh -> EntitlementDisplayStatus.OFFLINE_VALID
                else -> EntitlementDisplayStatus.OFFLINE_REFRESH_NEEDED
            }
            return snapshot(usable, now, status, reason)
        }

        private fun snapshot(
            envelope: EntitlementEnvelope,
            now: Instant,
            status: EntitlementDisplayStatus,
            reason: EntitlementUnavailableReason? = null,
        ) = EntitlementDisplayState(
            status = status,
            tier = EntitlementDisplayPolicy.displayTier(envelope, now),
            bankConnectionAllowance =
                EntitlementDisplayPolicy.displayBankConnectionAllowance(envelope, now),
            refreshAfter = EntitlementDisplayPolicy.refreshAfter(envelope),
            downgradeAt = envelope.entitlement.downgrade.effectiveAt,
            unavailableReason = reason,
        )

        private fun unavailable(reason: EntitlementUnavailableReason) =
            EntitlementDisplayState(
                status = EntitlementDisplayStatus.UNAVAILABLE,
                tier = EntitlementTier.FREE,
                unavailableReason = reason,
            )
    }
}
