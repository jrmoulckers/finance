// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

private final class StubSubscriptionService: SubscriptionProviding, @unchecked Sendable {
    private let updateStream: AsyncStream<PurchaseConfirmationState>
    private let updateContinuation: AsyncStream<PurchaseConfirmationState>.Continuation
    var productsToReturn: [SubscriptionProductInfo] = []
    var purchaseState: PurchaseConfirmationState = .idle
    var restoreState: PurchaseConfirmationState = .idle
    var restoreCalled = false
    var attachedRefresher: (any EntitlementRefreshing)?

    init() {
        let updates = AsyncStream.makeStream(of: PurchaseConfirmationState.self)
        updateStream = updates.stream
        updateContinuation = updates.continuation
    }

    func loadProducts() async -> [SubscriptionProductInfo] { productsToReturn }

    func purchase(productId _: String) async -> PurchaseConfirmationState {
        updateContinuation.yield(purchaseState)
        return purchaseState
    }

    func restorePurchases() async -> PurchaseConfirmationState {
        restoreCalled = true
        updateContinuation.yield(restoreState)
        return restoreState
    }

    func confirmationUpdates() async -> AsyncStream<PurchaseConfirmationState> { updateStream }

    func attachEntitlementRefresher(_ refresher: any EntitlementRefreshing) async {
        attachedRefresher = refresher
    }

    func emit(_ state: PurchaseConfirmationState) {
        updateContinuation.yield(state)
    }
}

