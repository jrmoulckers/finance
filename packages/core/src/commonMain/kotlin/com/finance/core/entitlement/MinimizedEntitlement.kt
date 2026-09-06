// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.entitlement

import kotlinx.datetime.Instant
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json

/**
 * Shared contract for the minimized entitlement API (`entitlements-v1`, #4403).
 *
 * The Finance PostgreSQL ledger and its derived projection are the **only**
 * runtime authorization authority (ADR-0027). These types describe what the
 * server chooses to disclose; they never make an access decision, never carry
 * provider evidence, and are never a substitute for a server-side check.
 *
 * Everything here is deliberately forward compatible: an unknown key is
 * ignored and an unknown enum value decodes to `UNKNOWN`, which
 * [MinimizedEntitlementCodec] then treats as malformed so the client fails
 * closed instead of guessing.
 */

/** Wire contract version this client understands. */
const val ENTITLEMENT_CONTRACT_VERSION: Int = 1

/** Commercial catalog version this client was built against. */
const val ENTITLEMENT_CATALOG_VERSION: Int = 1

/**
 * Base [KSerializer] for a string-valued wire enum.
 *
 * An unrecognized value decodes to [fallback] rather than throwing, so a
 * server that later adds a value cannot break an older client — the value is
 * simply not understood, and an unrecognized entitlement grants nothing.
 */
internal open class WireEnumSerializer<T : Enum<T>>(
    serialName: String,
    private val entries: List<T>,
    private val wireOf: (T) -> String,
    private val fallback: T,
) : KSerializer<T> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor(serialName, PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: T) = encoder.encodeString(wireOf(value))

    override fun deserialize(decoder: Decoder): T {
        val raw = decoder.decodeString()
        return entries.firstOrNull { wireOf(it) == raw } ?: fallback
    }
}

/**
 * Logical tier disclosed by the projection.
 *
 * Free, Plus, Premium, and Family are the complete catalog version 1 plan set.
 * [UNKNOWN] means the server named a tier this build does not understand.
 *
 * This type intentionally offers **no** conversion into the legacy
 * [FeatureGate] matrix. That matrix gates data export, full history, and
 * account count, which catalog version 1 states are never paid entitlements,
 * so bridging the two would let the minimized contract silently withdraw a
 * guaranteed capability.
 */
@Serializable(with = EntitlementTierSerializer::class)
enum class EntitlementTier(val wireValue: String) {
    FREE("free"),
    PLUS("plus"),
    PREMIUM("premium"),
    FAMILY("family"),
    UNKNOWN("");

    /** Catalog rank. [UNKNOWN] ranks below Free so it can never win a comparison. */
    val rank: Int
        get() = when (this) {
            UNKNOWN -> -1
            FREE -> 0
            PLUS -> 1
            PREMIUM -> 2
            FAMILY -> 3
        }
}

internal object EntitlementTierSerializer : WireEnumSerializer<EntitlementTier>(
    "com.finance.core.entitlement.EntitlementTier",
    EntitlementTier.entries,
    { it.wireValue },
    EntitlementTier.UNKNOWN,
)

/** Subject the effective tier is derived from. */
@Serializable(with = EntitlementScopeSerializer::class)
enum class EntitlementScope(val wireValue: String) {
    /** The authenticated purchaser's own grant produces the effective tier. */
    USER("user"),

    /** A household grant the caller is an active member of produces it. */
    HOUSEHOLD("household"),

    UNKNOWN("");
}

internal object EntitlementScopeSerializer : WireEnumSerializer<EntitlementScope>(
    "com.finance.core.entitlement.EntitlementScope",
    EntitlementScope.entries,
    { it.wireValue },
    EntitlementScope.UNKNOWN,
)

/** Lifecycle-derived access state the server resolved at [EntitlementValidity.serverTime]. */
@Serializable(with = EntitlementAccessStateSerializer::class)
enum class EntitlementAccessState(val wireValue: String) {
    /** A verified paid grant was in effect at server time. */
    GRANTED("granted"),

    /** Free applies; there is no current verified paid grant. */
    NOT_ENTITLED("not_entitled"),

    /** The server-issued validity bound has already passed. Non-authorizing. */
    LAPSED("lapsed"),

    UNKNOWN("");
}

internal object EntitlementAccessStateSerializer : WireEnumSerializer<EntitlementAccessState>(
    "com.finance.core.entitlement.EntitlementAccessState",
    EntitlementAccessState.entries,
    { it.wireValue },
    EntitlementAccessState.UNKNOWN,
)

