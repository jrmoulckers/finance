// SPDX-License-Identifier: BUSL-1.1

// SubscriptionViewModelTests.swift
// FinanceTests
//
// Unit tests for SubscriptionViewModel.
//
// References: #338

import Foundation
import SwiftUI
import Testing
@testable import FinanceApp

// MARK: - Stub Subscription Service

final class StubSubscriptionService: SubscriptionProviding, @unchecked Sendable {
    var productsToReturn: [SubscriptionProductInfo] = []
    var entitlementToReturn: EntitlementState = .free
    var purchaseResult: Bool = true
    var purchaseError: Error?
    var restoreCalled = false

    func loadProducts() async -> [SubscriptionProductInfo] {
        productsToReturn
    }

    func purchase(productId: String) async throws -> Bool {
        if let error = purchaseError { throw error }
        return purchaseResult
    }

    func checkEntitlement() async -> EntitlementState {
        entitlementToReturn
    }

    func restorePurchases() async {
        restoreCalled = true
    }
}

// MARK: - SubscriptionViewModel Tests

@Suite("SubscriptionViewModel Tests")
struct SubscriptionViewModelTests {

    private func makeProducts() -> [SubscriptionProductInfo] {
        [
            SubscriptionProductInfo(
                id: "com.finance.premium.monthly",
                tier: .monthly,
                displayPrice: "$4.99",
                isBestValue: false
            ),
            SubscriptionProductInfo(
                id: "com.finance.premium.annual",
                tier: .annual,
                displayPrice: "$39.99",
                pricePerMonth: "$3.33",
                isBestValue: true
            ),
        ]
    }

    @Test("Loads products and entitlement")
    @MainActor
    func loadsProductsAndEntitlement() async {
        let service = StubSubscriptionService()
        service.productsToReturn = makeProducts()
        service.entitlementToReturn = .free

        let vm = SubscriptionViewModel(subscriptionService: service)
        await vm.loadSubscriptionData()

        #expect(vm.products.count == 2)
        #expect(vm.entitlement == .free)
        #expect(!vm.isPremium)
        #expect(!vm.isLoading)
    }

    @Test("Auto-selects best value plan")
    @MainActor
    func autoSelectsBestValue() async {
        let service = StubSubscriptionService()
        service.productsToReturn = makeProducts()

        let vm = SubscriptionViewModel(subscriptionService: service)
        await vm.loadSubscriptionData()

        #expect(vm.selectedProductId == "com.finance.premium.annual")
    }

    @Test("Purchase succeeds and updates entitlement")
    @MainActor
    func purchaseSucceeds() async {
        let service = StubSubscriptionService()
        service.productsToReturn = makeProducts()
        service.purchaseResult = true
        service.entitlementToReturn = .premium(tier: .monthly, expiresAt: Date().addingTimeInterval(30 * 24 * 3600))

        let vm = SubscriptionViewModel(subscriptionService: service)
        await vm.loadSubscriptionData()
        vm.selectedProductId = "com.finance.premium.monthly"

        await vm.purchaseSelected()

        #expect(vm.isPremium)
        #expect(vm.successMessage != nil)
        #expect(!vm.isPurchasing)
    }

    @Test("Purchase failure shows error")
    @MainActor
    func purchaseFailureShowsError() async {
        let service = StubSubscriptionService()
        service.productsToReturn = makeProducts()
        service.purchaseError = SubscriptionError.purchaseFailed

        let vm = SubscriptionViewModel(subscriptionService: service)
        await vm.loadSubscriptionData()
        vm.selectedProductId = "com.finance.premium.monthly"

        await vm.purchaseSelected()

        #expect(vm.errorMessage != nil)
        #expect(!vm.isPurchasing)
    }

    @Test("Purchase without selection shows error")
    @MainActor
    func purchaseWithoutSelection() async {
        let service = StubSubscriptionService()
        let vm = SubscriptionViewModel(subscriptionService: service)
        vm.selectedProductId = nil

        await vm.purchaseSelected()

        #expect(vm.errorMessage != nil)
    }

    @Test("Restore triggers service and refreshes entitlement")
    @MainActor
    func restorePurchases() async {
        let service = StubSubscriptionService()
        service.entitlementToReturn = .premium(tier: .annual, expiresAt: nil)

        let vm = SubscriptionViewModel(subscriptionService: service)
        await vm.restorePurchases()

        #expect(service.restoreCalled)
        #expect(vm.isPremium)
        #expect(vm.successMessage != nil)
    }

    @Test("Feature availability for premium users")
    @MainActor
    func featureAvailability() async {
        let service = StubSubscriptionService()
        service.entitlementToReturn = .premium(tier: .monthly, expiresAt: nil)

        let vm = SubscriptionViewModel(subscriptionService: service)
        await vm.loadSubscriptionData()

        for feature in PremiumFeature.allCases {
            #expect(vm.isFeatureAvailable(feature))
        }
    }

    @Test("Entitlement states are correct")
    @MainActor
    func entitlementStates() {
        let free = EntitlementState.free
        #expect(!free.isPremium)
        #expect(free.displayName == String(localized: "Free Plan"))

        let premium = EntitlementState.premium(tier: .monthly, expiresAt: nil)
        #expect(premium.isPremium)

        let expired = EntitlementState.expired
        #expect(!expired.isPremium)

        let grace = EntitlementState.gracePeriod(expiresAt: Date())
        #expect(grace.isPremium)
    }
}
