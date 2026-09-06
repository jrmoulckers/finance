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

@MainActor
@Observable
final class SubscriptionViewModel {
    private let subscriptionService: SubscriptionProviding
    private var updateTask: Task<Void, Never>?

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SubscriptionViewModel"
    )

    // MARK: - Published State

    /// Available subscription products.
    var products: [SubscriptionProductInfo] = []

    /// Current entitlement state.
    var entitlement: EntitlementState = .free

    /// Current server-confirmation phase.
    var confirmationState: PurchaseConfirmationState = .idle

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

    /// Non-error status for pending or retryable confirmation.
    var statusMessage: String?

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    var showSuccess: Bool { successMessage != nil }
    func dismissSuccess() { successMessage = nil }

    /// Whether the user has an active premium subscription.
    var isPremium: Bool { entitlement.isPremium }

    /// Checks if a specific premium feature is available.
    func isFeatureAvailable(_ feature: PremiumFeature) -> Bool {
        isPremium || feature.isFreeTier
    }

    // MARK: - Init

    init(subscriptionService: SubscriptionProviding = SubscriptionService.shared) {
        self.subscriptionService = subscriptionService
        updateTask = Task { [weak self, subscriptionService] in
            let updates = await subscriptionService.confirmationUpdates()
            for await state in updates {
                guard let self else { return }
                self.applyStreamState(state)
            }
        }
    }

    deinit {
        updateTask?.cancel()
    }

    // MARK: - Data Loading

    /// Loads products and checks current entitlement.
    func loadSubscriptionData() async {
        isLoading = true
        defer { isLoading = false }

        async let loadedProducts = subscriptionService.loadProducts()
        async let currentEntitlement = subscriptionService.checkEntitlement()

        products = await loadedProducts
        applyOperationPhase((await currentEntitlement).phase)

        // Auto-select annual (best value) by default
        if selectedProductId == nil {
            selectedProductId = products.first(where: { $0.isBestValue })?.id
                ?? products.first?.id
        }

        Self.logger.debug("Subscription data loaded")
    }

    // MARK: - Purchase

    /// Initiates a purchase for the selected product.
    func purchaseSelected() async {
        guard let productId = selectedProductId else {
            errorMessage = String(localized: "Please select a subscription plan.")
            return
        }

        errorMessage = nil
        successMessage = nil
        statusMessage = nil
        isPurchasing = true
        defer { isPurchasing = false }

        let result = await subscriptionService.purchase(productId: productId)
        applyOperationPhase(result.phase)

        switch result.phase {
        case .confirmed where result.projection.authorizesNewCostIncurringActions:
            successMessage = String(localized: "Your purchase was confirmed by Finance.")
            Self.logger.info("Purchase confirmed")
        case .pending:
            statusMessage = String(localized: "Your purchase is pending confirmation. Access has not changed yet.")
        case .retry:
            statusMessage = String(localized: "Finance could not confirm the purchase yet. It will be retried.")
        case .error:
            errorMessage = String(localized: "Finance could not confirm this purchase.")
        case .cancelled:
            statusMessage = nil
        case .confirmed, .idle:
            break
        }
    }

    // MARK: - Restore

    /// Restores previous purchases.
    func restorePurchases() async {
        errorMessage = nil
        successMessage = nil
        statusMessage = nil
        isRestoring = true
        defer { isRestoring = false }

        let result = await subscriptionService.restorePurchases()
        applyOperationPhase(result.phase)

        switch result.phase {
        case .confirmed where result.projection.authorizesNewCostIncurringActions:
            successMessage = String(localized: "Your purchases were confirmed by Finance.")
        case .pending:
            statusMessage = String(localized: "Your restored purchases are pending confirmation.")
        case .retry:
            statusMessage = String(localized: "Finance could not confirm restored purchases yet. It will be retried.")
        case .error:
            errorMessage = String(localized: "Finance could not confirm restored purchases.")
        case .cancelled, .confirmed, .idle:
            break
        }

        Self.logger.info("Restore flow completed")
    }

    /// Refreshes entitlement status.
    func refreshEntitlement() async {
        applyOperationPhase((await subscriptionService.checkEntitlement()).phase)
    }

    private func applyStreamState(_ state: PurchaseConfirmationState) {
        confirmationState = state
        entitlement = EntitlementState(projection: state.projection)
    }

    private func applyOperationPhase(_ phase: PurchaseConfirmationPhase) {
        confirmationState = PurchaseConfirmationState(
            phase: phase,
            projection: entitlement.projection
        )
    }
}
