// SPDX-License-Identifier: BUSL-1.1

// EntitlementRepository.swift
// Finance
//
// Client access to the minimized entitlement projection (#4403).
//
// The Finance PostgreSQL ledger and its derived projection are the only
// runtime authorization authority (ADR-0027). This repository reads
// `entitlements-v1`; it never derives an entitlement from StoreKit, a receipt,
// a JWT claim, a PowerSync row, a feature flag, or the device clock, and a
// value returned here never authorizes a server action.
//
// References: #4403

import Foundation

/// Why a minimized entitlement could not be established. Each fails closed.
enum EntitlementUnavailableReason: String, Sendable, Equatable {
    /// No authenticated principal; the server refused before any lookup.
    case unauthenticated
    /// The caller is not an active member of the requested household.
    case forbidden
    /// The request named something the endpoint does not accept.
    case invalidRequest
    /// The caller exceeded the endpoint's request budget.
    case rateLimited
    /// The server could not read or understand its own projection.
    case projectionUnavailable
    /// The response could not be fully interpreted by this build.
    case malformed
    /// The server answered with a contract version this build cannot read.
    case unsupportedContractVersion
    /// The server answered against a catalog version this build cannot apply.
    case unsupportedCatalogVersion
    /// The projection could not be reached at all.
    case offline
}

/// Outcome of a minimized entitlement read.
enum EntitlementResult: Sendable, Equatable {
    /// A fully understood projection snapshot.
    case available(EntitlementEnvelope)
    /// No usable projection. Callers treat this as Free for display.
    case unavailable(EntitlementUnavailableReason)
}

/// Reads the authenticated caller's minimized entitlement.
protocol EntitlementRepository: Sendable {
    /// Read the current projection.
    ///
    /// - Parameter household: optional household scope; the server
    ///   independently verifies active membership and fails closed when it is
    ///   not satisfied.
    func load(household: EligibleHouseholdSelection?) async -> EntitlementResult
}

/// Calls Finance's versioned, authenticated entitlement endpoint.
///
/// The request carries a session credential and, at most, a household the
/// server re-authorizes. No tier, allowance, product, purchase, provider,
/// receipt, or validity value can be supplied, and no response is logged.
actor EntitlementsV1Repository: EntitlementRepository {
    static let path = "/functions/v1/entitlements-v1"

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
            .appendingPathComponent("entitlements-v1")
        self.tokenProvider = tokenProvider
        self.httpClient = httpClient
    }

    func load(household: EligibleHouseholdSelection?) async -> EntitlementResult {
        guard let accessToken = await tokenProvider.accessToken(), !accessToken.isEmpty else {
            return .unavailable(.unauthenticated)
        }
        guard let url = requestURL(household: household) else {
            return .unavailable(.invalidRequest)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 30

        let response: EntitlementHTTPResponse
        do {
            response = try await httpClient.execute(request)
        } catch is CancellationError {
            return .unavailable(.projectionUnavailable)
        } catch {
            // A transport failure is an outage, never a denial.
            return .unavailable(error is URLError ? .offline : .projectionUnavailable)
        }

        guard response.statusCode == 200 else {
            return .unavailable(Self.reason(for: response.statusCode))
        }
        return MinimizedEntitlementCodec.decode(response.data)
    }

    private func requestURL(household: EligibleHouseholdSelection?) -> URL? {
        guard let household else { return endpointURL }
        var components = URLComponents(url: endpointURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "household_id", value: household.id.uuidString.lowercased()),
        ]
        return components?.url
    }

    static func reason(for statusCode: Int) -> EntitlementUnavailableReason {
        switch statusCode {
        case 401: .unauthenticated
        case 403: .forbidden
        case 400, 405: .invalidRequest
        case 429: .rateLimited
        case 500...599: .projectionUnavailable
        default: .malformed
        }
    }
}
