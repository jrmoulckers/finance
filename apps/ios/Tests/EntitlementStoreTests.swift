// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

private actor StubEntitlementRepository: EntitlementRepository {
    private var result: EntitlementResult
    private(set) var households: [UUID?] = []

    init(result: EntitlementResult) {
        self.result = result
    }

    func setResult(_ result: EntitlementResult) {
        self.result = result
    }

    func load(household: EligibleHouseholdSelection?) async -> EntitlementResult {
        households.append(household?.id)
        return result
    }

    func readCount() -> Int { households.count }
}

private struct FixedHouseholdProvider: EligibleHouseholdProviding {
    let selection: EligibleHouseholdSelection?

    func currentEligibleHousehold() async -> EligibleHouseholdSelection? { selection }
}

private struct FixedUserScopeProvider: EntitlementUserScopeProviding {
    let userScope: String?

    func currentUserScope() async -> String? { userScope }
}

/// The cached snapshot is display-only and follows the bounds the **server**
/// issued: `validity.refresh_after` for refresh, and `downgrade.effective_at`
/// only for a reduction the projection actually proved.
@Suite("Entitlement display state")
struct EntitlementDisplayStateTests {
    private let inside = EntitlementFixtures.insideBounds
    private let past = EntitlementFixtures.pastRefreshBound

    private var premium: EntitlementEnvelope {
        EntitlementFixtures.decoded(EntitlementFixtures.premium())
    }

    private var family: EntitlementEnvelope {
        EntitlementFixtures.decoded(EntitlementFixtures.family())
    }

    private var undetermined: EntitlementEnvelope {
        EntitlementFixtures.decoded(EntitlementFixtures.undeterminedDowngrade())
    }

    private func offline(_ cached: EntitlementEnvelope?, at now: Date) -> EntitlementDisplayState {
        EntitlementDisplayState.resolve(result: .unavailable(.offline), cached: cached, now: now)
    }

    @Test("A fresh server answer displays as current")
    func freshAnswerIsCurrent() {
        let state = EntitlementDisplayState.resolve(
            result: .available(family),
            cached: nil,
            now: inside
        )

        #expect(state.status == .current)
        #expect(state.tier == .family)
        #expect(state.bankConnectionAllowance == 4)
        #expect(state.refreshAfter == EntitlementFixtures.refreshAfter)
        #expect(!state.needsRefresh)
    }

    @Test("A cached snapshot inside its bounds stays displayable offline")
    func offlineWithinBounds() {
        let state = offline(premium, at: inside)

        #expect(state.status == .offlineValid)
        #expect(state.tier == .premium)
        #expect(!state.needsRefresh)
    }

    @Test("A proven reduction boundary ends offline display at Free")
    func offlinePastProvenBoundary() {
        let state = offline(premium, at: past)

        #expect(state.status == .offlineRefreshNeeded)
        #expect(state.tier == .free)
        #expect(state.bankConnectionAllowance == 0)
        #expect(state.needsRefresh)
    }

    @Test("An unproven bound asks for a refresh instead of expiring access")
    func offlineWithUnprovenBound() {
        let state = offline(undetermined, at: past)

        #expect(state.status == .offlineRefreshNeeded)
        // The collapsed bound may belong to the grant that determines neither
        // the tier nor the allowance, so display must not fall to Free.
        #expect(state.tier == .premium)
        #expect(state.bankConnectionAllowance == 2)
    }

    @Test("A reachable server with an unusable answer keeps the proven snapshot")
    func projectionOutageKeepsSnapshot() {
        let state = EntitlementDisplayState.resolve(
            result: .unavailable(.projectionUnavailable),
            cached: premium,
            now: inside
        )

        #expect(state.status == .stale)
        #expect(state.tier == .premium)
        #expect(state.needsRefresh)
    }

    @Test("An identity or membership denial discards the cached subject")
    func identityDenialDiscardsCache() {
        for reason in [EntitlementUnavailableReason.unauthenticated, .forbidden] {
            let state = EntitlementDisplayState.resolve(
                result: .unavailable(reason),
                cached: family,
                now: inside
            )

            #expect(state.status == .unavailable)
            #expect(state.tier == .free)
            #expect(state.bankConnectionAllowance == 0)
        }
    }