/**
 * The complete normalized provider lifecycle vocabulary ratified by ADR-0027
 * and the subscription entitlement catalog.
 *
 * Contract version 1 never populates it — the minimized projection
 * intentionally does not distinguish [TRIALING] from [ACTIVE] from
 * [CANCELLED_PAID_THROUGH] — but the vocabulary is modelled here so a future
 * contract version does not require a breaking client change.
 */
@Serializable(with = EntitlementLifecycleSerializer::class)
enum class EntitlementLifecycle(val wireValue: String) {
    /** Granted through the provider-authenticated trial end. */
    TRIALING("trialing"),

    /** Granted through the trusted current period. */
    ACTIVE("active"),

    /** Granted through the already paid period after cancellation. */
    CANCELLED_PAID_THROUGH("cancelled_paid_through"),

    /** Granted only through provider-authenticated grace. */
    PAST_DUE_GRACE("past_due_grace"),

    /** Granted through paid-through time, then suspended. */
    PAUSED_PAID_THROUGH("paused_paid_through"),

    /** Revoked at the trusted expiry. */
    EXPIRED("expired"),

    /** Revoked at the trusted refund effective time. */
    REFUNDED("refunded"),

    /** Revoked at the trusted dispute effective time. */
    CHARGEBACK("chargeback"),

    UNKNOWN("");

    /**
     * The catalog access rule for this lifecycle: whether it can bear access
     * at all through its provider-authenticated bound.
     *
     * This is catalog documentation, not an authorization decision. Only the
     * server projection authorizes, and only [EntitlementAccessState] reports
     * what it resolved.
     */
    val isAccessBearing: Boolean
        get() = when (this) {
            TRIALING, ACTIVE, CANCELLED_PAID_THROUGH, PAST_DUE_GRACE, PAUSED_PAID_THROUGH -> true
            EXPIRED, REFUNDED, CHARGEBACK, UNKNOWN -> false
        }
}

internal object EntitlementLifecycleSerializer : WireEnumSerializer<EntitlementLifecycle>(
    "com.finance.core.entitlement.EntitlementLifecycle",
    EntitlementLifecycle.entries,
    { it.wireValue },
    EntitlementLifecycle.UNKNOWN,
)

/** Catalog constants for bank-connection capacity, catalog version 1. */
object EntitlementCatalog {
    /** Catalog version these constants come from. */
    const val VERSION: Int = ENTITLEMENT_CATALOG_VERSION

    /** Bank connections included in a household tier before verified add-ons. */
    fun baseBankConnectionAllowance(tier: EntitlementTier?): Long = when (tier) {
        EntitlementTier.PREMIUM -> 2L
        EntitlementTier.FAMILY -> 4L
        EntitlementTier.FREE, EntitlementTier.PLUS, EntitlementTier.UNKNOWN, null -> 0L
    }
}

/** Bank-connection capacity for the resolved household scope. */
@Serializable
data class BankConnectionAllowance(
    /** Authoritative total connections the household may hold. */
    val allowance: Long,
    /** Catalog base for the effective household tier. */
    @SerialName("base_allowance") val baseAllowance: Long,
    /** Allowance above the catalog base, i.e. verified add-on capacity. */
    @SerialName("addon_allowance") val addonAllowance: Long,
)

/**
 * Whether a reduction boundary is known.
 *
 * A "reduction" is the effective tier and/or the bank-connection allowance
 * falling — Plus lapsing to Free counts just as a Family allowance falling to
 * a Premium one does.
 *
 * The minimized projection collapses the purchaser bound and the household
 * bound into the earliest of the two, so the bound only provably governs the
 * reduction when a single grant contributes.
 */
@Serializable(with = DowngradeStatusSerializer::class)
enum class DowngradeStatus(val wireValue: String) {
    /** The effective tier is already Free, or access is not granted. */
    NONE("none"),

    /** Exactly one paid grant contributes, so the bound governs the reduction. */
    SCHEDULED("scheduled"),

    /**
     * A purchaser grant and a household grant both contribute. The collapsed
     * bound may belong to the one that determines neither the effective tier
     * nor the allowance — Plus lapsing tomorrow under a Family household that
     * survives for a month — so no reduction instant is claimed and the client
     * refreshes at [EntitlementValidity.refreshAfter] instead.
     */
    UNDETERMINED("undetermined"),

    UNKNOWN(""),
}

internal object DowngradeStatusSerializer : WireEnumSerializer<DowngradeStatus>(
    "com.finance.core.entitlement.DowngradeStatus",
    DowngradeStatus.entries,
    { it.wireValue },
    DowngradeStatus.UNKNOWN,
)

