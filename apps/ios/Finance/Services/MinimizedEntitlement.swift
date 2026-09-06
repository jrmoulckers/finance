// SPDX-License-Identifier: BUSL-1.1

// MinimizedEntitlement.swift
// Finance
//
// Swift consumption of the shared minimized entitlement contract
// (`entitlements-v1`, #4403). The canonical contract lives in
// `packages/core/src/commonMain/kotlin/com/finance/core/entitlement`; this
// file mirrors it one-to-one for the SwiftUI app, which does not yet consume
// the KMP module through the staged Swift Export bridge.
//
// The Finance PostgreSQL ledger and its derived projection are the only
// runtime authorization authority (ADR-0027). Nothing here makes an access
// decision, carries provider evidence, or substitutes for a server check.
//
// References: #4403

import Foundation

/// Wire contract version this client understands.
let entitlementContractVersion = 1

/// Commercial catalog version this client was built against.
let entitlementCatalogVersion = 1

// MARK: - Wire vocabulary

/// Logical tier disclosed by the projection.
///
/// A value this build does not understand decodes to ``unknown`` and is then
/// rejected, so an unrecognized entitlement grants nothing.
enum EntitlementTier: String, Sendable, Equatable, Codable, CaseIterable {
    case free
    case plus
    case premium
    case family
    case unknown = ""

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EntitlementTier(rawValue: raw) ?? .unknown
    }

    /// Catalog rank. ``unknown`` ranks below Free so it never wins a comparison.
    var rank: Int {
        switch self {
        case .unknown: -1
        case .free: 0
        case .plus: 1
        case .premium: 2
        case .family: 3
        }
    }
}

/// Subject the effective tier is derived from.
enum EntitlementScope: String, Sendable, Equatable, Codable {
    case user
    case household
    case unknown = ""

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EntitlementScope(rawValue: raw) ?? .unknown
    }
}

/// Lifecycle-derived access state resolved at the server's own time.
enum EntitlementAccessState: String, Sendable, Equatable, Codable {
    case granted
    case notEntitled = "not_entitled"
    case lapsed
    case unknown = ""

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EntitlementAccessState(rawValue: raw) ?? .unknown
    }
}

/// The normalized provider lifecycle vocabulary ratified by ADR-0027.
///
/// Contract version 1 never populates it; it is modelled so a later contract
/// version does not require a breaking client change.
enum EntitlementLifecycle: String, Sendable, Equatable, Codable {
    case trialing
    case active
    case cancelledPaidThrough = "cancelled_paid_through"
    case pastDueGrace = "past_due_grace"
    case pausedPaidThrough = "paused_paid_through"
    case expired
    case refunded
    case chargeback
    case unknown = ""

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = EntitlementLifecycle(rawValue: raw) ?? .unknown
    }

    /// Catalog documentation only. Never an authorization decision.
    var isAccessBearing: Bool {
        switch self {
        case .trialing, .active, .cancelledPaidThrough, .pastDueGrace, .pausedPaidThrough:
            true
        case .expired, .refunded, .chargeback, .unknown:
            false
        }
    }
}

/// Whether a reduction boundary is known.
enum DowngradeStatus: String, Sendable, Equatable, Codable {
    /// The effective tier is already Free, or access is not granted.
    case none
    /// Exactly one paid grant contributes, so the bound governs the reduction.
    case scheduled
    /// Two grants contribute, so no reduction instant is claimed.
    case undetermined
    case unknown = ""

    init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = DowngradeStatus(rawValue: raw) ?? .unknown
    }
}

// MARK: - Payload

/// Bank-connection capacity for the resolved household scope.
struct BankConnectionAllowance: Sendable, Equatable, Codable {
    let allowance: Int64
    let baseAllowance: Int64
    let addonAllowance: Int64

    enum CodingKeys: String, CodingKey {
        case allowance
        case baseAllowance = "base_allowance"
        case addonAllowance = "addon_allowance"
    }
}

/// Server-issued bounds. Clients never substitute their own clock.
struct EntitlementValidity: Sendable, Equatable, Codable {
    let effectiveAt: Date
    /// Refresh deadline, **not** an authority claim. Past it the snapshot may
    /// be stale in either direction, so the client re-reads.
    let refreshAfter: Date?
    let serverTime: Date
    let projectionVersion: Int64

    enum CodingKeys: String, CodingKey {
        case effectiveAt = "effective_at"
        case refreshAfter = "refresh_after"
        case serverTime = "server_time"
        case projectionVersion = "projection_version"
    }
}

/// Reduction that takes effect when the governing grant lapses unrenewed.
struct PendingDowngrade: Sendable, Equatable, Codable {
    let status: DowngradeStatus
    /// The authoritative reduction instant, present only when `scheduled`.
    let effectiveAt: Date?

    enum CodingKeys: String, CodingKey {
        case status
        case effectiveAt = "effective_at"
    }
}

