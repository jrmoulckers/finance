// SPDX-License-Identifier: BUSL-1.1

import Foundation

enum FinanceApplication: String, Sendable {
    case finance
}

enum FinanceClientEnvironment: String, Sendable {
    case development
    case staging
    case production
}

enum PurchaseEvidenceProvider: String, Sendable {
    case appleStoreKit
    case revenueCatApple
}

/// Verified provider evidence. Its description is intentionally redacted.
struct VerifiedPurchaseEvidence: Sendable, CustomStringConvertible {
    let provider: PurchaseEvidenceProvider
    let opaqueValue: String
    private let finishAction: @Sendable () async -> Void

    init(
        provider: PurchaseEvidenceProvider,
        opaqueValue: String,
        finishAction: @escaping @Sendable () async -> Void
    ) {
        self.provider = provider
        self.opaqueValue = opaqueValue
        self.finishAction = finishAction
    }

    var description: String {
        "VerifiedPurchaseEvidence(redacted)"
    }

    func finish() async {
        await finishAction()
    }
}

struct FinanceEntitlementContext: Sendable {
    let application: FinanceApplication
    let environment: FinanceClientEnvironment
    let eligibleHouseholdIntent: String?
}

/// The request deliberately has no tier, price, quantity, allowance, customer,
/// provider account, validity, or grant-scope field.
struct FinanceEntitlementConfirmationRequest: Sendable, CustomStringConvertible {
    let context: FinanceEntitlementContext
    let provider: PurchaseEvidenceProvider
    let opaqueEvidence: String

    var description: String {
        "FinanceEntitlementConfirmationRequest(redacted)"
    }
}

enum FinanceServerConfirmation: Sendable, Equatable {
    case pending(FinanceEntitlementProjection)
    case confirmed(FinanceEntitlementProjection)
    case error(FinanceEntitlementProjection)

    var projection: FinanceEntitlementProjection {
        switch self {
        case .pending(let projection),
             .confirmed(let projection),
             .error(let projection):
            projection
        }
    }
}

/// Implementations bind the request to their authenticated Finance session.
protocol AuthenticatedEntitlementTransport: Sendable {
    func isAuthenticated() async -> Bool
    func confirmPurchase(
        _ request: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation
    func confirmRestore(
        _ request: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation
    func fetchProjection(
        _ context: FinanceEntitlementContext
    ) async throws -> FinanceServerConfirmation
}

struct UnavailableEntitlementTransport: AuthenticatedEntitlementTransport {
    func isAuthenticated() async -> Bool { false }

    func confirmPurchase(
        _: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation {
        throw SubscriptionError.confirmationUnavailable
    }

    func confirmRestore(
        _: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation {
        throw SubscriptionError.confirmationUnavailable
    }

    func fetchProjection(
        _: FinanceEntitlementContext
    ) async throws -> FinanceServerConfirmation {
        throw SubscriptionError.confirmationUnavailable
    }
}