/** Server-issued bounds. Clients never substitute their own clock. */
@Serializable
data class EntitlementValidity(
    @SerialName("effective_at") val effectiveAt: Instant,
    /**
     * The earliest instant at which any grant contributing to this response
     * lapses, so the response is guaranteed accurate only through it.
     *
     * This is a **refresh deadline, not an authority claim**. Past it the
     * snapshot may be stale in either direction, so a client re-reads rather
     * than inferring anything. The authoritative reduction boundary, when the
     * projection can prove one, is [PendingDowngrade.effectiveAt].
     */
    @SerialName("refresh_after") val refreshAfter: Instant? = null,
    @SerialName("server_time") val serverTime: Instant,
    @SerialName("projection_version") val projectionVersion: Long,
)

/** Reduction that takes effect when the governing grant lapses unrenewed. */
@Serializable
data class PendingDowngrade(
    val status: DowngradeStatus,
    /**
     * The authoritative instant the effective tier and allowance reduce,
     * present only when [status] is [DowngradeStatus.SCHEDULED]. It is also
     * the only bound a client may treat as display validity.
     *
     * The contract states no post-boundary tier or allowance: an expiring
     * add-on leaves the Premium base in place, so any inferred value would be
     * wrong. Clients re-read the projection at or after this instant.
     */
    @SerialName("effective_at") val effectiveAt: Instant? = null,
)

/** The complete minimized entitlement the server discloses. */
@Serializable
data class MinimizedEntitlement(
    val scope: EntitlementScope,
    val tier: EntitlementTier,
    @SerialName("user_tier") val userTier: EntitlementTier,
    @SerialName("household_tier") val householdTier: EntitlementTier? = null,
    @SerialName("access_state") val accessState: EntitlementAccessState,
    /** Reserved; contract version 1 never populates it. Never authorizes. */
    val lifecycle: EntitlementLifecycle? = null,
    @SerialName("is_premium_sponsor") val isPremiumSponsor: Boolean,
    @SerialName("is_family_bound") val isFamilyBound: Boolean,
    @SerialName("bank_connections") val bankConnections: BankConnectionAllowance,
    val validity: EntitlementValidity,
    val downgrade: PendingDowngrade,
)

/** Versioned response envelope returned by `entitlements-v1`. */
@Serializable
data class EntitlementEnvelope(
    @SerialName("contract_version") val contractVersion: Int,
    @SerialName("catalog_version") val catalogVersion: Int,
    val entitlement: MinimizedEntitlement,
)

/**
 * Decodes and self-checks a minimized entitlement payload.
 *
 * Decoding succeeds only for a payload this build fully understands. Unknown
 * enum values, an unsupported contract version, and any response that
 * contradicts the ratified catalog are rejected, because a response a client
 * cannot fully interpret must not be shown as an entitlement.
 */
