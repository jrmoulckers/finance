// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

// MARK: - Shared stubs

final class StubNativePurchaseAdapter: NativePurchaseProviding, @unchecked Sendable {
    private let updateStream: AsyncStream<VerifiedPurchaseEvidence>
    private let updateContinuation: AsyncStream<VerifiedPurchaseEvidence>.Continuation
    var products: [SubscriptionProductInfo] = []
    var purchaseResult: NativePurchaseResult = .pending
    var restoreResult: [VerifiedPurchaseEvidence] = []

    init() {
        let updates = AsyncStream.makeStream(of: VerifiedPurchaseEvidence.self)
        updateStream = updates.stream
        updateContinuation = updates.continuation
    }

    func loadProducts() async -> [SubscriptionProductInfo] { products }

    func purchase(productId _: String) async throws -> NativePurchaseResult { purchaseResult }

    func restoreEvidence() async throws -> [VerifiedPurchaseEvidence] { restoreResult }

    func transactionUpdates() -> AsyncStream<VerifiedPurchaseEvidence> { updateStream }

    func emitUpdate(_ evidence: VerifiedPurchaseEvidence) {
        updateContinuation.yield(evidence)
    }
}

final class StubEntitlementTransport: AuthenticatedEntitlementTransport, @unchecked Sendable {
    var authenticated = true
    var purchaseResponse: FinanceServerConfirmation = .pending
    var restoreResponse: FinanceServerConfirmation = .pending
    var shouldThrow = false
    var transportError: RevenueCatEntitlementTransportError?
    var purchaseRequests: [FinanceEntitlementConfirmationRequest] = []
    var restoreRequests: [FinanceEntitlementConfirmationRequest] = []

    func isAuthenticated() async -> Bool { authenticated }

    func confirm(
        _ request: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation {
        switch request.operation {
        case .confirm:
            purchaseRequests.append(request)
        case .restore:
            restoreRequests.append(request)
        }
        if let transportError { throw transportError }
        if shouldThrow { throw SubscriptionError.confirmationUnavailable }
        return request.operation == .confirm ? purchaseResponse : restoreResponse
    }
}

/// Records that the projection was re-read after a Finance confirmation.
actor RecordingEntitlementRefresher: EntitlementRefreshing {
    private(set) var refreshCount = 0

    func refreshEntitlement() async {
        refreshCount += 1
    }
}

actor FinishRecorder {
    private(set) var count = 0

    func record() {
        count += 1
    }
}

func evidence(
    token: String = "synthetic-provider-operation",
    recorder: FinishRecorder = FinishRecorder()
) -> VerifiedPurchaseEvidence {
    _ = token
    return VerifiedPurchaseEvidence(
        finishAction: {
            await recorder.record()
        }
    )
}

private struct FixedEligibleHouseholdProvider: EligibleHouseholdProviding {
    let selection: EligibleHouseholdSelection?

    func currentEligibleHousehold() async -> EligibleHouseholdSelection? { selection }
}

// MARK: - Tests

@Suite("iOS Entitlement Confirmation Tests")
struct EntitlementConfirmationTests {
    private let householdId = UUID(uuidString: "44010000-0000-4000-8000-000000000001")!

    @Test("Verified StoreKit evidence remains pending and unfinished")
    func pendingEvidenceDoesNotGrantOrFinish() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence(recorder: recorder))
        let transport = StubEntitlementTransport()
        transport.purchaseResponse = .pending
        let service = SubscriptionService(purchaseAdapter: adapter, transport: transport)

        let state = await service.purchase(productId: "synthetic.monthly")
        let finishCount = await recorder.count

