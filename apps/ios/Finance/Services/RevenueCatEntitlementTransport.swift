// SPDX-License-Identifier: BUSL-1.1

import Foundation

struct RevenueCatEntitlementConfiguration: Sendable {
    let supabaseURL: URL
    let appId: String
    let environment: FinanceBillingEnvironment

    static func bundled(
        bundle: Bundle = .main,
        syncConfiguration: PowerSyncConfiguration = PowerSyncConfiguration()
    ) -> Self? {
        guard let supabaseURL = URL(string: syncConfiguration.supabaseURL),
              supabaseURL.scheme == "https" || supabaseURL.host == "localhost",
              let appId = bundle.object(
                  forInfoDictionaryKey: "RevenueCatAppID"
              ) as? String,
              !appId.isEmpty,
              !appId.hasPrefix("YOUR_")
        else {
            return nil
        }
        let configuredEnvironment = bundle.object(
            forInfoDictionaryKey: "RevenueCatEnvironment"
        ) as? String
        #if DEBUG
        let defaultEnvironment = FinanceBillingEnvironment.sandbox
        #else
        let defaultEnvironment = FinanceBillingEnvironment.production
        #endif
        let environment: FinanceBillingEnvironment
        if let configuredEnvironment {
            guard let parsed = FinanceBillingEnvironment(rawValue: configuredEnvironment) else {
                return nil
            }
            environment = parsed
        } else {
            environment = defaultEnvironment
        }
        return Self(
            supabaseURL: supabaseURL,
            appId: appId,
            environment: environment
        )
    }
}

protocol EntitlementAccessTokenProviding: Sendable {
    func accessToken() async -> String?
}

struct KeychainEntitlementAccessTokenProvider: EntitlementAccessTokenProviding {
    private let keychain: any KeychainManaging

    init(keychain: any KeychainManaging = KeychainManager.shared) {
        self.keychain = keychain
    }

    func accessToken() async -> String? {
        guard let data = keychain.load(key: "com.finance.auth.accessToken") else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
}

struct EntitlementHTTPResponse: Sendable {
    let statusCode: Int
    let data: Data
}

protocol EntitlementHTTPExecuting: Sendable {
    func execute(_ request: URLRequest) async throws -> EntitlementHTTPResponse
}

actor URLSessionEntitlementHTTPClient: EntitlementHTTPExecuting {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func execute(_ request: URLRequest) async throws -> EntitlementHTTPResponse {
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else {
            throw RevenueCatEntitlementTransportError.invalidResponse
        }
        return EntitlementHTTPResponse(statusCode: response.statusCode, data: data)
    }
}

enum RevenueCatEntitlementTransportError: Error, Sendable, CustomStringConvertible, Equatable {
    case unauthenticated
    case invalidConfiguration
    case invalidRequest
    case householdAccessDenied
    case temporarilyUnavailable
    case invalidResponse

    var isRetryable: Bool {
        self == .temporarilyUnavailable
    }

    var description: String {
        switch self {
        case .unauthenticated:
            "RevenueCatEntitlementTransportError(unauthenticated)"
        case .invalidConfiguration:
            "RevenueCatEntitlementTransportError(invalidConfiguration)"
        case .invalidRequest:
            "RevenueCatEntitlementTransportError(invalidRequest)"
        case .householdAccessDenied:
            "RevenueCatEntitlementTransportError(householdAccessDenied)"
        case .temporarilyUnavailable:
            "RevenueCatEntitlementTransportError(temporarilyUnavailable)"
        case .invalidResponse:
            "RevenueCatEntitlementTransportError(invalidResponse)"
        }
    }
}

private struct RevenueCatConfirmationWireRequest: Encodable {
    let operation: RevenueCatConfirmationOperation
    let appId: String
    let environment: FinanceBillingEnvironment
    let householdId: UUID?

    enum CodingKeys: String, CodingKey {
        case operation
        case appId = "app_id"
        case environment
        case householdId = "household_id"
    }
}

private struct RevenueCatConfirmationWireResponse: Decodable {
    let status: String
    let entitlement: RevenueCatEntitlementWireProjection
}

private struct RevenueCatEntitlementWireProjection: Decodable {
    let userTier: String
    let householdTier: String?
    let bankConnectionAllowance: Int64
    let isPremiumSponsor: Bool
    let isFamilyBound: Bool
    let effectiveAt: String
    let expiresAt: String?
    let projectionVersion: Int64
    let serverTime: String
}

private struct RevenueCatErrorWireResponse: Decodable {
    let status: String
    let error: String
}

enum RevenueCatEntitlementWireCodec {
    static func encode(_ request: FinanceEntitlementConfirmationRequest) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(
            RevenueCatConfirmationWireRequest(
                operation: request.operation,
                appId: request.context.appId,
                environment: request.context.environment,
                householdId: request.eligibleHousehold?.id
            )
        )
    }

    static func decode(_ data: Data) throws -> FinanceServerConfirmation {
        let response: RevenueCatConfirmationWireResponse
        do {
            response = try JSONDecoder().decode(
                RevenueCatConfirmationWireResponse.self,
                from: data
            )
        } catch {
            throw RevenueCatEntitlementTransportError.invalidResponse
        }
        let projection = try map(response.entitlement)
        switch response.status {
        case "pending":
            return .pending(projection)
        case "confirmed":
            return .confirmed(projection)
        default:
            throw RevenueCatEntitlementTransportError.invalidResponse
        }
    }

