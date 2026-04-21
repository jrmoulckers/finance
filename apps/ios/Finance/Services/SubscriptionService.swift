// SPDX-License-Identifier: BUSL-1.1

// SubscriptionService.swift
// Finance
//
// StoreKit 2 integration for premium subscription management.
// Handles product fetching, purchases, transaction verification,
// and entitlement checking.
//
// Uses async/await with StoreKit 2 APIs (Product, Transaction).
//
// References: #338

import Foundation
import os
import StoreKit

// MARK: - SubscriptionProviding Protocol

/// Abstraction for subscription management — testable without StoreKit.
protocol SubscriptionProviding: Sendable {
    func loadProducts() async -> [SubscriptionProductInfo]
    func purchase(productId: String) async throws -> Bool
    func checkEntitlement() async -> EntitlementState
    func restorePurchases() async
}

// MARK: - SubscriptionService

/// Manages premium subscription lifecycle via StoreKit 2.
///
/// Responsibilities:
/// 1. Fetch available subscription products
/// 2. Initiate and verify purchases
/// 3. Check current entitlement status
/// 4. Listen for transaction updates (renewals, revocations)
/// 5. Restore purchases on new devices
///
/// > Important: All transaction verification happens through StoreKit 2's
/// > built-in JWS verification. Server-side verification should be added
/// > via App Store Server API v2 in a future sprint.
actor SubscriptionService: SubscriptionProviding {

    // MARK: - Singleton

    static let shared = SubscriptionService()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SubscriptionService"
    )

    /// Product identifiers for subscription plans.
    private static let productIds: Set<String> = [
        SubscriptionTier.monthly.productId,
        SubscriptionTier.annual.productId,
    ]

    // MARK: - State

    private var products: [Product] = []
    private var updateListenerTask: Task<Void, Error>?

    init() {
        // Start listening for transaction updates
        updateListenerTask = listenForTransactions()
    }

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Product Loading

    /// Fetches available subscription products from the App Store.
    func loadProducts() async -> [SubscriptionProductInfo] {
        do {
            products = try await Product.products(for: Self.productIds)

            let infos = products.compactMap { product -> SubscriptionProductInfo? in
                guard let tier = tierForProduct(product) else { return nil }

                let pricePerMonth: String?
                if tier == .annual {
                    let monthlyPrice = product.price / 12
                    pricePerMonth = monthlyPrice.formatted(.currency(code: product.priceFormatStyle.currencyCode ?? "USD"))
                } else {
                    pricePerMonth = nil
                }

                return SubscriptionProductInfo(
                    id: product.id,
                    tier: tier,
                    displayPrice: product.displayPrice,
                    pricePerMonth: pricePerMonth,
                    isBestValue: tier == .annual
                )
            }
            .sorted { $0.tier == .annual && $1.tier != .annual }

            Self.logger.info(
                "Loaded \(infos.count, privacy: .public) subscription products"
            )
            return infos
        } catch {
            Self.logger.error(
                "Product load failed: \(error.localizedDescription, privacy: .public)"
            )
            return []
        }
    }

    // MARK: - Purchase

    /// Initiates a purchase for the given product ID.
    ///
    /// - Returns: `true` if purchase succeeded, `false` if cancelled.
    /// - Throws: On purchase failures.
    func purchase(productId: String) async throws -> Bool {
        guard let product = products.first(where: { $0.id == productId }) else {
            throw SubscriptionError.productNotFound
        }

        let result = try await product.purchase()

        switch result {
        case .success(let verification):
            let transaction = try checkVerified(verification)
            await transaction.finish()
            Self.logger.info(
                "Purchase successful: \(productId, privacy: .public)"
            )
            return true

        case .userCancelled:
            Self.logger.debug("Purchase cancelled by user")
            return false

        case .pending:
            Self.logger.info("Purchase pending (Ask to Buy or deferred)")
            return false

        @unknown default:
            Self.logger.warning("Unknown purchase result")
            return false
        }
    }

    // MARK: - Entitlement

    /// Checks the current subscription entitlement status.
    func checkEntitlement() async -> EntitlementState {
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(result) else {
                continue
            }

            // Check if this is one of our subscription products
            guard Self.productIds.contains(transaction.productID) else {
                continue
            }

            // Check revocation
            if transaction.revocationDate != nil {
                continue
            }

            let tier = tierForProductId(transaction.productID)

            // Check expiration
            if let expirationDate = transaction.expirationDate {
                if expirationDate > Date() {
                    return .premium(tier: tier, expiresAt: expirationDate)
                } else {
                    // Check if in grace period (within 16 days of expiry per Apple)
                    let gracePeriodEnd = expirationDate.addingTimeInterval(16 * 24 * 60 * 60)
                    if gracePeriodEnd > Date() {
                        return .gracePeriod(expiresAt: gracePeriodEnd)
                    }
                    return .expired
                }
            }

            return .premium(tier: tier, expiresAt: nil)
        }

        return .free
    }

    // MARK: - Restore

    /// Restores previous purchases.
    func restorePurchases() async {
        do {
            try await AppStore.sync()
            Self.logger.info("Purchases restored successfully")
        } catch {
            Self.logger.error(
                "Restore failed: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    // MARK: - Transaction Listener

    /// Listens for real-time transaction updates (renewals, refunds, etc.).
    private func listenForTransactions() -> Task<Void, Error> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if let transaction = try? await self.checkVerified(result) {
                    await transaction.finish()
                    Self.logger.debug(
                        "Transaction update processed: \(transaction.productID, privacy: .public)"
                    )
                }
            }
        }
    }

    // MARK: - Verification

    /// Verifies a transaction's JWS signature.
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            Self.logger.error(
                "Transaction verification failed: \(error.localizedDescription, privacy: .public)"
            )
            throw SubscriptionError.verificationFailed
        case .verified(let item):
            return item
        }
    }

    // MARK: - Helpers

    private func tierForProduct(_ product: Product) -> SubscriptionTier? {
        tierForProductId(product.id)
    }

    private nonisolated func tierForProductId(_ id: String) -> SubscriptionTier {
        switch id {
        case SubscriptionTier.monthly.productId: .monthly
        case SubscriptionTier.annual.productId: .annual
        default: .free
        }
    }
}

// MARK: - Subscription Error

enum SubscriptionError: Error, LocalizedError, Sendable {
    case productNotFound
    case purchaseFailed
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .productNotFound: String(localized: "Product not found. Please try again.")
        case .purchaseFailed: String(localized: "Purchase failed. Please try again.")
        case .verificationFailed: String(localized: "Transaction could not be verified.")
        }
    }
}