/// The complete minimized entitlement the server discloses.
struct MinimizedEntitlement: Sendable, Equatable, Codable {
    let scope: EntitlementScope
    let tier: EntitlementTier
    let userTier: EntitlementTier
    let householdTier: EntitlementTier?
    let accessState: EntitlementAccessState
    /// Reserved; contract version 1 never populates it. Never authorizes.
    let lifecycle: EntitlementLifecycle?
    let isPremiumSponsor: Bool
    let isFamilyBound: Bool
    let bankConnections: BankConnectionAllowance
    let validity: EntitlementValidity
    let downgrade: PendingDowngrade

    enum CodingKeys: String, CodingKey {
        case scope
        case tier
        case userTier = "user_tier"
        case householdTier = "household_tier"
        case accessState = "access_state"
        case lifecycle
        case isPremiumSponsor = "is_premium_sponsor"
        case isFamilyBound = "is_family_bound"
        case bankConnections = "bank_connections"
        case validity
        case downgrade
    }
}

/// Versioned response envelope returned by `entitlements-v1`.
struct EntitlementEnvelope: Sendable, Equatable, Codable {
    let contractVersion: Int
    let catalogVersion: Int
    let entitlement: MinimizedEntitlement

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case catalogVersion = "catalog_version"
        case entitlement
    }
}

/// Catalog constants for bank-connection capacity, catalog version 1.
enum EntitlementCatalog {
    static let version = entitlementCatalogVersion

    /// Bank connections included in a household tier before verified add-ons.
    static func baseBankConnectionAllowance(_ tier: EntitlementTier?) -> Int64 {
        switch tier {
        case .premium: 2
        case .family: 4
        case .free, .plus, .unknown, .none: 0
        }
    }
}

// MARK: - Codec

/// Decodes and self-checks a minimized entitlement payload.
///
/// Decoding succeeds only for a payload this build fully understands. Unknown
/// enum values, an unsupported contract or catalog version, and any response
/// that contradicts the ratified catalog are rejected, because a response a
/// client cannot fully interpret must not be shown as an entitlement.
enum MinimizedEntitlementCodec {

    static func decode(_ payload: Data) -> EntitlementResult {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { instantDecoder in
            let raw = try instantDecoder.singleValueContainer().decode(String.self)
            guard let date = Self.parseInstant(raw) else {
                throw DecodingError.dataCorrupted(
                    .init(
                        codingPath: instantDecoder.codingPath,
                        debugDescription: "invalid instant"
                    )
                )
            }
            return date
        }
        guard let envelope = try? decoder.decode(EntitlementEnvelope.self, from: payload) else {
            return .unavailable(.malformed)
        }
        return validate(envelope)
    }

    /// ISO-8601 instant format used on the wire and in the display cache.
    static var instantFormat: Date.ISO8601FormatStyle {
        Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    }