    @Test("A server answer already past its refresh bound is reported stale")
    func liveAnswerPastBound() {
        let state = EntitlementDisplayState.resolve(
            result: .available(premium),
            cached: nil,
            now: past
        )

        #expect(state.status == .stale)
        #expect(state.tier == .free)
    }

    @Test("The pending state claims nothing")
    func pendingClaimsNothing() {
        #expect(EntitlementDisplayState.pending.status == .pending)
        #expect(EntitlementDisplayState.pending.tier == .free)
        #expect(EntitlementDisplayState.pending.isPending)
    }

    @Test("Every state has its own spoken explanation")
    func everyStateIsAnnounced() {
        let details = EntitlementDisplayStatus.allCases.map { status in
            EntitlementStatusMessages.detail(
                EntitlementDisplayState(status: status, tier: .premium)
            )
        }

        #expect(Set(details).count == details.count)
        #expect(details.allSatisfy { !$0.isEmpty })
    }

    @Test("The offline explanation says what is still available")
    func offlineExplanationIsReassuring() {
        let detail = EntitlementStatusMessages.detail(
            EntitlementDisplayState(status: .unavailable, unavailableReason: .offline)
        )

        #expect(detail.contains("export"))
        #expect(detail.contains("history"))
    }
}

@Suite("Entitlement store")
struct EntitlementStoreTests {
    private let householdId = UUID(uuidString: "44010000-0000-4000-8000-000000000001")!

    @MainActor
    private func makeStore(
        repository: StubEntitlementRepository,
        snapshotStore: any EntitlementSnapshotStoring = InMemoryEntitlementSnapshotStore(),
        household: EligibleHouseholdSelection? = nil,
        userScope: String? = "user-a",
        now: Date = EntitlementFixtures.insideBounds
    ) -> EntitlementStore {
        EntitlementStore(
            repository: repository,
            snapshotStore: snapshotStore,
            householdProvider: FixedHouseholdProvider(selection: household),
            userScopeProvider: FixedUserScopeProvider(userScope: userScope),
            now: { now }
        )
    }

    @Test("A live read publishes the confirmed tier and caches it")
    @MainActor
    func liveReadPublishesAndCaches() async {
        let snapshotStore = InMemoryEntitlementSnapshotStore()
        let repository = StubEntitlementRepository(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
        )
        let store = makeStore(repository: repository, snapshotStore: snapshotStore)

        #expect(store.state.isPending)
        await store.refresh()

        #expect(store.state.status == .current)
        #expect(store.state.tier == .premium)
        #expect(await snapshotStore.read() != nil)
    }

    @Test("An offline read falls back to the cached snapshot only")
    @MainActor
    func offlineReadUsesCache() async {
        let repository = StubEntitlementRepository(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
        )
        let store = makeStore(repository: repository)
        await store.refresh()

        await repository.setResult(.unavailable(.offline))
        await store.refresh()

        #expect(store.state.status == .offlineValid)
        #expect(store.state.tier == .premium)
    }

    @Test("An unauthenticated answer erases the cached snapshot")
    @MainActor
    func unauthenticatedErasesCache() async {
        let snapshotStore = InMemoryEntitlementSnapshotStore()
        let repository = StubEntitlementRepository(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.family())
        )
        let store = makeStore(repository: repository, snapshotStore: snapshotStore)
        await store.refresh()

        await repository.setResult(.unavailable(.unauthenticated))
        await store.refresh()

