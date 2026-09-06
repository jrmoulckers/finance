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

    @Test("Pending state cannot authorize even with a paid projection")
    func pendingPaidProjectionDoesNotAuthorize() {
        let state = PurchaseConfirmationState(
            phase: .pending,
            projection: premiumProjection
        )

        #expect(!state.authorizesNewCostIncurringActions)
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
                environment: .development,
                eligibleHouseholdIntent: nil
            ),
            provider: .revenueCatApple,
            opaqueEvidence: "synthetic-provider-operation"
        )
        let fields = Set(Mirror(reflecting: request).children.compactMap(\.label))
        let forbidden = Set([
            "tier", "price", "allowance", "quantity", "validity",
            "customerId", "providerAccountId", "grantScope",
        ])

        #expect(fields.isDisjoint(with: forbidden))
    }

    @Test("Evidence and state descriptions exclude provider identifiers")
    func descriptionsArePrivacySafe() {
        let token = "synthetic-secret-operation-reference"
        let purchaseEvidence = evidence(token: token)
        let request = FinanceEntitlementConfirmationRequest(
            context: FinanceEntitlementContext(
                application: .finance,
                environment: .development,
                eligibleHouseholdIntent: nil
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
}
