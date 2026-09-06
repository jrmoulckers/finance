// SPDX-License-Identifier: BUSL-1.1

import Foundation
import os

protocol SubscriptionProviding: Sendable {
    func loadProducts() async -> [SubscriptionProductInfo]
    func purchase(productId: String) async -> PurchaseConfirmationState
    func checkEntitlement() async -> PurchaseConfirmationState
    func restorePurchases() async -> PurchaseConfirmationState
}

/// Coordinates native purchase evidence with Finance's entitlement authority.
///
/// Verified store evidence is submitted through an authenticated transport.
/// Transactions are finished only after Finance confirms them. Pending,
/// unavailable, and failed confirmations remain unfinished so StoreKit can
/// replay them safely.
actor SubscriptionService: SubscriptionProviding {
    static let shared = SubscriptionService()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SubscriptionService"
    )

    private let purchaseAdapter: any NativePurchaseProviding
    private let transport: any AuthenticatedEntitlementTransport
    private let context: FinanceEntitlementContext
    private var projection: FinanceEntitlementProjection = .free
    private var updateListenerTask: Task<Void, Never>?

    init(
        purchaseAdapter: any NativePurchaseProviding = StoreKitPurchaseAdapter(),
        transport: any AuthenticatedEntitlementTransport = UnavailableEntitlementTransport(),
        environment: FinanceClientEnvironment = .development,
        eligibleHouseholdIntent: String? = nil
    ) {
        self.purchaseAdapter = purchaseAdapter
        self.transport = transport
        self.context = FinanceEntitlementContext(
            application: .finance,
            environment: environment,
            eligibleHouseholdIntent: eligibleHouseholdIntent
        )
    }

    deinit {
        updateListenerTask?.cancel()
    }

    func loadProducts() async -> [SubscriptionProductInfo] {
        ensureListeningForUpdates()
        let products = await purchaseAdapter.loadProducts()
        Self.logger.info("Subscription offers loaded")
        return products
    }

    func purchase(productId: String) async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
        do {
            switch try await purchaseAdapter.purchase(productId: productId) {
            case .cancelled:
                Self.logger.info("Purchase cancelled")
                return state(.cancelled)
            case .pending:
                Self.logger.info("Purchase awaiting provider completion")
                return state(.pending)
            case .verified(let evidence):
                return await confirm(evidence, operation: .purchase)
            }
        } catch {
            Self.logger.error("Purchase flow failed")
            return state(.error)
        }
    }

    func checkEntitlement() async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
        guard await transport.isAuthenticated() else {
            return state(.error)
        }

        do {
            return apply(try await transport.fetchProjection(context))
        } catch {
            Self.logger.notice("Entitlement confirmation should be retried")
            return state(.retry)
        }
    }

    func restorePurchases() async -> PurchaseConfirmationState {
        ensureListeningForUpdates()
        do {
            let evidenceItems = try await purchaseAdapter.restoreEvidence()
            guard !evidenceItems.isEmpty else {
                return await checkEntitlement()
            }

            var latest = state(.pending)
            for evidence in evidenceItems {
                latest = await confirm(evidence, operation: .restore)
            }
            return latest
        } catch {
            Self.logger.error("Purchase restore failed")
            return state(.error)
        }
    }

    private enum ConfirmationOperation {
        case purchase
        case restore
    }

    private func ensureListeningForUpdates() {
        guard updateListenerTask == nil else { return }
        let purchaseAdapter = purchaseAdapter
        updateListenerTask = Task { [weak self] in
            for await evidence in purchaseAdapter.transactionUpdates() {
                guard let self else { return }
                _ = await self.confirm(evidence, operation: .purchase)
            }
        }
    }

    private func confirm(
        _ evidence: VerifiedPurchaseEvidence,
        operation: ConfirmationOperation
    ) async -> PurchaseConfirmationState {
        guard await transport.isAuthenticated() else {
            Self.logger.error("Purchase confirmation requires authentication")
            return state(.error)
        }

        let request = FinanceEntitlementConfirmationRequest(
            context: context,
            provider: evidence.provider,
            opaqueEvidence: evidence.opaqueValue
        )

        do {
            let response: FinanceServerConfirmation
            switch operation {
            case .purchase:
                response = try await transport.confirmPurchase(request)
            case .restore:
                response = try await transport.confirmRestore(request)
            }

            let confirmationState = apply(response)
            if case .confirmed = response {
                await evidence.finish()
                Self.logger.info("Purchase evidence confirmed")
            }
            return confirmationState
        } catch {
            Self.logger.notice("Purchase confirmation should be retried")
            return state(.retry)
        }
    }

    private func apply(
        _ response: FinanceServerConfirmation
    ) -> PurchaseConfirmationState {
        projection = response.projection
        switch response {
        case .pending:
            return state(.pending)
        case .confirmed:
            return state(.confirmed)
        case .error:
            return state(.error)
        }
    }

    private func state(_ phase: PurchaseConfirmationPhase) -> PurchaseConfirmationState {
        PurchaseConfirmationState(phase: phase, projection: projection)
    }
}

enum SubscriptionError: Error, LocalizedError, Sendable {
    case productNotFound
    case purchaseFailed
    case verificationFailed
    case confirmationUnavailable

    var errorDescription: String? {
        switch self {
        case .productNotFound:
            String(localized: "Product not found. Please try again.")
        case .purchaseFailed:
            String(localized: "Purchase failed. Please try again.")
        case .verificationFailed:
            String(localized: "Transaction could not be verified.")
        case .confirmationUnavailable:
            String(localized: "Purchase confirmation is temporarily unavailable.")
        }
    }
}
