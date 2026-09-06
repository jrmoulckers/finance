// SPDX-License-Identifier: BUSL-1.1

// EntitlementStore.swift
// Finance
//
// Display-only entitlement presentation for the SwiftUI app (#4403).
//
// The store reads the shared minimized contract through
// ``EntitlementRepository``, keeps one cached snapshot bounded by the
// server-issued `validity.refresh_after`, and drops to Free presentation at
// the server-proved `downgrade.effective_at`. StoreKit state, product
// identifiers, tier ordinals, feature flags, confirmation echoes, and the
// device clock are never an authority here: every cost-incurring server
// action re-reads the projection server-side.
//
// References: #4403

import Foundation
import Observation
import os

/// How much confidence the UI may express about what it is showing.
enum EntitlementDisplayStatus: String, Sendable, Equatable, CaseIterable {
    /// No answer yet in this session. Show progress, never a tier claim.
    case pending
    /// A server-confirmed snapshot inside its server-issued refresh bound.
    case current
    /// The server was reachable but unusable, or the snapshot needs a re-read.
    case stale
    /// No connectivity, and the cached snapshot is still inside its bounds.
    case offlineValid
    /// No connectivity, and the snapshot passed a server-issued bound.
    case offlineRefreshNeeded
    /// Nothing usable to display. The UI falls back to Free presentation.
    case unavailable
}

/// Display-only entitlement presentation derived from the shared contract.
///
/// Manual entry, import, export, account deletion, privacy and security
/// controls, accessibility, and access to existing financial data are never
/// paid entitlements and are never gated by any value here.
struct EntitlementDisplayState: Sendable, Equatable {
    var status: EntitlementDisplayStatus = .pending
    /// Tier to present. Free whenever nothing better has been proven.
    var tier: EntitlementTier = .free
    /// Bank-connection capacity to present. Zero unless proven.
    var bankConnectionAllowance: Int64 = 0
    /// Server-issued refresh deadline, when the response carried one.
    var refreshAfter: Date?
    /// Server-proved reduction boundary, present only when proven.
    var downgradeAt: Date?
    /// Why nothing better can be shown, for the accessible explanation.
    var unavailableReason: EntitlementUnavailableReason?

    static let pending = EntitlementDisplayState()

    var isPending: Bool { status == .pending }

    /// Whether a refresh is worth attempting when connectivity allows.
    var needsRefresh: Bool {
        switch status {
        case .stale, .offlineRefreshNeeded, .unavailable: true
        case .pending, .current, .offlineValid: false
        }
    }

    /// Resolve what to display from a repository answer and the cached snapshot.
    ///
    /// `now` is used only to honour bounds the **server** issued. It never
    /// extends access and never authorizes.
    static func resolve(
        result: EntitlementResult,
        cached: EntitlementEnvelope?,
        now: Date
    ) -> EntitlementDisplayState {
        switch result {
        case .available(let envelope):
            return snapshot(
                envelope,
                now: now,
                status: EntitlementDisplayPolicy.needsRefresh(envelope, at: now)
                    ? .stale
                    : .current
            )
        case .unavailable(let reason):
            return degraded(reason: reason, cached: cached, now: now)
        }
    }

    private static func degraded(
        reason: EntitlementUnavailableReason,
        cached: EntitlementEnvelope?,
        now: Date
    ) -> EntitlementDisplayState {
        // An identity or membership denial disproves the cached subject, so
        // its snapshot must not keep displaying.
        let identityDenied = reason == .unauthenticated || reason == .forbidden
        guard let usable = cached, !identityDenied else { return unavailable(reason) }

        let offline = reason == .offline
        // `isDisplayable` is false once the server-proved reduction boundary
        // passed, or when the snapshot never bore access at all.
        let displayable = EntitlementDisplayPolicy.isDisplayable(usable, at: now)
        let needsRefresh = EntitlementDisplayPolicy.needsRefresh(usable, at: now)

        let status: EntitlementDisplayStatus
        if !offline {
            // Reachable server, unusable answer: the snapshot is not
            // disproven, so it keeps displaying and is flagged as stale.
            guard displayable else { return unavailable(reason) }
            status = .stale
        } else if displayable, !needsRefresh {
            status = .offlineValid
        } else {
            status = .offlineRefreshNeeded
        }
        return snapshot(usable, now: now, status: status, reason: reason)
    }

    private static func snapshot(
        _ envelope: EntitlementEnvelope,
        now: Date,
        status: EntitlementDisplayStatus,
        reason: EntitlementUnavailableReason? = nil
    ) -> EntitlementDisplayState {
        EntitlementDisplayState(
            status: status,
            tier: EntitlementDisplayPolicy.displayTier(envelope, at: now),
            bankConnectionAllowance: EntitlementDisplayPolicy.displayBankConnectionAllowance(
                envelope,
                at: now
            ),
            refreshAfter: EntitlementDisplayPolicy.refreshAfter(envelope),
            downgradeAt: envelope.entitlement.downgrade.effectiveAt,
            unavailableReason: reason
        )
    }

