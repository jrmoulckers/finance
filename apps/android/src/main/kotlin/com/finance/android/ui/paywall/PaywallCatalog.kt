// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.paywall

import com.finance.core.entitlement.EntitlementCatalog
import com.finance.core.entitlement.EntitlementTier

/**
 * Plans exactly as commercial catalog version 1 ratifies them.
 *
 * See `docs/business/pricing/subscription-entitlement-catalog.md`. Catalog
 * version 1 allocates only bank-connection capacity and household scope to a
 * paid plan; privacy, encryption, accessibility, export, deletion, and access
 * to existing financial data are never paid entitlements, so no plan here may
 * be described as unlocking them.
 */
internal object PaywallCatalog {

    val plans: List<TierPricing> =
        listOf(
            TierPricing(
                tier = EntitlementTier.FREE,
                displayName = "Free",
                monthlyPrice = "$0",
                yearlyPrice = "$0",
                bankConnections = "No bank connections",
                notes =
                    listOf(
                        "Manual entry, import, export, full history, deletion, privacy and " +
                            "accessibility are always included",
                    ),
                isCurrentTier = false,
            ),
            TierPricing(
                tier = EntitlementTier.PLUS,
                displayName = "Plus",
                monthlyPrice = "$4.99/mo",
                yearlyPrice = "$39.99/yr",
                bankConnections = "No bank connections",
                notes = listOf("Helps fund Finance without adding a bank connection"),
                isCurrentTier = false,
            ),
            TierPricing(
                tier = EntitlementTier.PREMIUM,
                displayName = "Premium",
                monthlyPrice = "$9.99/mo",
                yearlyPrice = "$79.99/yr",
                bankConnections =
                    "${EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.PREMIUM)} " +
                        "bank connections, plus $0.99 per added connection each month",
                notes = listOf("May sponsor one eligible household at a time"),
                isCurrentTier = false,
            ),
            TierPricing(
                tier = EntitlementTier.FAMILY,
                displayName = "Family",
                monthlyPrice = "$14.99/mo",
                yearlyPrice = "$119.99/yr",
                bankConnections =
                    "${EntitlementCatalog.baseBankConnectionAllowance(EntitlementTier.FAMILY)} " +
                        "bank connections shared by one household",
                notes = listOf("Bound to the household that bought it"),
                isCurrentTier = false,
            ),
        )

    /** The plan list with the currently displayed plan marked. */
    fun plansFor(currentTier: EntitlementTier): List<TierPricing> =
        plans.map { plan -> plan.copy(isCurrentTier = plan.tier == currentTier) }
}