        #expect(store.state.status == .unavailable)
        #expect(store.state.tier == .free)
        #expect(await snapshotStore.read() == nil)
    }

    @Test("A cached snapshot is restored for display but never published alone")
    @MainActor
    func restoredSnapshotStaysPendingUntilARead() async {
        let snapshotStore = InMemoryEntitlementSnapshotStore(
            snapshot: CachedEntitlementSnapshot(
                userScope: "user-a",
                householdScope: nil,
                payload: EntitlementFixtures.premium()
            )
        )
        let repository = StubEntitlementRepository(result: .unavailable(.offline))
        let store = makeStore(repository: repository, snapshotStore: snapshotStore)

        await store.restoreCachedSnapshot()
        #expect(store.state.isPending)

        await store.refresh()
        #expect(store.state.status == .offlineValid)
        #expect(store.state.tier == .premium)
    }

    @Test("A corrupted cached snapshot is discarded rather than displayed")
    @MainActor
    func corruptedSnapshotIsDiscarded() async {
        let snapshotStore = InMemoryEntitlementSnapshotStore(
            snapshot: CachedEntitlementSnapshot(
                userScope: "user-a",
                householdScope: nil,
                payload: Data("{ not an envelope".utf8)
            )
        )
        let repository = StubEntitlementRepository(result: .unavailable(.offline))
        let store = makeStore(repository: repository, snapshotStore: snapshotStore)

        await store.restoreCachedSnapshot()
        await store.refresh()

        #expect(store.state.status == .unavailable)
        #expect(store.state.tier == .free)
        #expect(await snapshotStore.read() == nil)
    }

    @Test("A household scope change never shows the previous subject's snapshot")
    @MainActor
    func scopeChangeDiscardsSnapshot() async throws {
        let snapshotStore = InMemoryEntitlementSnapshotStore()
        let household = try #require(
            EligibleHouseholdSelection.authenticatedMembership(householdId)
        )
        let repository = StubEntitlementRepository(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.family())
        )
        let householdStore = makeStore(
            repository: repository,
            snapshotStore: snapshotStore,
            household: household
        )
        await householdStore.refresh()
        #expect(householdStore.state.tier == .family)

        // The membership ends: the next read is purchaser-scoped and fails.
        await repository.setResult(.unavailable(.offline))
        let purchaserStore = makeStore(repository: repository, snapshotStore: snapshotStore)
        await purchaserStore.restoreCachedSnapshot()
        await purchaserStore.refresh()

        #expect(purchaserStore.state.tier == .free)
        #expect(await snapshotStore.read() == nil)
    }

    @Test("refreshIfNeeded re-reads once the server issued bound has passed")
    @MainActor
    func refreshIfNeededHonoursServerBound() async {
        let repository = StubEntitlementRepository(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
        )
        let store = makeStore(repository: repository)

        await store.refreshIfNeeded()
        #expect(await repository.readCount() == 1)

        await store.refreshIfNeeded()
        #expect(await repository.readCount() == 1)

        let laterStore = makeStore(
            repository: repository,
            now: EntitlementFixtures.pastRefreshBound
        )
        await laterStore.refresh()
        await laterStore.refreshIfNeeded()
        #expect(await repository.readCount() == 3)
    }

    @Test("Sign out clears the display state and the cache")
    @MainActor
    func signOutClearsEverything() async {
        let snapshotStore = InMemoryEntitlementSnapshotStore()
        let repository = StubEntitlementRepository(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
        )
        let store = makeStore(repository: repository, snapshotStore: snapshotStore)
        await store.refresh()

        await store.clear()

        #expect(store.state.isPending)
        #expect(await snapshotStore.read() == nil)
    }

    @Test("An account switch cannot restore the previous user's snapshot")
    @MainActor
    func accountSwitchDiscardsSnapshot() async {
        let snapshotStore = InMemoryEntitlementSnapshotStore()
        let firstRepository = StubEntitlementRepository(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
        )
        let firstUser = makeStore(
            repository: firstRepository,
            snapshotStore: snapshotStore,
            userScope: "user-a"
        )
        await firstUser.refresh()

        let secondRepository = StubEntitlementRepository(result: .unavailable(.offline))
        let secondUser = makeStore(
            repository: secondRepository,
            snapshotStore: snapshotStore,
            userScope: "user-b"
        )
        await secondUser.restoreCachedSnapshot()
        await secondUser.refresh()

        #expect(secondUser.state.tier == .free)
        #expect(await snapshotStore.read() == nil)
    }

    @Test("The cached snapshot never renders into a log line")
    func cachedSnapshotIsRedacted() {
        let snapshot = CachedEntitlementSnapshot(
            userScope: "user-a",
            householdScope: householdId,
            payload: EntitlementFixtures.premium()
        )

        #expect(!String(describing: snapshot).contains("premium"))
        #expect(!String(describing: snapshot).contains(householdId.uuidString))
    }
}