    private static func unavailable(
        _ reason: EntitlementUnavailableReason
    ) -> EntitlementDisplayState {
        EntitlementDisplayState(status: .unavailable, tier: .free, unavailableReason: reason)
    }
}

// MARK: - Display cache

/// A previously fetched minimized entitlement, kept only so the UI stays
/// coherent while a fresh read is impossible.
///
/// The cache is display-only, is bounded by the server-issued refresh deadline
/// and proven reduction boundary, and is never consulted by the server.
struct CachedEntitlementSnapshot: Sendable, Equatable, CustomStringConvertible {
    /// The authenticated Finance user the snapshot belongs to.
    let userScope: String
    /// The household the snapshot was read for, so it can never be shown for
    /// a different subject.
    let householdScope: UUID?
    /// The verbatim envelope, re-validated by the shared codec on every read.
    let payload: Data

    var description: String { "CachedEntitlementSnapshot(redacted)" }
}

protocol EntitlementSnapshotStoring: Sendable {
    func read() async -> CachedEntitlementSnapshot?
    func write(_ snapshot: CachedEntitlementSnapshot) async
    func clear() async
}

/// Process-lifetime store used by tests and by unconfigured builds.
actor InMemoryEntitlementSnapshotStore: EntitlementSnapshotStoring {
    private var snapshot: CachedEntitlementSnapshot?

    init(snapshot: CachedEntitlementSnapshot? = nil) {
        self.snapshot = snapshot
    }

    func read() -> CachedEntitlementSnapshot? { snapshot }

    func write(_ snapshot: CachedEntitlementSnapshot) { self.snapshot = snapshot }

    func clear() { snapshot = nil }
}

/// Snapshot store in the app's own sandboxed defaults.
///
/// The minimized projection carries no financial value and no provider or
/// ledger identifier, so app-sandbox storage protected by iOS data protection
/// matches its sensitivity. Nothing here is written to a log.
actor UserDefaultsEntitlementSnapshotStore: EntitlementSnapshotStoring {
    static let payloadKey = "com.finance.entitlement.snapshot.v1"
    static let userScopeKey = "com.finance.entitlement.snapshot.user"
    static let scopeKey = "com.finance.entitlement.snapshot.scope"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func read() -> CachedEntitlementSnapshot? {
        guard let payload = defaults.data(forKey: Self.payloadKey),
              let userScope = defaults.string(forKey: Self.userScopeKey)
        else {
            return nil
        }
        let scope = defaults.string(forKey: Self.scopeKey).flatMap(UUID.init(uuidString:))
        return CachedEntitlementSnapshot(
            userScope: userScope,
            householdScope: scope,
            payload: payload
        )
    }

    func write(_ snapshot: CachedEntitlementSnapshot) {
        defaults.set(snapshot.payload, forKey: Self.payloadKey)
        defaults.set(snapshot.userScope, forKey: Self.userScopeKey)
        defaults.set(snapshot.householdScope?.uuidString, forKey: Self.scopeKey)
    }

    func clear() {
        defaults.removeObject(forKey: Self.payloadKey)
        defaults.removeObject(forKey: Self.userScopeKey)
        defaults.removeObject(forKey: Self.scopeKey)
    }
}

// MARK: - Store

