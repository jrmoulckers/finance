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

protocol EntitlementUserScopeProviding: Sendable {
    func currentUserScope() async -> String?
}

struct NoEligibleHouseholdProvider: EligibleHouseholdProviding {
    func currentEligibleHousehold() async -> EligibleHouseholdSelection? { nil }
}

struct NoEntitlementUserScopeProvider: EntitlementUserScopeProviding {
    func currentUserScope() async -> String? { nil }
}

/// Reads identity and household-scope hints from the authenticated session.
///
/// The endpoint independently verifies both values. The JWT claim only
/// selects a household to request; it never grants an entitlement on-device.
struct KeychainEntitlementIdentityProvider:
    EligibleHouseholdProviding, EntitlementUserScopeProviding
{
    private struct Claims: Decodable {
        let appMetadata: AppMetadata?

        enum CodingKeys: String, CodingKey {
            case appMetadata = "app_metadata"
        }
    }

    private struct AppMetadata: Decodable {
        let householdId: String?

        enum CodingKeys: String, CodingKey {
            case householdId = "household_id"
        }
    }

    private let keychain: any KeychainManaging

    init(keychain: any KeychainManaging = KeychainManager.shared) {
        self.keychain = keychain
    }

    func currentUserScope() async -> String? {
        guard let data = keychain.load(key: "com.finance.auth.userId"),
              let userId = String(data: data, encoding: .utf8),
              !userId.isEmpty
        else {
            return nil
        }
        return userId
    }

    func currentEligibleHousehold() async -> EligibleHouseholdSelection? {
        guard let tokenData = keychain.load(key: "com.finance.auth.accessToken"),
              let token = String(data: tokenData, encoding: .utf8),
              let payload = Self.jwtPayload(token),
              let claims = try? JSONDecoder().decode(Claims.self, from: payload),
              let householdId = claims.appMetadata?.householdId,
              let id = UUID(uuidString: householdId)
        else {
            return nil
        }
        return EligibleHouseholdSelection.authenticatedMembership(id)
    }

    private static func jwtPayload(_ token: String) -> Data? {
        let segments = token.split(separator: ".", omittingEmptySubsequences: false)
        guard segments.count == 3 else { return nil }
        var encoded = String(segments[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        return Data(base64Encoded: encoded)
    }
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

/// What Finance said about the submitted evidence.
///
/// This is a **confirmation phase only**. It deliberately carries no tier,
/// allowance, validity, or projection echo: the entitlement a client displays
/// comes from `entitlements-v1` through ``EntitlementStore``, and a
/// cost-incurring server action re-reads the projection server-side.
enum FinanceServerConfirmation: String, Sendable, Equatable, CaseIterable {
    /// Finance accepted the operation but no verified grant applies yet.
    case pending
    /// Finance recorded a verified grant, so the evidence may be finished.
    case confirmed
}

/// Implementations bind the request to their authenticated Finance session.
protocol AuthenticatedEntitlementTransport: Sendable {
    func isAuthenticated() async -> Bool
    func confirm(
        _ request: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation
}

struct UnavailableEntitlementTransport: AuthenticatedEntitlementTransport {
    func isAuthenticated() async -> Bool { false }

    func confirm(
        _: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation {
        throw SubscriptionError.confirmationUnavailable
    }
}