    /// Serialize an envelope. Used by tests and by display-cache persistence.
    static func encode(_ envelope: EntitlementEnvelope) -> Data? {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, instantEncoder in
            var container = instantEncoder.singleValueContainer()
            try container.encode(Self.instantFormat.format(date))
        }
        return try? encoder.encode(envelope)
    }

    /// Re-check a decoded envelope against the contract and the catalog.
    static func validate(_ envelope: EntitlementEnvelope) -> EntitlementResult {
        guard envelope.contractVersion == entitlementContractVersion else {
            return .unavailable(.unsupportedContractVersion)
        }
        // The checks below enforce catalog version 1 semantics, so a
        // projection derived from a later catalog must not use them.
        guard envelope.catalogVersion == entitlementCatalogVersion else {
            return .unavailable(.unsupportedCatalogVersion)
        }
        let entitlement = envelope.entitlement
        guard entitlement.scope != .unknown,
              entitlement.tier != .unknown,
              entitlement.userTier != .unknown,
              entitlement.householdTier != .unknown,
              entitlement.accessState != .unknown,
              entitlement.lifecycle != .unknown,
              entitlement.downgrade.status != .unknown,
              isConsistentScope(entitlement),
              isConsistentAllowance(entitlement),
              isConsistentValidity(entitlement),
              isConsistentDowngrade(entitlement)
        else {
            return .unavailable(.malformed)
        }
        return .available(envelope)
    }

    private static func isConsistentScope(_ entitlement: MinimizedEntitlement) -> Bool {
        // Catalog version 1: the purchaser never holds Family directly, and a
        // household is never Plus.
        guard entitlement.userTier != .family, entitlement.householdTier != .plus else {
            return false
        }
        let household = entitlement.householdTier ?? .free
        let householdWins = household.rank > entitlement.userTier.rank
        let expectedTier = householdWins ? household : entitlement.userTier
        let expectedScope: EntitlementScope = householdWins ? .household : .user
        guard entitlement.tier == expectedTier, entitlement.scope == expectedScope else {
            return false
        }
        // Sponsorship and Family binding are household facts.
        if entitlement.householdTier == nil,
           entitlement.isPremiumSponsor || entitlement.isFamilyBound {
            return false
        }
        return true
    }

    private static func isConsistentAllowance(_ entitlement: MinimizedEntitlement) -> Bool {
        let bank = entitlement.bankConnections
        guard bank.allowance >= 0, bank.baseAllowance >= 0, bank.addonAllowance >= 0 else {
            return false
        }
        guard let householdTier = entitlement.householdTier, householdTier != .free else {
            return bank.allowance == 0 && bank.baseAllowance == 0 && bank.addonAllowance == 0
        }
        let base = EntitlementCatalog.baseBankConnectionAllowance(householdTier)
        guard bank.baseAllowance == base else { return false }
        if householdTier == .family {
            return bank.allowance == base && bank.addonAllowance == 0
        }
        guard bank.allowance >= base else { return false }
        return bank.addonAllowance == bank.allowance - bank.baseAllowance
    }

    private static func isConsistentValidity(_ entitlement: MinimizedEntitlement) -> Bool {
        guard entitlement.validity.projectionVersion >= 1 else { return false }
        let refreshAfter = entitlement.validity.refreshAfter
        switch entitlement.accessState {
        case .notEntitled:
            // Free carries no paid grant and therefore no trusted bound.
            return entitlement.tier == .free && refreshAfter == nil
        case .granted:
            // The server itself must have resolved the grant as still valid.
            guard let refreshAfter, entitlement.tier != .free else { return false }
            return refreshAfter > entitlement.validity.serverTime
        case .lapsed:
            guard let refreshAfter, entitlement.tier != .free else { return false }
            return refreshAfter <= entitlement.validity.serverTime
        case .unknown:
            return false
        }
    }

    private static func isConsistentDowngrade(_ entitlement: MinimizedEntitlement) -> Bool {
        let downgrade = entitlement.downgrade
        let granted = entitlement.accessState == .granted
        // The bound provably governs the reduction only when a single grant
        // contributes.
        let householdTier = entitlement.householdTier
        let contributingGrants =
            (entitlement.userTier == .free ? 0 : 1) +
            ((householdTier == nil || householdTier == .free) ? 0 : 1)
        let boundIsProvable = contributingGrants <= 1
        switch downgrade.status {
        case .none:
            return !granted && downgrade.effectiveAt == nil
        case .scheduled:
            guard granted, boundIsProvable, let effectiveAt = downgrade.effectiveAt else {
                return false
            }
            return effectiveAt == entitlement.validity.refreshAfter
        case .undetermined:
            return granted && !boundIsProvable && downgrade.effectiveAt == nil
        case .unknown:
            return false
        }
    }

    static func parseInstant(_ value: String) -> Date? {
        if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(value) {
            return date
        }
        return try? Date.ISO8601FormatStyle().parse(value)
    }
}

// MARK: - Display policy

/// Bounded display rules for a previously fetched envelope.
///
/// Two different bounds matter and must not be confused:
///
/// - `validity.refreshAfter` is a **refresh deadline**: the collapsed earliest
///   bound of every contributing grant, so crossing it means the snapshot may
///   be stale in either direction — never that the entitlement ended.
/// - `downgrade.effectiveAt` is the **proven reduction boundary**, present
///   only when a single grant contributes. It is the only instant at which
///   display may fall back to Free.
///
/// None of this authorizes anything. Manual entry, import, export, account
/// deletion, privacy and security controls, accessibility, and access to
/// existing financial data are never paid entitlements and are unaffected.
enum EntitlementDisplayPolicy {

    /// Whether a cached envelope may still drive paid-tier presentation.
    static func isDisplayable(_ envelope: EntitlementEnvelope, at now: Date) -> Bool {
        guard case .available = MinimizedEntitlementCodec.validate(envelope) else { return false }
        let entitlement = envelope.entitlement
        guard entitlement.accessState == .granted else { return false }
        guard let provenBoundary = entitlement.downgrade.effectiveAt else { return true }
        return now < provenBoundary
    }

    /// Tier to display; Free once a *proven* reduction boundary has passed.
    static func displayTier(_ envelope: EntitlementEnvelope, at now: Date) -> EntitlementTier {
        isDisplayable(envelope, at: now) ? envelope.entitlement.tier : .free
    }

    /// The instant after which a cached snapshot must be re-read.
    static func refreshAfter(_ envelope: EntitlementEnvelope) -> Date? {
        envelope.entitlement.validity.refreshAfter
    }

    /// Whether a cached snapshot is past its server-issued bound.
    static func needsRefresh(_ envelope: EntitlementEnvelope, at now: Date) -> Bool {
        guard let bound = refreshAfter(envelope) else { return false }
        return now >= bound
    }

    /// Bank-connection capacity to display; zero past a proven boundary.
    static func displayBankConnectionAllowance(
        _ envelope: EntitlementEnvelope,
        at now: Date
    ) -> Int64 {
        isDisplayable(envelope, at: now) ? envelope.entitlement.bankConnections.allowance : 0
    }
}
