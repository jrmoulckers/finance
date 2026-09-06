// SPDX-License-Identifier: BUSL-1.1

// SubscriptionViewModel.swift
// Finance
//
// ViewModel for the subscription paywall and management screen.
//
// The displayed plan comes from the minimized entitlement projection through
// ``EntitlementStore``. StoreKit only reports what happened to an operation;
// it never determines what the user is entitled to, and nothing here
// authorizes a paid server action.
//
// References: #338, #4403

import Observation
import os
import SwiftUI

@MainActor
@Observable
final class SubscriptionViewModel {
    private let subscriptionService: any SubscriptionProviding
    @ObservationIgnored
    private let entitlementStore: EntitlementStore
    @ObservationIgnored
    private nonisolated(unsafe) var updateTask: Task<Void, Never>?

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SubscriptionViewModel"
    )

    // MARK: - Published State

    /// Available store offers.
    var products: [SubscriptionProductInfo] = []

    /// Current server-confirmation phase of a purchase or restore.
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

    /// Display-only entitlement presentation, including its degraded states.
    var entitlement: EntitlementDisplayState { entitlementStore.state }

    /// Plans as the ratified catalog states them.
    var plans: [CatalogPlan] { PaywallCatalog.plans }

    /// Whether the screen should present the paid-plan management section.
    ///
    /// Display only: the server re-reads its projection for any paid action.
    var showsManagedSubscription: Bool {
        entitlement.tier != .free
    }

    /// Spoken and visible explanation of the current entitlement state.
    var entitlementHeadline: String { EntitlementStatusMessages.headline(entitlement) }
    var entitlementDetail: String { EntitlementStatusMessages.detail(entitlement) }

    // MARK: - Init

    init(
        subscriptionService: any SubscriptionProviding = SubscriptionService.shared,
        entitlementStore: EntitlementStore = .shared
    ) {
        self.subscriptionService = subscriptionService
        self.entitlementStore = entitlementStore
        updateTask = Task { [weak self, subscriptionService, entitlementStore] in
            await subscriptionService.attachEntitlementRefresher(entitlementStore)
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

    /// Loads store offers and the current entitlement projection.
    func loadSubscriptionData() async {
        isLoading = true
        defer { isLoading = false }

        await entitlementStore.restoreCachedSnapshot()
        async let loadedProducts = subscriptionService.loadProducts()
        async let refreshed: Void = entitlementStore.refresh()

        products = await loadedProducts
        await refreshed

        // Auto-select annual (best value) by default
        if selectedProductId == nil {
            selectedProductId = products.first(where: { $0.isBestValue })?.id
                ?? products.first?.id
        }

        Self.logger.debug("Subscription data loaded")
    }

    /// Re-reads the projection, e.g. when returning to the screen.
    func refreshEntitlement() async {
        await entitlementStore.refresh()
    }

    /// Re-evaluates server-issued bounds after a foreground transition.
    func refreshEntitlementIfNeeded() async {
        await entitlementStore.refreshIfNeeded()
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
        case .confirmed:
            successMessage = String(localized: "Your purchase was confirmed by Finance.")
            Self.logger.info("Purchase confirmed")
        case .pending:
            statusMessage = String(
                localized: "Your purchase is pending confirmation. Access has not changed yet."
            )
        case .retry:
            statusMessage = String(
                localized: "Finance could not confirm the purchase yet. It will be retried."
            )
        case .error:
            errorMessage = String(localized: "Finance could not confirm this purchase.")
        case .cancelled, .idle:
            statusMessage = nil
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
        case .confirmed:
            successMessage = String(localized: "Your purchases were confirmed by Finance.")
        case .pending:
            statusMessage = String(
                localized: "Your restored purchases are pending confirmation."
            )
        case .retry:
            statusMessage = String(
                localized: """
                Finance could not confirm restored purchases yet. It will be retried.
                """
            )
        case .error:
            errorMessage = String(localized: "Finance could not confirm restored purchases.")
        case .cancelled, .idle:
            break
        }

        Self.logger.info("Restore flow completed")
    }

    private func applyStreamState(_ state: PurchaseConfirmationState) {
        confirmationState = state
    }

    private func applyOperationPhase(_ phase: PurchaseConfirmationPhase) {
        confirmationState = PurchaseConfirmationState(phase: phase)
    }
}
