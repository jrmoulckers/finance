// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.entitlement

import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.MinimizedEntitlementCodec
import kotlinx.datetime.Instant

/**
 * Synthetic `entitlements-v1` payloads.
 *
 * Every fixture is a full wire envelope so the shared codec — not a test
 * shortcut — decides what a client may display.
 */
object EntitlementFixtures {
    const val SERVER_TIME = "2026-09-06T12:00:00Z"
    const val REFRESH_AFTER = "2026-10-06T12:00:00Z"

    val serverTime: Instant = Instant.parse(SERVER_TIME)
    val refreshAfter: Instant = Instant.parse(REFRESH_AFTER)

    /** Purchaser-scope Premium with a single contributing grant. */
    fun premium(
        refreshAfter: String = REFRESH_AFTER,
        projectionVersion: Long = 3,
    ): String =
        envelope(
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
              "effective_at": "$SERVER_TIME",
              "refresh_after": "$refreshAfter",
              "server_time": "$SERVER_TIME",
              "projection_version": $projectionVersion
            },
            "downgrade": {
              "status": "scheduled",
              "effective_at": "$refreshAfter"
            }
            """,
        )

    /** Household-scope Family: four shared bank connections. */
    fun family(refreshAfter: String = REFRESH_AFTER): String =
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
              "effective_at": "$SERVER_TIME",
              "refresh_after": "$refreshAfter",
              "server_time": "$SERVER_TIME",
              "projection_version": 5
            },
            "downgrade": {
              "status": "scheduled",
              "effective_at": "$refreshAfter"
            }
            """,
        )

    /**
     * Two contributing grants, so the collapsed bound proves no reduction and
     * the client must re-read rather than expire anything locally.
     */
    fun undeterminedDowngrade(refreshAfter: String = REFRESH_AFTER): String =
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
              "effective_at": "$SERVER_TIME",
              "refresh_after": "$refreshAfter",
              "server_time": "$SERVER_TIME",
              "projection_version": 6
            },
            "downgrade": {
              "status": "undetermined",
              "effective_at": null
            }
            """,
        )

    /** No verified paid grant: Free, with no server-issued bound at all. */
    fun free(): String =
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
              "effective_at": "$SERVER_TIME",
              "refresh_after": null,
              "server_time": "$SERVER_TIME",
              "projection_version": 2
            },
            "downgrade": {
              "status": "none",
              "effective_at": null
            }
            """,
        )

    /** A tier this build does not understand must never display as access. */
    fun unknownTier(): String =
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
              "effective_at": "$SERVER_TIME",
              "refresh_after": "$REFRESH_AFTER",
              "server_time": "$SERVER_TIME",
              "projection_version": 4
            },
            "downgrade": {
              "status": "scheduled",
              "effective_at": "$REFRESH_AFTER"
            }
            """,
        )

    fun envelope(
        entitlement: String,
        contractVersion: Int = 1,
        catalogVersion: Int = 1,
    ): String =
        """
        {
          "contract_version": $contractVersion,
          "catalog_version": $catalogVersion,
          "entitlement": {
            ${entitlement.trimIndent()}
          }
        }
        """.trimIndent()

    fun decoded(payload: String): EntitlementEnvelope {
        val result = MinimizedEntitlementCodec.decode(payload)
        check(result is EntitlementResult.Available) { "fixture must decode" }
        return result.envelope
    }
}
