// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

private struct StaticTokenProvider: EntitlementAccessTokenProviding {
    let token: String?

    func accessToken() async -> String? { token }
}

private final class EntitlementTestKeychain: KeychainManaging, @unchecked Sendable {
    private var values: [String: Data] = [:]

    func save(key: String, data: Data) throws {
        values[key] = data
    }

    func load(key: String) -> Data? {
        values[key]
    }

    func delete(key: String) throws {
        values.removeValue(forKey: key)
    }
}

private actor RecordingHTTPClient: EntitlementHTTPExecuting {
    private var response: EntitlementHTTPResponse
    private var failure: (any Error)?
    private var requests: [URLRequest] = []

    init(statusCode: Int = 200, data: Data = EntitlementFixtures.premium()) {
        self.response = EntitlementHTTPResponse(statusCode: statusCode, data: data)
    }

    func setResponse(statusCode: Int, data: Data) {
        response = EntitlementHTTPResponse(statusCode: statusCode, data: data)
    }

    func setFailure(_ failure: (any Error)?) {
        self.failure = failure
    }

    func execute(_ request: URLRequest) async throws -> EntitlementHTTPResponse {
        requests.append(request)
        if let failure { throw failure }
        return response
    }

    func lastRequest() -> URLRequest? { requests.last }

    func requestCount() -> Int { requests.count }
}

@Suite("entitlements-v1 repository")
struct EntitlementRepositoryTests {
    private let supabaseURL = URL(string: "https://project.example.test")!
    private let householdId = UUID(uuidString: "44010000-0000-4000-8000-000000000001")!

    private func repository(
        _ httpClient: RecordingHTTPClient,
        token: String? = "synthetic-session-credential"
    ) -> EntitlementsV1Repository {
        EntitlementsV1Repository(
            supabaseURL: supabaseURL,
            tokenProvider: StaticTokenProvider(token: token),
            httpClient: httpClient
        )
    }

    private func jwt(payload: String) -> String {
        let encoded = Data(payload.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "header.\(encoded).signature"
    }

    @Test("Reads the versioned endpoint through the shared contract")
    func readsVersionedEndpoint() async throws {
        let httpClient = RecordingHTTPClient()

        let result = await repository(httpClient).load(household: nil)
        let request = try #require(await httpClient.lastRequest())

        guard case .available(let envelope) = result else {
            Issue.record("Expected an available projection")
            return
        }
        #expect(envelope.entitlement.tier == .premium)
        #expect(request.url?.path == "/functions/v1/entitlements-v1")
        #expect(request.httpMethod == "GET")
        #expect(request.httpBody == nil)
        #expect(request.url?.query == nil)
        #expect(
            request.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer ") == true
        )
    }

    @Test("The household scope is the only request parameter")
    func householdScopeIsTheOnlyParameter() async throws {
        let httpClient = RecordingHTTPClient(data: EntitlementFixtures.family())
        let household = try #require(
            EligibleHouseholdSelection.authenticatedMembership(householdId)
        )

        _ = await repository(httpClient).load(household: household)
        let request = try #require(await httpClient.lastRequest())

        #expect(request.url?.query == "household_id=\(householdId.uuidString.lowercased())")
        for field in ["tier", "allowance", "product", "receipt", "expires", "provider"] {
            #expect(request.url?.absoluteString.contains(field) != true)
        }
    }

    @Test("An unauthenticated session never reaches the network")
    func unauthenticatedNeverCallsOut() async {
        let httpClient = RecordingHTTPClient()

        let result = await repository(httpClient, token: nil).load(household: nil)
        let count = await httpClient.requestCount()

        #expect(result == .unavailable(.unauthenticated))
        #expect(count == 0)
    }

    @Test("Each documented failure maps to its own non-authorizing reason")
    func failuresMapToReasons() async {
        let cases: [(Int, EntitlementUnavailableReason)] = [
            (401, .unauthenticated),
            (403, .forbidden),
            (400, .invalidRequest),
            (405, .invalidRequest),
            (429, .rateLimited),
            (503, .projectionUnavailable),
            (500, .projectionUnavailable),
            (302, .malformed),
        ]

        for (statusCode, reason) in cases {
            #expect(EntitlementsV1Repository.reason(for: statusCode) == reason)
        }
    }

    @Test("A denial response is never displayed as an entitlement")
    func denialIsNotAnEntitlement() async {
        let httpClient = RecordingHTTPClient(
            statusCode: 403,
            data: Data(#"{"error":"Household is not available","code":"forbidden"}"#.utf8)
        )

        let result = await repository(httpClient).load(household: nil)

        #expect(result == .unavailable(.forbidden))
    }

    @Test("A lost connection is reported as offline, not as a denial")
    func offlineIsNotADenial() async {
        let httpClient = RecordingHTTPClient()
        await httpClient.setFailure(URLError(.notConnectedToInternet))

        let result = await repository(httpClient).load(household: nil)

        #expect(result == .unavailable(.offline))
    }

    @Test("An unreadable or unknown payload fails closed")
    func malformedPayloadFailsClosed() async {
        let httpClient = RecordingHTTPClient(data: Data("{ not json".utf8))
        #expect(await repository(httpClient).load(household: nil) == .unavailable(.malformed))

        await httpClient.setResponse(statusCode: 200, data: EntitlementFixtures.unknownTier())
        #expect(await repository(httpClient).load(household: nil) == .unavailable(.malformed))
    }

    @Test("A newer contract or catalog version is refused rather than guessed")
    func unsupportedVersionsAreRefused() async {
        let httpClient = RecordingHTTPClient(
            data: EntitlementFixtures.envelope(
                EntitlementFixtures.premiumBody(),
                contractVersion: 2
            )
        )
        #expect(
            await repository(httpClient).load(household: nil)
                == .unavailable(.unsupportedContractVersion)
        )

        await httpClient.setResponse(
            statusCode: 200,
            data: EntitlementFixtures.envelope(
                EntitlementFixtures.premiumBody(),
                catalogVersion: 2
            )
        )
        #expect(
            await repository(httpClient).load(household: nil)
                == .unavailable(.unsupportedCatalogVersion)
        )
    }

    @Test("A cached envelope round-trips through the shared codec")
    func cachedEnvelopeRoundTrips() throws {
        let envelope = EntitlementFixtures.decoded(EntitlementFixtures.premium())
        let encoded = try #require(MinimizedEntitlementCodec.encode(envelope))

        #expect(MinimizedEntitlementCodec.decode(encoded) == .available(envelope))
    }

    @Test("The authenticated identity provider scopes user and household caches")
    func identityProviderReadsSessionScope() async throws {
        let keychain = EntitlementTestKeychain()
        try keychain.save(
            key: "com.finance.auth.userId",
            data: Data("user-a".utf8)
        )
        try keychain.save(
            key: "com.finance.auth.accessToken",
            data: Data(
                jwt(
                    payload: """
                    {"app_metadata":{"household_id":"\(householdId.uuidString.lowercased())"}}
                    """
                ).utf8
            )
        )
        let provider = KeychainEntitlementIdentityProvider(keychain: keychain)

        #expect(await provider.currentUserScope() == "user-a")
        #expect(await provider.currentEligibleHousehold()?.id == householdId)
    }
}
