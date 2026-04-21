// SPDX-License-Identifier: BUSL-1.1

// SubscriptionViewModel.swift
// Finance
//
// ViewModel for the premium subscription paywall and management screens.
// Coordinates between StoreKit 2 and the UI layer.
//
// Uses @Observable and structured concurrency.
//
// References: #338

import Observation
import os
import SwiftUI

@Observable
final class SubscriptionViewModel {
    private let subscriptionService: SubscriptionProviding

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SubscriptionViewModel"
    )

    // MARK: - Published State

    /// Available subscription products.
    var products: [SubscriptionProductInfo] = []

    /// Current entitlement state.
    var entitlement: EntitlementState = .free

    /// The product ID selected by the user.
    var selectedProductId: String?

    /// Whether products are loading.
    var isLoading = false

    /// Whether a purchase is in progress.
    var isPurchasing = false

    /// Whether a restore is in progress.
    var isRestoring = false

    /// Error message for alerts.
    var errorMessage: String?

    /// Success message after purchase.
    var successMessage: String?

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    var showSuccess: Bool { successMessage != nil }
    func dismissSuccess() { successMessage = nil }

    /// Whether the user has an active premium subscription.
    var isPremium: Bool { entitlement.isPremium }

    /// Checks if a specific premium feature is available.
    func isFeatureAvailable(_ feature: PremiumFeature) -> Bool {
        entitlement.isPremium || feature.isFreeTier
    }

    // MARK: - Init

    init(subscriptionService: SubscriptionProviding = SubscriptionService.shared) {
        self.subscriptionService = subscriptionService
    }

    // MARK: - Data Loading

    /// Loads products and checks current entitlement.
    func loadSubscriptionData() async {
        isLoading = true
        defer { isLoading = false }

        async let loadedProducts = subscriptionService.loadProducts()
        async let currentEntitlement = subscriptionService.checkEntitlement()

        products = await loadedProducts
        entitlement = await currentEntitlement

        // Auto-select annual (best value) by default
        if selectedProductId == nil {
            selectedProductId = products.first(where: { $0.isBestValue })?.id
                ?? products.first?.id
        }

        Self.logger.debug(
            "Subscription data loaded: \(self.products.count, privacy: .public) products, entitlement: \(self.entitlement.displayName, privacy: .public)"
        )
    }

    // MARK: - Purchase

    /// Initiates a purchase for the selected product.
    func purchaseSelected() async {
        guard let productId = selectedProductId else {
            errorMessage = String(localized: "Please select a subscription plan.")
            return
        }

        isPurchasing = true
        defer { isPurchasing = false }

        do {
            let success = try await subscriptionService.purchase(productId: productId)

            if success {
                entitlement = await subscriptionService.checkEntitlement()
                successMessage = String(localized: "Welcome to Finance Premium! You now have full access to all features.")

                Self.logger.info(
                    "Purchase completed: \(productId, privacy: .public)"
                )
            }
        } catch {
            errorMessage = error.localizedDescription
            Self.logger.error(
                "Purchase failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    // MARK: - Restore

    /// Restores previous purchases.
    func restorePurchases() async {
        isRestoring = true
        defer { isRestoring = false }

        await subscriptionService.restorePurchases()
        entitlement = await subscriptionService.checkEntitlement()

        if entitlement.isPremium {
            successMessage = String(localized: "Purchases restored! Your premium subscription is active.")
        }

        Self.logger.info(
            "Restore completed, entitlement: \(self.entitlement.displayName, privacy: .public)"
        )
    }

    /// Refreshes entitlement status.
    func refreshEntitlement() async {
        entitlement = await subscriptionService.checkEntitlement()
    }
}
