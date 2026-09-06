// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

/** Reviewed logical products accepted by the Finance checkout endpoint. */
enum class BillingCatalogChoice(
    val wireValue: String,
) {
    PLUS_MONTHLY("plus_monthly"),
    PLUS_YEARLY("plus_yearly"),
    PREMIUM_MONTHLY("premium_monthly"),
    PREMIUM_YEARLY("premium_yearly"),
    FAMILY_MONTHLY("family_monthly"),
    FAMILY_YEARLY("family_yearly"),
    PREMIUM_BANK_ADDON_MONTHLY("premium_bank_addon_monthly"),
}

/** Windows billing channel. Store-distributed billing remains intentionally unavailable. */
enum class WindowsBillingChannel {
    DIRECT_STRIPE,
    MICROSOFT_STORE_FUTURE,
}

enum class UserEntitlementTier(
    val wireValue: String,
) {
    FREE("free"),
    PLUS("plus"),
    PREMIUM("premium"),
}

enum class HouseholdEntitlementTier(
    val wireValue: String,
) {
    FREE("free"),
    PREMIUM("premium"),
    FAMILY("family"),
}

data class ProductEntitlementProjection(
    val userTier: UserEntitlementTier,
    val householdTier: HouseholdEntitlementTier?,
    val bankConnectionAllowance: Long,
    val isPremiumSponsor: Boolean,
    val isFamilyBound: Boolean,
    val effectiveAt: String,
    val expiresAt: String?,
    val projectionVersion: Long,
    val serverTime: String,
) {
    val confirmsPaidAccess: Boolean
        get() = userTier != UserEntitlementTier.FREE ||
            (householdTier != null && householdTier != HouseholdEntitlementTier.FREE)
}

sealed interface ProductBillingState {
    val projection: ProductEntitlementProjection?

    data class Idle(
        override val projection: ProductEntitlementProjection? = null,
    ) : ProductBillingState

    data class Pending(
        override val projection: ProductEntitlementProjection? = null,
    ) : ProductBillingState

    data class Confirmed(
        override val projection: ProductEntitlementProjection,
    ) : ProductBillingState

    data class Error(
        override val projection: ProductEntitlementProjection?,
        val message: String,
    ) : ProductBillingState
}

fun stateFromCheckoutReturn(
    query: String,
    projection: ProductEntitlementProjection?,
): ProductBillingState {
    val returnedFromCheckout = query
        .removePrefix("?")
        .split("&")
        .mapNotNull { parameter ->
            val parts = parameter.split("=", limit = 2)
            parts.takeIf { it.size == 2 }?.let { it[0] to it[1] }
        }
        .any { (key, value) -> key == "billing" && value == "pending" }

    return when {
        projection?.confirmsPaidAccess == true -> ProductBillingState.Confirmed(projection)
        returnedFromCheckout -> ProductBillingState.Pending(projection)
        else -> ProductBillingState.Idle(projection)
    }
}
