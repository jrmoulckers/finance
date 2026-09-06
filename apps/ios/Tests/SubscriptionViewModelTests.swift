// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

let premiumProjection = FinanceEntitlementProjection(
    userTier: .premium,
    householdTier: nil,
    bankConnectionAllowance: 10,
    isPremiumSponsor: false,
    isFamilyBound: false,
    effectiveAt: Date(timeIntervalSince1970: 1_700_000_000),
    expiresAt: nil,
    projectionVersion: 1,
    serverTime: Date(timeIntervalSince1970: 1_700_000_001),
    status: .current
)

func freeProjection(version: Int64 = 2) -> FinanceEntitlementProjection {
    FinanceEntitlementProjection(
        userTier: .free,
        householdTier: nil,
        bankConnectionAllowance: 0,
        isPremiumSponsor: false,
        isFamilyBound: false,
        effectiveAt: Date(timeIntervalSince1970: 1_700_000_100),
        expiresAt: nil,
        projectionVersion: version,
        serverTime: Date(timeIntervalSince1970: 1_700_000_101),
        status: .current
    )
}

private final class StubSubscriptionService: SubscriptionProviding, @unchecked Sendable {
    private let updateStream: AsyncStream<PurchaseConfirmationState>
    private let updateContinuation: AsyncStream<PurchaseConfirmationState>.Continuation
    var productsToReturn: [SubscriptionProductInfo] = []
    var purchaseState: PurchaseConfirmationState = .idle
    var purchaseHandler: (@Sendable () async -> PurchaseConfirmationState)?
    var entitlementState: PurchaseConfirmationState = .idle
    var restoreState: PurchaseConfirmationState = .idle
    var restoreCalled = false

    init() {
        let updates = AsyncStream.makeStream(
            of: PurchaseConfirmationState.self
        )
        updateStream = updates.stream
        updateContinuation = updates.continuation
    }

    func loadProducts() async -> [SubscriptionProductInfo] {
        productsToReturn
    }

    func purchase(productId _: String) async -> PurchaseConfirmationState {
        if let purchaseHandler {
            return await purchaseHandler()
        }
        updateContinuation.yield(purchaseState)
        return purchaseState
    }

    func checkEntitlement() async -> PurchaseConfirmationState {
        updateContinuation.yield(entitlementState)
        return entitlementState
    }

    func restorePurchases() async -> PurchaseConfirmationState {
        restoreCalled = true
        updateContinuation.yield(restoreState)
        return restoreState
    }

    func confirmationUpdates() async -> AsyncStream<PurchaseConfirmationState> {
        updateStream
    }

    func emit(_ state: PurchaseConfirmationState) {
        updateContinuation.yield(state)
    }
}

private actor PurchaseGate {
    private var started = false
    private var startedContinuation: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?

    func suspendPurchase() async {
        started = true
        startedContinuation?.resume()
        startedContinuation = nil
        await withCheckedContinuation { continuation in
            releaseContinuation = continuation
        }
    }

    func waitUntilStarted() async {
        guard !started else { return }
        await withCheckedContinuation { continuation in
            startedContinuation = continuation
        }
    }

    func release() {
        releaseContinuation?.resume()
        releaseContinuation = nil
    }
}

final class StubNativePurchaseAdapter: NativePurchaseProviding, @unchecked Sendable {
    private let updateStream: AsyncStream<VerifiedPurchaseEvidence>
    private let updateContinuation: AsyncStream<VerifiedPurchaseEvidence>.Continuation
    var products: [SubscriptionProductInfo] = []
    var purchaseResult: NativePurchaseResult = .pending
    var restoreResult: [VerifiedPurchaseEvidence] = []

    init() {
        let updates = AsyncStream.makeStream(
            of: VerifiedPurchaseEvidence.self
        )
        updateStream = updates.stream
        updateContinuation = updates.continuation
    }

    func loadProducts() async -> [SubscriptionProductInfo] {
        products
    }

    func purchase(productId _: String) async throws -> NativePurchaseResult {
        purchaseResult
    }

    func restoreEvidence() async throws -> [VerifiedPurchaseEvidence] {
        restoreResult
    }

    func transactionUpdates() -> AsyncStream<VerifiedPurchaseEvidence> {
        updateStream
    }

    func emitUpdate(_ evidence: VerifiedPurchaseEvidence) {
        updateContinuation.yield(evidence)
    }
}

final class StubEntitlementTransport: AuthenticatedEntitlementTransport, @unchecked Sendable {
    var authenticated = true
    var purchaseResponse: FinanceServerConfirmation = .pending(.free)
    var restoreResponse: FinanceServerConfirmation = .pending(.free)
    var projectionResponse: FinanceServerConfirmation = .confirmed(.free)
    var shouldThrow = false
    var transportError: RevenueCatEntitlementTransportError?
    var purchaseRequests: [FinanceEntitlementConfirmationRequest] = []
    var restoreRequests: [FinanceEntitlementConfirmationRequest] = []

    func isAuthenticated() async -> Bool {
        authenticated
    }

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

