// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

import kotlinx.datetime.Instant

/**
 * Client-side access to the minimized entitlement projection (#4403).
 *
 * The Finance PostgreSQL ledger and its derived projection are the only
 * runtime authorization authority (ADR-0027). A repository implementation
 * reads `entitlements-v1`; it never derives an entitlement from a store SDK,
 * a receipt, a JWT claim, a PowerSync row, a feature flag, or the device
 * clock, and a value returned here never authorizes a server action. Server
 * actions re-read the projection.
 */

/** Why a minimized entitlement could not be established. Each fails closed. */
enum class EntitlementUnavailableReason {
    /** No authenticated principal; the server refused before any lookup. */
    UNAUTHENTICATED,

    /** The caller is not an active member of the requested household. */
    FORBIDDEN,

    /** The request named something the endpoint does not accept. */
    INVALID_REQUEST,

    /** The caller exceeded the endpoint's request budget. */
    RATE_LIMITED,

    /** The server could not read or understand its own projection. */
    PROJECTION_UNAVAILABLE,

    /** The response could not be fully interpreted by this build. */
    MALFORMED,

    /** The server answered with a contract version this build cannot read. */
    UNSUPPORTED_CONTRACT_VERSION,

    /**
     * The server answered against a commercial catalog version this build
     * does not implement, so its capacity semantics cannot be applied.
     */
    UNSUPPORTED_CATALOG_VERSION,

    /** The projection could not be reached at all. */
    OFFLINE,
}

/** Outcome of a minimized entitlement read. */
sealed interface EntitlementResult {
    /** A fully understood projection snapshot. */
    data class Available(val envelope: EntitlementEnvelope) : EntitlementResult

    /** No usable projection. Callers treat this as Free for display. */
    data class Unavailable(val reason: EntitlementUnavailableReason) : EntitlementResult
}

/**
 * Reads the authenticated caller's minimized entitlement.
 *
 * Implementations resolve identity from the session credential only. The
 * optional household is re-authorized server-side against active membership,
 * so passing one can never widen access.
 */
interface EntitlementRepository {
    /**
     * Read the current projection.
     *
     * @param householdId optional household scope; the server independently
     *   verifies active membership and fails closed when it is not satisfied.
     */
    suspend fun load(householdId: String? = null): EntitlementResult
}

/**
 * Bounded display rules for a previously fetched envelope.
 *
 * A cached envelope may keep the UI coherent while offline, but only until the
 * server-issued validity bound it was issued with. Past that bound the client
 * displays Free. None of this authorizes anything: a server action always
 * re-reads the projection, so a manipulated device clock can at most change
 * what the user sees locally.
 *
 * Manual entry, import, export, account deletion, privacy and security
 * controls, accessibility, and access to existing financial data are never
 * paid entitlements and are unaffected by any state here.
 */
object EntitlementDisplayPolicy {

    /**
     * Whether a cached envelope may still drive paid-tier presentation.
     *
     * Display ends only at an **authoritative** boundary — the server-proved
     * reduction instant. When the server could not prove one
     * ([DowngradeStatus.UNDETERMINED]) the snapshot has not been disproven, so
     * it keeps displaying and the staleness is surfaced through
     * [needsRefreshAt] instead of silently collapsing to Free. Dropping to
     * Free at the collapsed refresh deadline would be a false expiry: a weaker
     * grant lapsing under a surviving stronger one does not end the
     * entitlement.
     *
     * None of this authorizes anything. Every paid server action re-reads the
     * projection, so a stale or clock-manipulated snapshot can at most change
     * what one device shows.
     *
     * @param now the client's current instant, used only to stop displaying a
     *   snapshot past a boundary the server itself proved.
     */
    fun isDisplayableAt(envelope: EntitlementEnvelope, now: Instant): Boolean {
        if (MinimizedEntitlementCodec.validate(envelope) !is EntitlementResult.Available) {
            return false
        }
        val entitlement = envelope.entitlement
        if (entitlement.accessState != EntitlementAccessState.GRANTED) return false
        val provenBoundary = entitlement.downgrade.effectiveAt ?: return true
        return now < provenBoundary
    }

    /** Tier to display at [now]; Free once the server-issued bound has passed. */
    fun displayTier(envelope: EntitlementEnvelope, now: Instant): EntitlementTier =
        if (isDisplayableAt(envelope, now)) envelope.entitlement.tier else EntitlementTier.FREE

    /**
     * The instant after which a cached snapshot must be re-read.
     *
     * This is a refresh deadline, not an expiry. Reaching it means the
     * snapshot may be stale in either direction — a weaker grant may have
     * lapsed under a surviving stronger one, or the reverse — so the client
     * re-reads rather than inferring anything. `null` means the response
     * carries no server-issued deadline, which is the Free case.
     */
    fun refreshAfter(envelope: EntitlementEnvelope): Instant? =
        envelope.entitlement.validity.refreshAfter

    /** Whether a cached snapshot is past its server-issued bound at [now]. */
    fun needsRefreshAt(envelope: EntitlementEnvelope, now: Instant): Boolean {
        val bound = refreshAfter(envelope) ?: return false
        return now >= bound
    }

    /** Bank-connection capacity to display at [now]; zero once the bound has passed. */
    fun displayBankConnectionAllowance(envelope: EntitlementEnvelope, now: Instant): Long =
        if (isDisplayableAt(envelope, now)) envelope.entitlement.bankConnections.allowance else 0L

    /** Tier to display for any result, including the fail-closed cases. */
    fun displayTier(result: EntitlementResult, now: Instant): EntitlementTier = when (result) {
        is EntitlementResult.Available -> displayTier(result.envelope, now)
        is EntitlementResult.Unavailable -> EntitlementTier.FREE
    }
}
