// SPDX-License-Identifier: BUSL-1.1

import Foundation
import Testing
@testable import FinanceApp

/// Synthetic `entitlements-v1` payloads.
///
/// Every fixture is a full wire envelope so the shared codec — not a test
/// shortcut — decides what a client may display.
enum EntitlementFixtures {
    static let serverTime = "2026-09-06T12:00:00Z"
    static let refreshAfterString = "2026-10-06T12:00:00Z"

    static var serverInstant: Date {
        MinimizedEntitlementCodec.parseInstant(serverTime)!
    }

    static var refreshAfter: Date {
        MinimizedEntitlementCodec.parseInstant(refreshAfterString)!
    }

    static var insideBounds: Date {
        MinimizedEntitlementCodec.parseInstant("2026-09-20T12:00:00Z")!
    }

    static var pastRefreshBound: Date {
        MinimizedEntitlementCodec.parseInstant("2026-10-06T12:00:01Z")!
    }

    /// Purchaser-scope Premium with a single contributing grant.
    static func premiumBody(refreshAfter: String = refreshAfterString) -> String {
        """
        "scope": "user",
        "tier": "premium",
        "user_tier": "premium",
        "household_tier": null,
        "access_state": "granted",
        "lifecycle": null,
        "is_premium_sponsor": false,
        "is_family_bound": false,
        "bank_connections": {
          "allowance": 0,
          "base_allowance": 0,
          "addon_allowance": 0
        },
        "validity": {
          "effective_at": "\(serverTime)",
          "refresh_after": "\(refreshAfter)",
          "server_time": "\(serverTime)",
          "projection_version": 3
        },
        "downgrade": {
          "status": "scheduled",
          "effective_at": "\(refreshAfter)"
        }
        """
    }

    static func premium(refreshAfter: String = refreshAfterString) -> Data {
        envelope(premiumBody(refreshAfter: refreshAfter))
    }

    /// Household-scope Family: four shared bank connections.
    static func family() -> Data {
        envelope(
            """
            "scope": "household",
            "tier": "family",
            "user_tier": "free",
            "household_tier": "family",
            "access_state": "granted",
            "lifecycle": null,
            "is_premium_sponsor": false,
            "is_family_bound": true,
            "bank_connections": {
              "allowance": 4,
              "base_allowance": 4,
              "addon_allowance": 0
            },
            "validity": {
              "effective_at": "\(serverTime)",
              "refresh_after": "\(refreshAfterString)",
              "server_time": "\(serverTime)",
              "projection_version": 5
            },
            "downgrade": {
              "status": "scheduled",
              "effective_at": "\(refreshAfterString)"
            }
            """
        )
    }

    /// Two contributing grants, so the collapsed bound proves no reduction.
    static func undeterminedDowngrade() -> Data {
        envelope(
            """
            "scope": "household",
            "tier": "premium",
            "user_tier": "plus",
            "household_tier": "premium",
            "access_state": "granted",
            "lifecycle": null,
            "is_premium_sponsor": true,
            "is_family_bound": false,
            "bank_connections": {
              "allowance": 2,
              "base_allowance": 2,
              "addon_allowance": 0
            },
            "validity": {
              "effective_at": "\(serverTime)",
              "refresh_after": "\(refreshAfterString)",
              "server_time": "\(serverTime)",
              "projection_version": 6
            },
            "downgrade": {
              "status": "undetermined",
              "effective_at": null
            }
            """
        )
    }

    /// No verified paid grant: Free, with no server-issued bound at all.
    static func free() -> Data {
        envelope(
            """
            "scope": "user",
            "tier": "free",
            "user_tier": "free",
            "household_tier": null,
            "access_state": "not_entitled",
            "lifecycle": null,
            "is_premium_sponsor": false,
            "is_family_bound": false,
            "bank_connections": {
              "allowance": 0,
              "base_allowance": 0,
              "addon_allowance": 0
            },
            "validity": {
              "effective_at": "\(serverTime)",
              "refresh_after": null,
              "server_time": "\(serverTime)",
              "projection_version": 2
            },
            "downgrade": {
              "status": "none",
              "effective_at": null
            }
            """
        )
    }

    /// A tier this build does not understand must never display as access.
    static func unknownTier() -> Data {
        envelope(
            """
            "scope": "user",
            "tier": "platinum",
            "user_tier": "platinum",
            "household_tier": null,
            "access_state": "granted",
            "lifecycle": null,
            "is_premium_sponsor": false,
            "is_family_bound": false,
            "bank_connections": {
              "allowance": 0,
              "base_allowance": 0,
              "addon_allowance": 0
            },
            "validity": {
              "effective_at": "\(serverTime)",
              "refresh_after": "\(refreshAfterString)",
              "server_time": "\(serverTime)",
              "projection_version": 4
            },
            "downgrade": {
              "status": "scheduled",
              "effective_at": "\(refreshAfterString)"
            }
            """
        )
    }

    static func envelope(
        _ entitlement: String,
        contractVersion: Int = 1,
        catalogVersion: Int = 1
    ) -> Data {
        Data(
            """
            {
              "contract_version": \(contractVersion),
              "catalog_version": \(catalogVersion),
              "entitlement": {
                \(entitlement)
              }
            }
            """.utf8
        )
    }

    static func decoded(_ payload: Data) -> EntitlementEnvelope {
        guard case .available(let envelope) = MinimizedEntitlementCodec.decode(payload) else {
            fatalError("fixture must decode")
        }
        return envelope
    }
}
