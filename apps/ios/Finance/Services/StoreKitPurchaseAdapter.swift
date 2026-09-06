// SPDX-License-Identifier: BUSL-1.1

import Foundation
import StoreKit

enum NativePurchaseResult: Sendable {
    case cancelled
    case pending
    case verified(VerifiedPurchaseEvidence)
}

protocol NativePurchaseProviding: Sendable {
    func loadProducts() async -> [SubscriptionProductInfo]
    func purchase(productId: String) async throws -> NativePurchaseResult
    func restoreEvidence() async throws -> [VerifiedPurchaseEvidence]
    func transactionUpdates() -> AsyncStream<VerifiedPurchaseEvidence>
}

/// StoreKit verifies transport eligibility only. It never creates an entitlement.
actor StoreKitPurchaseAdapter: NativePurchaseProviding {
    private static let productIds: Set<String> = [
        SubscriptionTier.monthly.productId,
        SubscriptionTier.annual.productId,
    ]

    private var products: [Product] = []

    func loadProducts() async -> [SubscriptionProductInfo] {
        do {
            products = try await Product.products(for: Self.productIds)
            return products.compactMap(Self.productInfo).sorted {
                $0.tier == .annual && $1.tier != .annual
            }
        } catch {
            return []
        }
    }

    func purchase(productId: String) async throws -> NativePurchaseResult {
        guard let product = products.first(where: { $0.id == productId }) else {
            throw SubscriptionError.productNotFound
        }

        switch try await product.purchase() {
        case .success(let verification):
            return .verified(try Self.evidence(from: verification))
        case .userCancelled:
            return .cancelled
        case .pending:
            return .pending
        @unknown default:
            throw SubscriptionError.purchaseFailed
        }
    }

    func restoreEvidence() async throws -> [VerifiedPurchaseEvidence] {
        try await AppStore.sync()
        var evidence: [VerifiedPurchaseEvidence] = []
        for await result in Transaction.currentEntitlements {
            if let verified = try? Self.evidence(from: result) {
                evidence.append(verified)
            }
        }
        return evidence
    }

    nonisolated func transactionUpdates() -> AsyncStream<VerifiedPurchaseEvidence> {
        AsyncStream { continuation in
            let task = Task {
                for await result in Transaction.updates {
                    if let evidence = try? Self.evidence(from: result) {
                        continuation.yield(evidence)
                    }
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private static func evidence(
        from result: VerificationResult<Transaction>
    ) throws -> VerifiedPurchaseEvidence {
        switch result {
        case .unverified:
            throw SubscriptionError.verificationFailed
        case .verified(let transaction):
            guard productIds.contains(transaction.productID) else {
                throw SubscriptionError.productNotFound
            }
            return VerifiedPurchaseEvidence(
                finishAction: {
                    await transaction.finish()
                }
            )
        }
    }

    private static func productInfo(_ product: Product) -> SubscriptionProductInfo? {
        guard let tier = tier(for: product.id) else { return nil }
        let pricePerMonth: String?
        if tier == .annual {
            pricePerMonth = (product.price / 12).formatted(
                .currency(code: product.priceFormatStyle.currencyCode ?? "USD")
            )
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

    private static func tier(for productId: String) -> SubscriptionTier? {
        switch productId {
        case SubscriptionTier.monthly.productId: .monthly
        case SubscriptionTier.annual.productId: .annual
        default: nil
        }
    }
}