private actor StubProjectionRepository: EntitlementRepository {
    private var result: EntitlementResult

    init(result: EntitlementResult) {
        self.result = result
    }

    func setResult(_ result: EntitlementResult) {
        self.result = result
    }

    private struct FixedSubscriptionUserScopeProvider: EntitlementUserScopeProviding {
        func currentUserScope() async -> String? { "user-a" }
    }

    func load(household _: EligibleHouseholdSelection?) async -> EntitlementResult {
        result
    }
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

    @MainActor
    private func makeStore(
        result: EntitlementResult,
        now: Date = EntitlementFixtures.insideBounds
    ) -> EntitlementStore {
        EntitlementStore(
            repository: StubProjectionRepository(result: result),
            snapshotStore: InMemoryEntitlementSnapshotStore(),
            userScopeProvider: FixedSubscriptionUserScopeProvider(),
            now: { now }
        )
    }

    @Test("The displayed plan comes from the projection, not from a purchase")
    @MainActor
    func planComesFromProjection() async {
        let service = StubSubscriptionService()
        service.purchaseState = PurchaseConfirmationState(phase: .confirmed)
        let store = makeStore(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
        )
        let viewModel = SubscriptionViewModel(
            subscriptionService: service,
            entitlementStore: store
        )

        await viewModel.refreshEntitlement()
        viewModel.selectedProductId = "synthetic.monthly"
        await viewModel.purchaseSelected()

        #expect(viewModel.confirmationState.phase == .confirmed)
        #expect(viewModel.entitlement.tier == .premium)
        #expect(viewModel.showsManagedSubscription)
    }

    @Test("A pending purchase never claims a plan change")
    @MainActor
    func pendingPurchaseClaimsNothing() async {
        let service = StubSubscriptionService()
        service.purchaseState = PurchaseConfirmationState(phase: .pending)
        let viewModel = SubscriptionViewModel(
            subscriptionService: service,
            entitlementStore: makeStore(result: .unavailable(.projectionUnavailable))
        )

        await viewModel.refreshEntitlement()
        viewModel.selectedProductId = "synthetic.monthly"
        await viewModel.purchaseSelected()

        #expect(viewModel.confirmationState.phase == .pending)
        #expect(viewModel.statusMessage != nil)
        #expect(viewModel.entitlement.tier == .free)
        #expect(viewModel.entitlement.status == .unavailable)
    }

    @Test("A confirmed projection drives the managed-subscription surface")
    @MainActor
    func confirmedProjectionShowsManagement() async {
        let store = makeStore(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.family())
        )
        let viewModel = SubscriptionViewModel(
            subscriptionService: StubSubscriptionService(),
            entitlementStore: store
        )

        await viewModel.refreshEntitlement()

        #expect(viewModel.entitlement.tier == .family)
        #expect(viewModel.entitlement.bankConnectionAllowance == 4)
        #expect(viewModel.showsManagedSubscription)
        #expect(viewModel.entitlementHeadline == EntitlementStatusMessages.planName(.family))
    }

    @Test("Loading products defaults to the best-value offer")
    @MainActor
    func loadingDefaultsToBestValue() async {
        let service = StubSubscriptionService()
        service.productsToReturn = makeProducts()
        let viewModel = SubscriptionViewModel(
            subscriptionService: service,
            entitlementStore: makeStore(
                result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
            )
        )

        await viewModel.loadSubscriptionData()

        #expect(viewModel.products.count == 2)
        #expect(viewModel.selectedProductId == "synthetic.annual")
        #expect(viewModel.entitlement.status == .current)
        #expect(viewModel.entitlement.tier == .premium)
    }

    @Test("Restore reports its phase without changing the plan")
    @MainActor
    func restoreReportsPhaseOnly() async {
        let service = StubSubscriptionService()
        service.restoreState = PurchaseConfirmationState(phase: .retry)
        let store = makeStore(
            result: MinimizedEntitlementCodec.decode(EntitlementFixtures.premium())
        )
        let viewModel = SubscriptionViewModel(
            subscriptionService: service,
            entitlementStore: store
        )

        await viewModel.refreshEntitlement()
        await viewModel.restorePurchases()

        #expect(service.restoreCalled)
        #expect(viewModel.confirmationState.phase == .retry)
        #expect(viewModel.statusMessage != nil)
        #expect(viewModel.entitlement.tier == .premium)
    }

    @Test("Streamed confirmation updates reach the view model")
    @MainActor
    func streamedUpdatesReachViewModel() async {
        let service = StubSubscriptionService()
        let viewModel = SubscriptionViewModel(
            subscriptionService: service,
            entitlementStore: makeStore(result: .unavailable(.offline))
        )

        // Give the stream task a turn before emitting.
        await Task.yield()
        service.emit(PurchaseConfirmationState(phase: .pending))

        var attempts = 0
        while viewModel.confirmationState.phase != .pending, attempts < 50 {
            await Task.yield()
            attempts += 1
        }

        #expect(viewModel.confirmationState.phase == .pending)
    }

    @Test("The plan catalog states only ratified obligations")
    @MainActor
    func catalogStatesOnlyRatifiedObligations() {
        let viewModel = SubscriptionViewModel(
            subscriptionService: StubSubscriptionService(),
            entitlementStore: makeStore(result: .unavailable(.offline))
        )
        let forbidden = [
            "export", "history", "delete", "privacy", "accessib",
            "budget", "goal", "account", "insight", "report", "support", "trial",
        ]

        for plan in viewModel.plans where plan.tier != .free {
            let claims = ([plan.bankConnections] + plan.notes)
                .joined(separator: " ")
                .lowercased()
            for term in forbidden {
                #expect(!claims.contains(term), "\(plan.displayName) must not gate \(term)")
            }
        }

        let free = viewModel.plans.first { $0.tier == .free }
        let freeCopy = (free?.notes ?? []).joined(separator: " ").lowercased()
        #expect(freeCopy.contains("export"))
        #expect(freeCopy.contains("history"))
    }

    @Test("Paid plan capacity matches the shared catalog")
    func paidCapacityMatchesCatalog() {
        let premium = PaywallCatalog.plans.first { $0.tier == .premium }
        let family = PaywallCatalog.plans.first { $0.tier == .family }

        #expect(
            premium?.bankConnections.contains(
                "\(EntitlementCatalog.baseBankConnectionAllowance(.premium))"
            ) == true
        )
        #expect(
            family?.bankConnections.contains(
                "\(EntitlementCatalog.baseBankConnectionAllowance(.family))"
            ) == true
        )
    }

    @Test("Every confirmation phase except idle is announced")
    func confirmationPhasesAreAnnounced() {
        #expect(EntitlementStatusMessages.confirmationMessage(.idle) == nil)
        for phase in PurchaseConfirmationPhase.allCases where phase != .idle {
            #expect(EntitlementStatusMessages.confirmationMessage(phase) != nil)
        }
    }
}
