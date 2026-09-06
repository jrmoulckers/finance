// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

private struct StaticEntitlementTokenProvider: EntitlementAccessTokenProviding {
    let token: String?

    func accessToken() async -> String? {
        token
    }
}

private actor RecordingEntitlementHTTPClient: EntitlementHTTPExecuting {
    private let response: EntitlementHTTPResponse
    private var requests: [URLRequest] = []

    init(statusCode: Int, body: String) {
        self.response = EntitlementHTTPResponse(
            statusCode: statusCode,
            data: Data(body.utf8)
        )
    }

    func execute(_ request: URLRequest) async throws -> EntitlementHTTPResponse {
        requests.append(request)
        return response
    }

    func lastRequest() -> URLRequest? {
        requests.last
    }
}

@Suite("RevenueCat entitlement wire contract")
struct RevenueCatEntitlementTransportTests {
    private let householdId = UUID(uuidString: "44010000-0000-4000-8000-000000000001")!

    @Test("Confirmation encoding matches the server allowlist")
    func requestEncodingIsMinimal() throws {
        let request = FinanceEntitlementConfirmationRequest(
            operation: .confirm,
            context: FinanceEntitlementContext(
                appId: "app_synthetic_apple",
                environment: .sandbox
            ),
            eligibleHousehold: nil
        )

        let object = try #require(
            JSONSerialization.jsonObject(
                with: RevenueCatEntitlementWireCodec.encode(request)
            ) as? [String: Any]
        )

        #expect(Set(object.keys) == Set(["operation", "app_id", "environment"]))
        #expect(object["operation"] as? String == "confirm")
        #expect(object["app_id"] as? String == "app_synthetic_apple")
        #expect(object["environment"] as? String == "sandbox")
        #expect(object["provider"] == nil)
        #expect(object["receipt"] == nil)
        #expect(object["tier"] == nil)
        #expect(object["operation_reference"] == nil)
    }

    @Test("Eligible membership encodes only the constrained household UUID")
    func eligibleHouseholdEncoding() throws {
        let request = FinanceEntitlementConfirmationRequest(
            operation: .restore,
            context: FinanceEntitlementContext(
                appId: "app_synthetic_apple",
                environment: .production
            ),
            eligibleHousehold: try #require(
                EligibleHouseholdSelection.authenticatedMembership(householdId)
            )
        )

        let object = try #require(
            JSONSerialization.jsonObject(
                with: RevenueCatEntitlementWireCodec.encode(request)
            ) as? [String: Any]
        )

        #expect(
            Set(object.keys) ==
                Set(["operation", "app_id", "environment", "household_id"])
        )
        #expect(object["operation"] as? String == "restore")
        #expect(object["household_id"] as? String == householdId.uuidString)
    }

    @Test("Unsupported household identifier versions are rejected")
    func invalidHouseholdSelectionIsRejected() throws {
        let invalidVersion = try #require(
            UUID(uuidString: "44010000-0000-0000-8000-000000000001")
        )

        #expect(
            EligibleHouseholdSelection.authenticatedMembership(invalidVersion) == nil
        )
    }

    @Test("Pending denial decodes the authoritative Free projection")
    func pendingDenialDecoding() throws {
        let response = try RevenueCatEntitlementWireCodec.decode(
            Data(
                """
                {
                  "status": "pending",
                  "entitlement": {
                    "userTier": "free",
                    "householdTier": null,
                    "bankConnectionAllowance": 0,
                    "isPremiumSponsor": false,
                    "isFamilyBound": false,
                    "effectiveAt": "2026-09-06T12:00:00.000Z",
                    "expiresAt": null,
                    "projectionVersion": 7,
                    "serverTime": "2026-09-06T12:00:01.000Z"
                  }
                }
                """.utf8
            )
        )

        guard case .pending(let projection) = response else {
            Issue.record("Expected pending confirmation")
            return
        }
        #expect(projection.tier == .free)
        #expect(projection.projectionVersion == 7)
        #expect(!projection.authorizesNewCostIncurringActions)
    }

    @Test("Family projection requires the server binding flag")
    func familyProjectionRequiresBinding() throws {
        let response = try RevenueCatEntitlementWireCodec.decode(
            Data(
                """
                {
                  "status": "confirmed",
                  "entitlement": {
                    "userTier": "free",
                    "householdTier": "family",
                    "bankConnectionAllowance": 20,
                    "isPremiumSponsor": true,
                    "isFamilyBound": false,
                    "effectiveAt": "2026-09-06T12:00:00Z",
                    "expiresAt": "2026-10-06T12:00:00Z",
                    "projectionVersion": 8,
                    "serverTime": "2026-09-06T12:00:01Z"
                  }
                }
                """.utf8
            )
        )

        #expect(response.projection.tier == .free)
        #expect(!response.projection.authorizesNewCostIncurringActions)
    }

    @Test("Transport calls the exact endpoint without provider evidence")
    func transportEndpointAndBody() async throws {
        let httpClient = RecordingEntitlementHTTPClient(
            statusCode: 200,
            body: confirmedResponse
        )
        let transport = RevenueCatEntitlementTransport(
            supabaseURL: try #require(URL(string: "https://project.example.test")),
            tokenProvider: StaticEntitlementTokenProvider(token: "synthetic-access-token"),
            httpClient: httpClient
        )
        let request = FinanceEntitlementConfirmationRequest(
            operation: .confirm,
            context: FinanceEntitlementContext(
                appId: "app_synthetic_apple",
                environment: .sandbox
            ),
            eligibleHousehold: nil
        )

        _ = try await transport.confirm(request)
        let recorded = try #require(await httpClient.lastRequest())
        let body = try #require(recorded.httpBody)
        let object = try #require(
            JSONSerialization.jsonObject(with: body) as? [String: Any]
        )

        #expect(recorded.url?.path == "/functions/v1/revenuecat-confirm")
        #expect(recorded.httpMethod == "POST")
        #expect(
            recorded.value(forHTTPHeaderField: "Authorization") ==
                "Bearer synthetic-access-token"
        )
        #expect(Set(object.keys) == Set(["operation", "app_id", "environment"]))
    }

    @Test("Transport errors are retry-classified and privacy safe")
    func transportErrorIsPrivacySafe() {
        let marker = "synthetic-provider-identifier"
        let error = RevenueCatEntitlementWireCodec.decodeError(
            Data(
                """
                {"status":"error","error":"temporarily_unavailable","detail":"\(marker)"}
                """.utf8
            ),
            statusCode: 503
        )

        #expect(error.isRetryable)
        #expect(!String(describing: error).contains(marker))
    }

    private var confirmedResponse: String {
        """
        {
          "status": "confirmed",
          "entitlement": {
            "userTier": "premium",
            "householdTier": null,
            "bankConnectionAllowance": 10,
            "isPremiumSponsor": false,
            "isFamilyBound": false,
            "effectiveAt": "2026-09-06T12:00:00Z",
            "expiresAt": null,
            "projectionVersion": 3,
            "serverTime": "2026-09-06T12:00:01Z"
          }
        }
        """
    }
}
