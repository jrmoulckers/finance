// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

private actor DelayedEntitlementTransport: AuthenticatedEntitlementTransport {
    private var purchaseCallCount = 0
    private var firstStarted = false
    private var firstStartedContinuation: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?

    func isAuthenticated() async -> Bool { true }

    func confirm(
        _ request: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation {
        guard request.operation == .confirm else {
            return .pending(.free)
        }
        purchaseCallCount += 1
        if purchaseCallCount == 1 {
            firstStarted = true
            firstStartedContinuation?.resume()
            firstStartedContinuation = nil
            await withCheckedContinuation { continuation in
                releaseContinuation = continuation
            }
            return .confirmed(premiumProjection)
        }
        return .pending(freeProjection())
    }

    func fetchProjection(
        _: FinanceEntitlementContext,
        eligibleHousehold _: EligibleHouseholdSelection?
    ) async throws -> FinanceServerConfirmation {
        .pending(freeProjection())
    }

    func waitUntilFirstStarts() async {
        guard !firstStarted else { return }
        await withCheckedContinuation { continuation in
            firstStartedContinuation = continuation
        }
    }

    func releaseFirst() {
        releaseContinuation?.resume()
        releaseContinuation = nil
    }
}

private struct FixedEligibleHouseholdProvider: EligibleHouseholdProviding {
    let selection: EligibleHouseholdSelection?

    func currentEligibleHousehold() async -> EligibleHouseholdSelection? {
        selection
    }
}

@Suite("iOS Entitlement Confirmation Tests")
struct EntitlementConfirmationTests {
    @Test("Verified StoreKit evidence remains pending and unfinished")
    func pendingEvidenceDoesNotGrantOrFinish() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence(recorder: recorder))
        let transport = StubEntitlementTransport()
        transport.purchaseResponse = .pending(.free)
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        let state = await service.purchase(productId: "synthetic.monthly")
        let finishCount = await recorder.count

        #expect(state.phase == .pending)
        #expect(!EntitlementState(projection: state.projection).isPremium)
        #expect(finishCount == 0)
    }

    @Test("Pending operation preserves a confirmed paid projection")
    func pendingPaidProjectionRemainsAuthorized() {
        let state = PurchaseConfirmationState(
            phase: .pending,
            projection: premiumProjection
        )

        #expect(state.authorizesNewCostIncurringActions)
    }

    @Test("Server confirmation grants and then finishes evidence")
    func confirmedEvidenceFinishes() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence(recorder: recorder))
        let transport = StubEntitlementTransport()
        transport.purchaseResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        let state = await service.purchase(productId: "synthetic.monthly")
        let finishCount = await recorder.count

        #expect(state.phase == .confirmed)
        #expect(EntitlementState(projection: state.projection).isPremium)
        #expect(finishCount == 1)
        #expect(transport.purchaseRequests.count == 1)
        #expect(transport.purchaseRequests.first?.operation == .confirm)
    }

    @Test("Restore evidence cannot grant before confirmation")
    func restoreWaitsForServer() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.restoreResult = [evidence(recorder: recorder)]
        let transport = StubEntitlementTransport()
        transport.restoreResponse = .pending(.free)
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        let state = await service.restorePurchases()
        let finishCount = await recorder.count

        #expect(state.phase == .pending)
        #expect(state.projection == .free)
        #expect(finishCount == 0)
        #expect(transport.restoreRequests.count == 1)
        #expect(transport.restoreRequests.first?.operation == .restore)
    }

    @Test("Restore submits one server operation without local evidence")
    func restoreWithoutEvidenceStillConfirms() async {
        let transport = StubEntitlementTransport()
        let service = SubscriptionService(
            purchaseAdapter: StubNativePurchaseAdapter(),
            transport: transport
        )

        let state = await service.restorePurchases()

        #expect(state.phase == .pending)
        #expect(transport.restoreRequests.count == 1)
    }

    @Test("Confirmed restore finishes all evidence after one server operation")
    func confirmedRestoreFinishesAllEvidence() async {
        let firstRecorder = FinishRecorder()
        let secondRecorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.restoreResult = [
            evidence(token: "first", recorder: firstRecorder),
            evidence(token: "second", recorder: secondRecorder),
        ]
        let transport = StubEntitlementTransport()
        transport.restoreResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        let state = await service.restorePurchases()
        let firstFinishCount = await firstRecorder.count
        let secondFinishCount = await secondRecorder.count

        #expect(state.phase == .confirmed)
        #expect(state.projection == premiumProjection)
        #expect(transport.restoreRequests.count == 1)
        #expect(firstFinishCount == 1)
        #expect(secondFinishCount == 1)
    }

    @Test("Backend outage is retryable and preserves safe projection")
    func outageIsRetryable() async {
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence())
        let transport = StubEntitlementTransport()
        transport.shouldThrow = true
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        let state = await service.purchase(productId: "synthetic.monthly")

        #expect(state.phase == .retry)
        #expect(state.projection == .free)
    }

    @Test("Paid projection survives cancelled and retry operations")
    func paidProjectionSurvivesTransientOperations() async {
        let adapter = StubNativePurchaseAdapter()
        let transport = StubEntitlementTransport()
        transport.projectionResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        _ = await service.checkEntitlement()
        adapter.purchaseResult = .verified(evidence())
        transport.purchaseResponse = .pending(.free)
        let pending = await service.purchase(productId: "synthetic.monthly")

        adapter.purchaseResult = .cancelled
        let cancelled = await service.purchase(productId: "synthetic.monthly")

        adapter.purchaseResult = .verified(evidence())
        transport.shouldThrow = true
        let retry = await service.purchase(productId: "synthetic.monthly")

        #expect(pending.phase == .pending)
        #expect(pending.projection == premiumProjection)
        #expect(pending.authorizesNewCostIncurringActions)
        #expect(cancelled.phase == .cancelled)
        #expect(cancelled.projection == premiumProjection)
        #expect(cancelled.authorizesNewCostIncurringActions)
        #expect(retry.phase == .retry)
        #expect(retry.projection == premiumProjection)
        #expect(retry.authorizesNewCostIncurringActions)
    }

    @Test("Newer server denial replaces paid access")
    func serverDenialReplacesPaidAccess() async {
        let transport = StubEntitlementTransport()
        transport.projectionResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: StubNativePurchaseAdapter(),
            transport: transport
        )

        let paid = await service.checkEntitlement()
        transport.projectionResponse = .pending(freeProjection())
        let denied = await service.checkEntitlement()

        #expect(paid.authorizesNewCostIncurringActions)
        #expect(denied.phase == .pending)
        #expect(denied.projection == freeProjection())
        #expect(!denied.authorizesNewCostIncurringActions)
    }

    @Test("Pending denial projection replaces paid access")
    func pendingDenialReplacesPaidAccess() async {
        let transport = StubEntitlementTransport()
        transport.projectionResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: StubNativePurchaseAdapter(),
            transport: transport
        )
        _ = await service.checkEntitlement()

        transport.projectionResponse = .pending(freeProjection())
        let denied = await service.checkEntitlement()

        #expect(denied.phase == .pending)
        #expect(denied.projection.projectionVersion == 2)
        #expect(!denied.authorizesNewCostIncurringActions)
    }

    @Test("Server error preserves paid projection and is not reported as pending")
    func serverErrorPreservesPaidProjection() async {
        let adapter = StubNativePurchaseAdapter()
        let transport = StubEntitlementTransport()
        transport.projectionResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )
        _ = await service.checkEntitlement()

        adapter.purchaseResult = .verified(evidence())
        transport.transportError = .householdAccessDenied
        let rejected = await service.purchase(productId: "synthetic.monthly")

        #expect(rejected.phase == .error)
        #expect(rejected.projection == premiumProjection)
        #expect(rejected.authorizesNewCostIncurringActions)
    }

    @Test("Eligible authenticated household is the only Family intent source")
    func eligibleHouseholdIsInjected() async throws {
        let household = try #require(
            EligibleHouseholdSelection.authenticatedMembership(
                UUID(uuidString: "44010000-0000-4000-8000-000000000001")!
            )
        )
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence())
        let transport = StubEntitlementTransport()
        transport.purchaseResponse = .pending(freeProjection())
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport,
            eligibleHouseholdProvider: FixedEligibleHouseholdProvider(selection: household)
        )

        _ = await service.purchase(productId: "synthetic.monthly")

        #expect(transport.purchaseRequests.first?.eligibleHousehold == household)
    }

    @Test("StoreKit listener publishes server confirmation")
    func listenerPublishesConfirmation() async {
        let adapter = StubNativePurchaseAdapter()
        let transport = StubEntitlementTransport()
        transport.purchaseResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )
        let updates = await service.confirmationUpdates()
        var iterator = updates.makeAsyncIterator()
        _ = await iterator.next()
        _ = await service.loadProducts()
        await Task.yield()

        adapter.emitUpdate(evidence())
        let update = await iterator.next()

        #expect(update?.phase == .confirmed)
        #expect(update?.projection == premiumProjection)
    }

    @Test("Older paid response cannot overwrite newer denial")
    func newerDenialWinsResponseRace() async {
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence())
        let transport = DelayedEntitlementTransport()
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        let older = Task {
            await service.purchase(productId: "synthetic.monthly")
        }
        await transport.waitUntilFirstStarts()
        let newer = Task {
            await service.purchase(productId: "synthetic.monthly")
        }
        _ = await newer.value
        await transport.releaseFirst()
        _ = await older.value

        let updates = await service.confirmationUpdates()
        var iterator = updates.makeAsyncIterator()
        let current = await iterator.next()

        #expect(current?.projection == freeProjection())
        #expect(current?.phase == .idle)
    }

    @Test("Unauthenticated purchaser cannot submit evidence")
    func unauthenticatedEvidenceIsRejected() async {
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence())
        let transport = StubEntitlementTransport()
        transport.authenticated = false
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport
        )

        let state = await service.purchase(productId: "synthetic.monthly")

        #expect(state.phase == .error)
        #expect(state.projection == .free)
        #expect(transport.purchaseRequests.isEmpty)
    }

    @Test("Stale and expired projections do not authorize new paid actions")
    func staleProjectionDoesNotAuthorize() {
        let stale = FinanceEntitlementProjection(
            userTier: .premium,
            householdTier: nil,
            bankConnectionAllowance: 10,
            isPremiumSponsor: false,
            isFamilyBound: false,
            effectiveAt: premiumProjection.effectiveAt,
            expiresAt: nil,
            projectionVersion: 2,
            serverTime: premiumProjection.serverTime,
            status: .stale
        )
        let expired = FinanceEntitlementProjection(
            userTier: .premium,
            householdTier: nil,
            bankConnectionAllowance: 10,
            isPremiumSponsor: false,
            isFamilyBound: false,
            effectiveAt: premiumProjection.effectiveAt,
            expiresAt: nil,
            projectionVersion: 2,
            serverTime: premiumProjection.serverTime,
            status: .expired
        )
        let unboundFamily = FinanceEntitlementProjection(
            userTier: .free,
            householdTier: .family,
            bankConnectionAllowance: 10,
            isPremiumSponsor: false,
            isFamilyBound: false,
            effectiveAt: premiumProjection.effectiveAt,
            expiresAt: nil,
            projectionVersion: 2,
            serverTime: premiumProjection.serverTime,
            status: .current
        )

        #expect(!stale.authorizesNewCostIncurringActions)
        #expect(!expired.authorizesNewCostIncurringActions)
        #expect(!unboundFamily.authorizesNewCostIncurringActions)
    }

    @Test("Confirmation request cannot carry client-selected grants")
    func requestHasNoGrantInputs() {
        let request = FinanceEntitlementConfirmationRequest(
            operation: .confirm,
            context: FinanceEntitlementContext(
                appId: "app_synthetic",
                environment: .sandbox
            ),
            eligibleHousehold: nil
        )
        let fields = Set(Mirror(reflecting: request).children.compactMap(\.label))
        let forbidden = Set([
            "tier", "price", "allowance", "quantity", "validity",
            "customerId", "providerAccountId", "grantScope",
            "eligibleHouseholdIntent", "householdId", "provider",
            "opaqueEvidence", "operationReference",
        ])
        let contextFields = Set(
            Mirror(reflecting: request.context).children.compactMap(\.label)
        )

        #expect(fields.isDisjoint(with: forbidden))
        #expect(contextFields.isDisjoint(with: forbidden))
    }

    @Test("Evidence and state descriptions exclude provider identifiers")
    func descriptionsArePrivacySafe() {
        let token = "synthetic-secret-operation-reference"
        let purchaseEvidence = evidence(token: token)
        let request = FinanceEntitlementConfirmationRequest(
            operation: .confirm,
            context: FinanceEntitlementContext(
                appId: "app_synthetic",
                environment: .sandbox
            ),
            eligibleHousehold: nil
        )
        let state = PurchaseConfirmationState(
            phase: .pending,
            projection: .free
        )

        #expect(!String(describing: purchaseEvidence).contains(token))
        #expect(!String(describing: request).contains(token))
        #expect(!String(describing: state).contains(token))
    }

    @Test("Generic validity uses neutral access wording")
    func validityDescriptionIsNeutral() {
        let projection = FinanceEntitlementProjection(
            userTier: .premium,
            householdTier: nil,
            bankConnectionAllowance: 10,
            isPremiumSponsor: false,
            isFamilyBound: false,
            effectiveAt: premiumProjection.effectiveAt,
            expiresAt: Date(timeIntervalSince1970: 1_900_000_000),
            projectionVersion: 2,
            serverTime: premiumProjection.serverTime,
            status: .current
        )
        let description = EntitlementState(
            projection: projection
        ).accessValidityDescription

        #expect(description?.contains("Access through") == true)
        #expect(description?.contains("Renew") == false)
    }
}