object MinimizedEntitlementCodec {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = false
        encodeDefaults = true
    }

    /** Decode a raw `entitlements-v1` body. */
    fun decode(payload: String): EntitlementResult {
        val envelope = try {
            json.decodeFromString(EntitlementEnvelope.serializer(), payload)
        } catch (_: IllegalArgumentException) {
            return EntitlementResult.Unavailable(EntitlementUnavailableReason.MALFORMED)
        }
        return validate(envelope)
    }

    /** Serialize an envelope. Used by tests and by cache persistence. */
    fun encode(envelope: EntitlementEnvelope): String =
        json.encodeToString(EntitlementEnvelope.serializer(), envelope)

    /** Re-check a decoded envelope against the contract and the catalog. */
    fun validate(envelope: EntitlementEnvelope): EntitlementResult {
        if (envelope.contractVersion != ENTITLEMENT_CONTRACT_VERSION) {
            return EntitlementResult.Unavailable(
                EntitlementUnavailableReason.UNSUPPORTED_CONTRACT_VERSION,
            )
        }
        // The checks below enforce catalog version 1 semantics — fixed
        // per-tier capacity and Premium-only add-ons — so a projection
        // derived from a later catalog must not be interpreted with them.
        if (envelope.catalogVersion != ENTITLEMENT_CATALOG_VERSION) {
            return EntitlementResult.Unavailable(
                EntitlementUnavailableReason.UNSUPPORTED_CATALOG_VERSION,
            )
        }
        val entitlement = envelope.entitlement
        val malformed = EntitlementResult.Unavailable(EntitlementUnavailableReason.MALFORMED)

        if (entitlement.scope == EntitlementScope.UNKNOWN) return malformed
        if (entitlement.tier == EntitlementTier.UNKNOWN) return malformed
        if (entitlement.userTier == EntitlementTier.UNKNOWN) return malformed
        if (entitlement.householdTier == EntitlementTier.UNKNOWN) return malformed
        if (entitlement.accessState == EntitlementAccessState.UNKNOWN) return malformed
        if (entitlement.lifecycle == EntitlementLifecycle.UNKNOWN) return malformed
        if (entitlement.downgrade.status == DowngradeStatus.UNKNOWN) return malformed

        if (!isConsistentScope(entitlement)) return malformed
        if (!isConsistentAllowance(entitlement)) return malformed
        if (!isConsistentValidity(entitlement)) return malformed
        if (!isConsistentDowngrade(entitlement)) return malformed

        return EntitlementResult.Available(envelope)
    }

    private fun isConsistentScope(entitlement: MinimizedEntitlement): Boolean {
        // Catalog version 1: the purchaser never holds Family directly, and a
        // household is never Plus.
        if (entitlement.userTier == EntitlementTier.FAMILY) return false
        if (entitlement.householdTier == EntitlementTier.PLUS) return false
        val household = entitlement.householdTier ?: EntitlementTier.FREE
        val expectedTier =
            if (household.rank > entitlement.userTier.rank) household else entitlement.userTier
        val expectedScope =
            if (household.rank > entitlement.userTier.rank) {
                EntitlementScope.HOUSEHOLD
            } else {
                EntitlementScope.USER
            }
        if (entitlement.tier != expectedTier || entitlement.scope != expectedScope) return false
        // Sponsorship and Family binding are household facts.
        val householdScoped = entitlement.householdTier != null
        if (!householdScoped && (entitlement.isPremiumSponsor || entitlement.isFamilyBound)) {
            return false
        }
        return true
    }

    private fun isConsistentAllowance(entitlement: MinimizedEntitlement): Boolean {
        val bank = entitlement.bankConnections
        if (bank.allowance < 0 || bank.baseAllowance < 0 || bank.addonAllowance < 0) return false
        val householdTier = entitlement.householdTier
        // Catalog version 1 fixes each household tier's capacity exactly: Free
        // carries none, Family carries four, and only Premium accrues verified
        // add-ons above its base of two.
        if (householdTier == null || householdTier == EntitlementTier.FREE) {
            return bank.allowance == 0L && bank.baseAllowance == 0L && bank.addonAllowance == 0L
        }
        val base = EntitlementCatalog.baseBankConnectionAllowance(householdTier)
        if (bank.baseAllowance != base) return false
        if (householdTier == EntitlementTier.FAMILY) {
            return bank.allowance == base && bank.addonAllowance == 0L
        }
        if (bank.allowance < base) return false
        return bank.addonAllowance == bank.allowance - bank.baseAllowance
    }

    private fun isConsistentValidity(entitlement: MinimizedEntitlement): Boolean {
        if (entitlement.validity.projectionVersion < 1) return false
        val refreshAfter = entitlement.validity.refreshAfter
        return when (entitlement.accessState) {
            // Free carries no paid grant and therefore no trusted bound.
            EntitlementAccessState.NOT_ENTITLED ->
                entitlement.tier == EntitlementTier.FREE && refreshAfter == null

            // The server itself must have resolved the grant as still valid.
            EntitlementAccessState.GRANTED ->
                entitlement.tier != EntitlementTier.FREE &&
                    refreshAfter != null &&
                    refreshAfter > entitlement.validity.serverTime

            EntitlementAccessState.LAPSED ->
                entitlement.tier != EntitlementTier.FREE &&
                    refreshAfter != null &&
                    refreshAfter <= entitlement.validity.serverTime

            EntitlementAccessState.UNKNOWN -> false
        }
    }

    private fun isConsistentDowngrade(entitlement: MinimizedEntitlement): Boolean {
        val downgrade = entitlement.downgrade
        val granted = entitlement.accessState == EntitlementAccessState.GRANTED
        // The bound provably governs the reduction only when a single grant
        // contributes. A purchaser grant alongside a household grant collapses
        // to the earlier of the two, which may belong to the one that
        // determines neither the effective tier nor the allowance.
        val householdTier = entitlement.householdTier
        val contributingGrants =
            (if (entitlement.userTier == EntitlementTier.FREE) 0 else 1) +
                (if (householdTier == null || householdTier == EntitlementTier.FREE) 0 else 1)
        val boundIsProvable = contributingGrants <= 1
        return when (downgrade.status) {
            DowngradeStatus.NONE -> !granted && downgrade.effectiveAt == null

            DowngradeStatus.SCHEDULED ->
                granted &&
                    boundIsProvable &&
                    downgrade.effectiveAt != null &&
                    downgrade.effectiveAt == entitlement.validity.refreshAfter

            DowngradeStatus.UNDETERMINED ->
                granted && !boundIsProvable && downgrade.effectiveAt == null

            DowngradeStatus.UNKNOWN -> false
        }
    }
}
