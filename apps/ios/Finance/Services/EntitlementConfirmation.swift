// SPDX-License-Identifier: BUSL-1.1

import Foundation

enum FinanceBillingEnvironment: String, Codable, Sendable {
    case sandbox
    case production
}

enum RevenueCatConfirmationOperation: String, Codable, Sendable {
    case confirm
    case restore
}

/// Locally verified provider evidence retained only for safe finishing.
struct VerifiedPurchaseEvidence: Sendable, CustomStringConvertible {
    private let finishAction: @Sendable () async -> Void

    init(finishAction: @escaping @Sendable () async -> Void) {
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
    let appId: String
    let environment: FinanceBillingEnvironment
}

/// A household UUID supplied only by an authenticated membership source.
struct EligibleHouseholdSelection: Sendable, Equatable {
    let id: UUID

    private init(id: UUID) {
        self.id = id
    }

    static func authenticatedMembership(_ id: UUID) -> Self? {
        let parts = id.uuidString.split(separator: "-")
        guard parts.count == 5,
              let version = parts[2].first,
              "12345".contains(version),
              let variant = parts[3].first,
              "89AB".contains(variant)
        else {
            return nil
        }
        return Self(id: id)
    }
}

protocol EligibleHouseholdProviding: Sendable {
    func currentEligibleHousehold() async -> EligibleHouseholdSelection?
}

struct NoEligibleHouseholdProvider: EligibleHouseholdProviding {
    func currentEligibleHousehold() async -> EligibleHouseholdSelection? { nil }
}

/// The request deliberately has no tier, price, quantity, allowance, customer,
/// provider account/reference, receipt, validity, or grant-scope field.
struct FinanceEntitlementConfirmationRequest: Sendable, CustomStringConvertible {
    let operation: RevenueCatConfirmationOperation
    let context: FinanceEntitlementContext
    let eligibleHousehold: EligibleHouseholdSelection?

    var description: String {
        "FinanceEntitlementConfirmationRequest(redacted)"
    }
}

enum FinanceServerConfirmation: Sendable, Equatable {
    case pending(FinanceEntitlementProjection)
    case confirmed(FinanceEntitlementProjection)

    var projection: FinanceEntitlementProjection {
        switch self {
        case .pending(let projection),
             .confirmed(let projection):
            projection
        }
    }
}

/// Implementations bind the request to their authenticated Finance session.
protocol AuthenticatedEntitlementTransport: Sendable {
    func isAuthenticated() async -> Bool
    func confirm(
        _ request: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation
    func fetchProjection(
        _ context: FinanceEntitlementContext,
        eligibleHousehold: EligibleHouseholdSelection?
    ) async throws -> FinanceServerConfirmation
}

struct UnavailableEntitlementTransport: AuthenticatedEntitlementTransport {
    func isAuthenticated() async -> Bool { false }

    func confirm(
        _: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation {
        throw SubscriptionError.confirmationUnavailable
    }

    func fetchProjection(
        _: FinanceEntitlementContext,
        eligibleHousehold _: EligibleHouseholdSelection?
    ) async throws -> FinanceServerConfirmation {
        throw SubscriptionError.confirmationUnavailable
    }
}