/// Single source of entitlement display state for the iOS app.
@MainActor
@Observable
final class EntitlementStore {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "EntitlementStore"
    )

    /// Display-only entitlement presentation. Never an authorization input.
    private(set) var state: EntitlementDisplayState = .pending

    @ObservationIgnored private let repository: any EntitlementRepository
    @ObservationIgnored private let snapshotStore: any EntitlementSnapshotStoring
    @ObservationIgnored private let householdProvider: any EligibleHouseholdProviding
    @ObservationIgnored private let userScopeProvider: any EntitlementUserScopeProviding
    @ObservationIgnored private let now: @Sendable () -> Date
    @ObservationIgnored private var cached: EntitlementEnvelope?
    @ObservationIgnored private var cachedUserScope: String?
    @ObservationIgnored private var cachedScope: UUID?
    @ObservationIgnored private var operations: UInt64 = 0
    @ObservationIgnored private var appliedOperation: UInt64 = 0
    @ObservationIgnored private var boundaryRefreshTask: Task<Void, Never>?

    init(
        repository: any EntitlementRepository,
        snapshotStore: any EntitlementSnapshotStoring = InMemoryEntitlementSnapshotStore(),
        householdProvider: any EligibleHouseholdProviding = NoEligibleHouseholdProvider(),
        userScopeProvider: any EntitlementUserScopeProviding =
            NoEntitlementUserScopeProvider(),
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.repository = repository
        self.snapshotStore = snapshotStore
        self.householdProvider = householdProvider
        self.userScopeProvider = userScopeProvider
        self.now = now
    }

    /// Hydrate the in-memory snapshot from persistent storage.
    ///
    /// This never publishes a tier on its own: until a live read answers, the
    /// UI stays ``EntitlementDisplayStatus/pending``. A snapshot that no
    /// longer validates, or that belongs to another household scope, is
    /// discarded.
    func restoreCachedSnapshot() async {
        let userScope = await userScopeProvider.currentUserScope()
        let household = await householdProvider.currentEligibleHousehold()
        let scope = household?.id
        guard let stored = await snapshotStore.read() else { return }
        guard let userScope,
              stored.userScope == userScope,
              stored.householdScope == scope
        else {
            await discardCache()
            return
        }
        switch MinimizedEntitlementCodec.decode(stored.payload) {
        case .available(let envelope):
            cached = envelope
            cachedUserScope = stored.userScope
            cachedScope = stored.householdScope
        case .unavailable:
            Self.logger.notice("Cached entitlement snapshot was discarded")
            await discardCache()
        }
    }

    /// Read `entitlements-v1` and republish the display state.
    func refresh() async {
        operations += 1
        let operation = operations
        let userScope = await userScopeProvider.currentUserScope()
        let household = await householdProvider.currentEligibleHousehold()
        let result: EntitlementResult
        if userScope == nil {
            result = .unavailable(.unauthenticated)
        } else {
            result = await repository.load(household: household)
        }
        await apply(
            result,
            userScope: userScope,
            scope: household?.id,
            operation: operation
        )
    }

    /// Refresh only when the presentation asks for it — the server refresh
    /// deadline passed, the last read failed, or nothing was read yet.
    func refreshIfNeeded() async {
        let current = state
        let pastBound = current.refreshAfter.map { now() >= $0 } ?? false
        guard current.isPending || current.needsRefresh || pastBound else { return }
        await refresh()
    }

    /// Forget everything on sign-out or account switch.
    func clear() async {
        operations += 1
        appliedOperation = operations
        boundaryRefreshTask?.cancel()
        await discardCache()
        state = .pending
    }

    private func apply(
        _ result: EntitlementResult,
        userScope: String?,
        scope: UUID?,
        operation: UInt64
    ) async {
        // A slower earlier read must never overwrite a newer answer.
        guard operation >= appliedOperation else { return }
        appliedOperation = operation

        switch result {
        case .available(let envelope):
            guard let userScope else {
                await discardCache()
                guard operation == appliedOperation else { return }
                state = EntitlementDisplayState.resolve(
                    result: .unavailable(.unauthenticated),
                    cached: nil,
                    now: now()
                )
                return
            }
            cached = envelope
            cachedUserScope = userScope
            cachedScope = scope
            if let payload = MinimizedEntitlementCodec.encode(envelope) {
                await snapshotStore.write(
                    CachedEntitlementSnapshot(
                        userScope: userScope,
                        householdScope: scope,
                        payload: payload
                    )
                )
            }
        case .unavailable(let reason):
            // Identity, membership, or scope changes disprove the cached
            // subject; every other failure leaves it standing because it has
            // not been disproven.
            if reason == .unauthenticated ||
                reason == .forbidden ||
                userScope != cachedUserScope ||
                scope != cachedScope
            {
                await discardCache()
            }
        }

        guard operation == appliedOperation else { return }
        state = EntitlementDisplayState.resolve(result: result, cached: cached, now: now())
        scheduleBoundaryRefresh()
    }

    private func discardCache() async {
        cached = nil
        cachedUserScope = nil
        cachedScope = nil
        await snapshotStore.clear()
    }

    private func scheduleBoundaryRefresh() {
        boundaryRefreshTask?.cancel()
        let current = state
        guard let boundary = [current.refreshAfter, current.downgradeAt]
            .compactMap({ $0 })
            .min()
        else {
            return
        }
        let delay = boundary.timeIntervalSince(now())
        guard delay > 0 else { return }
        boundaryRefreshTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            await self?.refreshIfNeeded()
        }
    }
}

extension EntitlementStore: EntitlementRefreshing {
    /// Re-read the projection after Finance recorded a purchase or restore.
    func refreshEntitlement() async {
        await refresh()
    }
}

/// The store the app screens observe.
extension EntitlementStore {
    static let shared: EntitlementStore = {
        let syncConfiguration = PowerSyncConfiguration()
        guard let supabaseURL = URL(string: syncConfiguration.supabaseURL),
              supabaseURL.scheme == "https" || supabaseURL.host == "localhost"
        else {
            return EntitlementStore(repository: UnavailableEntitlementRepository())
        }
        let identityProvider = KeychainEntitlementIdentityProvider()
        return EntitlementStore(
            repository: EntitlementsV1Repository(
                supabaseURL: supabaseURL,
                tokenProvider: KeychainEntitlementAccessTokenProvider()
            ),
            snapshotStore: UserDefaultsEntitlementSnapshotStore(),
            householdProvider: identityProvider,
            userScopeProvider: identityProvider
        )
    }()
}

/// Used when the app has no configured Finance endpoint. It fails closed.
struct UnavailableEntitlementRepository: EntitlementRepository {
    func load(household _: EligibleHouseholdSelection?) async -> EntitlementResult {
        .unavailable(.projectionUnavailable)
    }
}
