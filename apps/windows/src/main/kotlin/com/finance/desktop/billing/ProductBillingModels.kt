// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

import com.finance.core.entitlement.EntitlementAccessState
import com.finance.core.entitlement.EntitlementEnvelope
import com.finance.core.entitlement.EntitlementResult
import com.finance.core.entitlement.MinimizedEntitlementCodec

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

/**
 * UI state for Stripe operations and the shared Finance entitlement status.
 *
 * The projection is display-only. Checkout returns, session IDs, and this
 * state never authorize server actions.
 */
sealed interface ProductBillingState {
    val projection: EntitlementEnvelope?

    data class Idle(
        override val projection: EntitlementEnvelope? = null,
    ) : ProductBillingState

    data class Pending(
        override val projection: EntitlementEnvelope? = null,
    ) : ProductBillingState

    data class Confirmed(
        override val projection: EntitlementEnvelope,
    ) : ProductBillingState

    data class Error(
        override val projection: EntitlementEnvelope?,
        val message: String,
    ) : ProductBillingState
}

/**
 * Interprets a browser return without trusting it.
 *
 * A query can only put the UI into pending. Confirmed display requires a
 * complete shared envelope that says the server resolved a current grant.
 */
fun stateFromCheckoutReturn(
    query: String,
    projection: EntitlementEnvelope?,
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
        projection.confirmsServerResolvedPaidDisplay() ->
            ProductBillingState.Confirmed(requireNotNull(projection))
        returnedFromCheckout -> ProductBillingState.Pending(projection)
        else -> ProductBillingState.Idle(projection)
    }
}

internal fun EntitlementEnvelope?.confirmsServerResolvedPaidDisplay(): Boolean {
    val envelope = this ?: return false
    val validated = MinimizedEntitlementCodec.validate(envelope)
    return validated is EntitlementResult.Available &&
        envelope.entitlement.accessState == EntitlementAccessState.GRANTED
}