    func fetchProjection(
        _: FinanceEntitlementContext,
        eligibleHousehold _: EligibleHouseholdSelection?
    ) async throws -> FinanceServerConfirmation {
        if let transportError { throw transportError }
        if shouldThrow { throw SubscriptionError.confirmationUnavailable }
        return projectionResponse
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

@Suite("SubscriptionViewModel Tests")
struct SubscriptionViewModelTests {
    private func makeProducts() -> [SubscriptionProductInfo] {
        [
            SubscriptionProductInfo(
                id: "synthetic.monthly",
                tier: .monthly,
                displayPrice: "$4.99"
            ),
            SubscriptionProductInfo(
                id: "synthetic.annual",
                tier: .annual,
                displayPrice: "$39.99",
                pricePerMonth: "$3.33",
                isBestValue: true
            ),
        ]
    }

    @Test("Purchase callback cannot grant before server confirmation")
    @MainActor
    func pendingPurchaseDoesNotGrant() async {
        let service = StubSubscriptionService()
        service.purchaseState = PurchaseConfirmationState(
            phase: .pending,
            projection: .free
        )
        let viewModel = SubscriptionViewModel(subscriptionService: service)
        viewModel.selectedProductId = "synthetic.monthly"

        await viewModel.purchaseSelected()

        #expect(viewModel.confirmationState.phase == .pending)
        #expect(!viewModel.isPremium)
        #expect(viewModel.successMessage == nil)
        #expect(viewModel.statusMessage != nil)
    }

    @Test("Only confirmed Finance projection grants")
    @MainActor
    func confirmedProjectionGrants() async {
        let service = StubSubscriptionService()
        service.purchaseState = PurchaseConfirmationState(
            phase: .confirmed,
            projection: premiumProjection
        )
        let viewModel = SubscriptionViewModel(subscriptionService: service)
        viewModel.selectedProductId = "synthetic.monthly"

        await viewModel.purchaseSelected()
        await Task.yield()

        #expect(viewModel.isPremium)
        #expect(viewModel.successMessage != nil)
    }

    @Test("Restore exposes pending without granting")
    @MainActor
    func pendingRestoreDoesNotGrant() async {
        let service = StubSubscriptionService()
        service.restoreState = PurchaseConfirmationState(
            phase: .pending,
            projection: .free
        )
        let viewModel = SubscriptionViewModel(subscriptionService: service)

        await viewModel.restorePurchases()

        #expect(service.restoreCalled)
        #expect(viewModel.confirmationState.phase == .pending)
        #expect(!viewModel.isPremium)
    }

    @Test("Cancellation remains distinct from confirmation error")
    @MainActor
    func cancellationIsNotError() async {
        let service = StubSubscriptionService()
        service.purchaseState = PurchaseConfirmationState(
            phase: .cancelled,
            projection: .free
        )
        let viewModel = SubscriptionViewModel(subscriptionService: service)
        viewModel.selectedProductId = "synthetic.monthly"

        await viewModel.purchaseSelected()

        #expect(viewModel.confirmationState.phase == .cancelled)
        #expect(viewModel.errorMessage == nil)
    }

    @Test("Cancelled and retry operations preserve paid UI access")
    @MainActor
    func transientOperationsPreservePaidAccess() async {
        let service = StubSubscriptionService()
        service.entitlementState = PurchaseConfirmationState(
            phase: .confirmed,
            projection: premiumProjection
        )
        let viewModel = SubscriptionViewModel(subscriptionService: service)
        viewModel.selectedProductId = "synthetic.monthly"
        await viewModel.loadSubscriptionData()
        await Task.yield()

        service.purchaseState = PurchaseConfirmationState(
            phase: .cancelled,
            projection: premiumProjection
        )
        await viewModel.purchaseSelected()
        await Task.yield()
        #expect(viewModel.isPremium)
        #expect(viewModel.confirmationState.phase == .cancelled)

        service.purchaseState = PurchaseConfirmationState(
            phase: .retry,
            projection: premiumProjection
        )
        await viewModel.purchaseSelected()
        await Task.yield()
        #expect(viewModel.isPremium)
        #expect(viewModel.confirmationState.phase == .retry)
    }

    @Test("Async server update reaches view model")
    @MainActor
    func asyncUpdateReachesViewModel() async {
        let service = StubSubscriptionService()
        let viewModel = SubscriptionViewModel(subscriptionService: service)
        await Task.yield()

        service.emit(
            PurchaseConfirmationState(
                phase: .confirmed,
                projection: premiumProjection
            )
        )
        await Task.yield()

        #expect(viewModel.confirmationState.phase == .confirmed)
        #expect(viewModel.isPremium)
    }

    @Test("Streamed denial wins over older method result")
    @MainActor
    func streamedDenialWinsOverOlderResult() async {
        let gate = PurchaseGate()
        let service = StubSubscriptionService()
        service.purchaseHandler = {
            await gate.suspendPurchase()
            return PurchaseConfirmationState(
                phase: .confirmed,
                projection: premiumProjection
            )
        }
        let viewModel = SubscriptionViewModel(subscriptionService: service)
        viewModel.selectedProductId = "synthetic.monthly"

        service.emit(
            PurchaseConfirmationState(
                phase: .confirmed,
                projection: premiumProjection
            )
        )
        await Task.yield()
        #expect(viewModel.isPremium)

        let purchaseTask = Task { @MainActor in
            await viewModel.purchaseSelected()
        }
        await gate.waitUntilStarted()
        service.emit(
            PurchaseConfirmationState(
                phase: .confirmed,
                projection: .free
            )
        )
        await Task.yield()
        await gate.release()
        await purchaseTask.value

        #expect(!viewModel.isPremium)
        #expect(viewModel.entitlement.projection == .free)
    }

    @Test("Loads products and defaults to best value")
    @MainActor
    func loadsProducts() async {
        let service = StubSubscriptionService()
        service.productsToReturn = makeProducts()
        service.entitlementState = PurchaseConfirmationState(
            phase: .confirmed,
            projection: .free
        )
        let viewModel = SubscriptionViewModel(subscriptionService: service)

        await viewModel.loadSubscriptionData()

        #expect(viewModel.products.count == 2)
        #expect(viewModel.selectedProductId == "synthetic.annual")
        #expect(!viewModel.isPremium)
    }
}