        #expect(state.phase == .pending)
        #expect(finishCount == 0)
    }

    @Test("Server confirmation finishes evidence and re-reads the projection")
    func confirmedEvidenceFinishesAndRefreshes() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence(recorder: recorder))
        let transport = StubEntitlementTransport()
        transport.purchaseResponse = .confirmed
        let refresher = RecordingEntitlementRefresher()
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport,
            entitlementRefresher: refresher
        )

        let state = await service.purchase(productId: "synthetic.monthly")
        let finishCount = await recorder.count
        let refreshCount = await refresher.refreshCount

        #expect(state.phase == .confirmed)
        #expect(finishCount == 1)
        #expect(refreshCount == 1)
        #expect(transport.purchaseRequests.count == 1)
        #expect(transport.purchaseRequests.first?.operation == .confirm)
    }

    @Test("Restore evidence cannot be finished before confirmation")
    func restoreEvidenceStaysUnfinished() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.restoreResult = [evidence(recorder: recorder)]
        let transport = StubEntitlementTransport()
        transport.restoreResponse = .pending
        let service = SubscriptionService(purchaseAdapter: adapter, transport: transport)

        let state = await service.restorePurchases()
        let finishCount = await recorder.count

        #expect(state.phase == .pending)
        #expect(finishCount == 0)
        #expect(transport.restoreRequests.count == 1)
        #expect(transport.restoreRequests.first?.operation == .restore)
    }

    @Test("Confirmed restore finishes all evidence after one server operation")
    func confirmedRestoreFinishesAllEvidence() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.restoreResult = [
            evidence(token: "first", recorder: recorder),
            evidence(token: "second", recorder: recorder),
        ]
        let transport = StubEntitlementTransport()
        transport.restoreResponse = .confirmed
        let service = SubscriptionService(purchaseAdapter: adapter, transport: transport)

        let state = await service.restorePurchases()
        let finishCount = await recorder.count

        #expect(state.phase == .confirmed)
        #expect(finishCount == 2)
        #expect(transport.restoreRequests.count == 1)
    }

    @Test("Backend outage is retryable and never finishes evidence")
    func backendOutageIsRetryable() async {
        let recorder = FinishRecorder()
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence(recorder: recorder))
        let transport = StubEntitlementTransport()
        transport.transportError = .temporarilyUnavailable
        let refresher = RecordingEntitlementRefresher()
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport,
            entitlementRefresher: refresher
        )

        let state = await service.purchase(productId: "synthetic.monthly")
        let finishCount = await recorder.count
        let refreshCount = await refresher.refreshCount

        #expect(state.phase == .retry)
        #expect(finishCount == 0)
        #expect(refreshCount == 0)
    }

    @Test("A rejected confirmation is an error rather than a retry")
    func rejectedConfirmationIsAnError() async {
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence())
        let transport = StubEntitlementTransport()
        transport.transportError = .invalidRequest
        let service = SubscriptionService(purchaseAdapter: adapter, transport: transport)

        let state = await service.purchase(productId: "synthetic.monthly")

        #expect(state.phase == .error)
    }

    @Test("Unauthenticated purchaser cannot submit evidence")
    func unauthenticatedCannotSubmit() async {
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence())
        let transport = StubEntitlementTransport()
        transport.authenticated = false
        let service = SubscriptionService(purchaseAdapter: adapter, transport: transport)

        let state = await service.purchase(productId: "synthetic.monthly")

        #expect(state.phase == .error)
        #expect(transport.purchaseRequests.isEmpty)
    }

    @Test("Cancellation stays distinct from a confirmation error")
    func cancellationIsDistinct() async {
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .cancelled
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: StubEntitlementTransport()
        )

        let state = await service.purchase(productId: "synthetic.monthly")

        #expect(state.phase == .cancelled)
    }

    @Test("Eligible authenticated household is the only Family intent source")
    func eligibleHouseholdIsTheOnlyIntentSource() async throws {
        let adapter = StubNativePurchaseAdapter()
        adapter.purchaseResult = .verified(evidence())
        let transport = StubEntitlementTransport()
        transport.purchaseResponse = .confirmed
        let household = try #require(
            EligibleHouseholdSelection.authenticatedMembership(householdId)
        )
        let service = SubscriptionService(
            purchaseAdapter: adapter,
            transport: transport,
            eligibleHouseholdProvider: FixedEligibleHouseholdProvider(selection: household)
        )

        _ = await service.purchase(productId: "synthetic.monthly")

        #expect(transport.purchaseRequests.first?.eligibleHousehold == household)
    }

    @Test("An unsupported household identifier version is rejected")
    func unsupportedHouseholdIdentifierIsRejected() throws {
        let invalidVersion = try #require(
            UUID(uuidString: "44010000-0000-0000-8000-000000000001")
        )

        #expect(EligibleHouseholdSelection.authenticatedMembership(invalidVersion) == nil)
    }

    @Test("Confirmation request cannot carry client-selected grants")
    func requestCarriesNoGrant() throws {
        let request = FinanceEntitlementConfirmationRequest(
            operation: .confirm,
            context: FinanceEntitlementContext(
                appId: "app_synthetic_apple",
                environment: .sandbox
            ),
            eligibleHousehold: nil
        )

        let object = try #require(
            JSONSerialization.jsonObject(
                with: RevenueCatEntitlementWireCodec.encode(request)
            ) as? [String: Any]
        )

        #expect(Set(object.keys) == Set(["operation", "app_id", "environment"]))
        for field in ["tier", "price", "allowance", "receipt", "provider", "validity"] {
            #expect(object[field] == nil)
        }
    }

    @Test("The confirmation phase carries no entitlement of its own")
    func confirmationPhaseCarriesNoEntitlement() {
        let state = PurchaseConfirmationState(phase: .confirmed)

        #expect(state.phase == .confirmed)
        #expect(Mirror(reflecting: state).children.count == 1)
        #expect(FinanceServerConfirmation.allCases.count == 2)
    }

    @Test("Evidence and request descriptions exclude provider identifiers")
    func descriptionsAreRedacted() {
        let token = "synthetic-secret-operation-reference"
        let purchaseEvidence = evidence(token: token)
        let request = FinanceEntitlementConfirmationRequest(
            operation: .confirm,
            context: FinanceEntitlementContext(
                appId: "app_synthetic_apple",
                environment: .sandbox
            ),
            eligibleHousehold: nil
        )

        #expect(!String(describing: purchaseEvidence).contains(token))
        #expect(!String(describing: request).contains(token))
    }
}
