// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

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

    @Test("Newer confirmed denial replaces paid access")
    func confirmedDenialReplacesPaidAccess() async {
        let transport = StubEntitlementTransport()
        transport.projectionResponse = .confirmed(premiumProjection)
        let service = SubscriptionService(
            purchaseAdapter: StubNativePurchaseAdapter(),
            transport: transport
        )

        let paid = await service.checkEntitlement()
        transport.projectionResponse = .confirmed(.free)
        let denied = await service.checkEntitlement()

        #expect(paid.authorizesNewCostIncurringActions)
        #expect(denied.phase == .confirmed)
        #expect(denied.projection == .free)
        #expect(!denied.authorizesNewCostIncurringActions)
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
            tier: .premium,
            status: .stale,
            validUntil: nil,
            isHouseholdBound: false
        )
        let expired = FinanceEntitlementProjection(
            tier: .premium,
            status: .expired,
            validUntil: nil,
            isHouseholdBound: false
        )
        let unboundFamily = FinanceEntitlementProjection(
            tier: .family,
            status: .current,
            validUntil: nil,
            isHouseholdBound: false
        )

        #expect(!stale.authorizesNewCostIncurringActions)
        #expect(!expired.authorizesNewCostIncurringActions)
        #expect(!unboundFamily.authorizesNewCostIncurringActions)
    }

    @Test("Confirmation request cannot carry client-selected grants")
    func requestHasNoGrantInputs() {
        let request = FinanceEntitlementConfirmationRequest(
            context: FinanceEntitlementContext(
                application: .finance,
                environment: .development
            ),
            provider: .revenueCatApple,
            opaqueEvidence: "synthetic-provider-operation"
        )
        let fields = Set(Mirror(reflecting: request).children.compactMap(\.label))
        let forbidden = Set([
            "tier", "price", "allowance", "quantity", "validity",
            "customerId", "providerAccountId", "grantScope",
            "eligibleHouseholdIntent", "householdId",
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
            context: FinanceEntitlementContext(
                application: .finance,
                environment: .development
            ),
            provider: .revenueCatApple,
            opaqueEvidence: token
        )
        let state = PurchaseConfirmationState(
            phase: .pending,
            projection: .free
        )

        #expect(!String(describing: purchaseEvidence).contains(token))
        #expect(!String(describing: request).contains(token))
        #expect(!String(describing: state).contains(token))
        #expect(!String(describing: state).contains("revenueCatApple"))
    }

    @Test("Generic validity uses neutral access wording")
    func validityDescriptionIsNeutral() {
        let projection = FinanceEntitlementProjection(
            tier: .premium,
            status: .current,
            validUntil: Date(timeIntervalSince1970: 1_900_000_000),
            isHouseholdBound: false
        )
        let description = EntitlementState(
            projection: projection
        ).accessValidityDescription

        #expect(description?.contains("Access through") == true)
        #expect(description?.contains("Renew") == false)
    }
}