    static func decodeError(_ data: Data, statusCode: Int) -> RevenueCatEntitlementTransportError {
        let code = (try? JSONDecoder().decode(RevenueCatErrorWireResponse.self, from: data))?.error
        switch (statusCode, code) {
        case (401, _):
            return .unauthenticated
        case (403, .some("household_access_denied")):
            return .householdAccessDenied
        case (503, .some("temporarily_unavailable")), (429, _):
            return .temporarilyUnavailable
        case (400, .some("invalid_request")),
             (400, .some("invalid_evidence")),
             (413, _):
            return .invalidRequest
        default:
            return statusCode >= 500 ? .temporarilyUnavailable : .invalidResponse
        }
    }

    private static func map(
        _ value: RevenueCatEntitlementWireProjection
    ) throws -> FinanceEntitlementProjection {
        let householdTier = try mapHouseholdTier(value.householdTier)
        guard let userTier = FinanceEntitlementTier(rawValue: value.userTier),
              userTier != .family,
              value.bankConnectionAllowance >= 0,
              value.projectionVersion >= 1
        else {
            throw RevenueCatEntitlementTransportError.invalidResponse
        }
        return FinanceEntitlementProjection(
            userTier: userTier,
            householdTier: householdTier,
            bankConnectionAllowance: value.bankConnectionAllowance,
            isPremiumSponsor: value.isPremiumSponsor,
            isFamilyBound: value.isFamilyBound,
            effectiveAt: try parseDate(value.effectiveAt),
            expiresAt: try value.expiresAt.map(parseDate),
            projectionVersion: value.projectionVersion,
            serverTime: try parseDate(value.serverTime),
            status: .current
        )
    }

    private static func mapHouseholdTier(
        _ value: String?
    ) throws -> FinanceEntitlementTier? {
        guard let value else { return nil }
        guard let tier = FinanceEntitlementTier(rawValue: value), tier != .plus else {
            throw RevenueCatEntitlementTransportError.invalidResponse
        }
        return tier
    }

    private static func parseDate(_ value: String) throws -> Date {
        do {
            return try Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(value)
        } catch {
            do {
                return try Date.ISO8601FormatStyle().parse(value)
            } catch {
                throw RevenueCatEntitlementTransportError.invalidResponse
            }
        }
    }
}

/// Calls Finance's authenticated RevenueCat projection endpoint.
///
/// StoreKit evidence never enters this transport. A verified callback only
/// triggers a server-side lookup bound to the current Finance access token.
actor RevenueCatEntitlementTransport: AuthenticatedEntitlementTransport {
    private let endpointURL: URL
    private let tokenProvider: any EntitlementAccessTokenProviding
    private let httpClient: any EntitlementHTTPExecuting

    init(
        supabaseURL: URL,
        tokenProvider: any EntitlementAccessTokenProviding,
        httpClient: any EntitlementHTTPExecuting = URLSessionEntitlementHTTPClient()
    ) {
        self.endpointURL = supabaseURL
            .appendingPathComponent("functions")
            .appendingPathComponent("v1")
            .appendingPathComponent("revenuecat-confirm")
        self.tokenProvider = tokenProvider
        self.httpClient = httpClient
    }

    func isAuthenticated() async -> Bool {
        guard let token = await tokenProvider.accessToken() else { return false }
        return !token.isEmpty
    }

    func confirm(
        _ request: FinanceEntitlementConfirmationRequest
    ) async throws -> FinanceServerConfirmation {
        guard !request.context.appId.isEmpty,
              !request.context.appId.hasPrefix("YOUR_")
        else {
            throw RevenueCatEntitlementTransportError.invalidConfiguration
        }
        var urlRequest = try await authenticatedRequest(url: endpointURL)
        urlRequest.httpMethod = "POST"
        urlRequest.httpBody = try RevenueCatEntitlementWireCodec.encode(request)
        return try await execute(urlRequest)
    }

    func fetchProjection(
        _: FinanceEntitlementContext,
        eligibleHousehold: EligibleHouseholdSelection?
    ) async throws -> FinanceServerConfirmation {
        var components = URLComponents(url: endpointURL, resolvingAgainstBaseURL: false)
        if let eligibleHousehold {
            components?.queryItems = [
                URLQueryItem(
                    name: "household_id",
                    value: eligibleHousehold.id.uuidString.lowercased()
                ),
            ]
        }
        guard let url = components?.url else {
            throw RevenueCatEntitlementTransportError.invalidConfiguration
        }
        var request = try await authenticatedRequest(url: url)
        request.httpMethod = "GET"
        return try await execute(request)
    }

    private func authenticatedRequest(url: URL) async throws -> URLRequest {
        guard let accessToken = await tokenProvider.accessToken(), !accessToken.isEmpty else {
            throw RevenueCatEntitlementTransportError.unauthenticated
        }
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30
        return request
    }

    private func execute(_ request: URLRequest) async throws -> FinanceServerConfirmation {
        let response: EntitlementHTTPResponse
        do {
            response = try await httpClient.execute(request)
        } catch let error as RevenueCatEntitlementTransportError {
            throw error
        } catch {
            throw RevenueCatEntitlementTransportError.temporarilyUnavailable
        }
        guard response.statusCode == 200 else {
            throw RevenueCatEntitlementWireCodec.decodeError(
                response.data,
                statusCode: response.statusCode
            )
        }
        return try RevenueCatEntitlementWireCodec.decode(response.data)
    }
}
