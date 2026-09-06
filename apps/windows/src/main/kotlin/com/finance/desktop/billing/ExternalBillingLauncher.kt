// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

import java.awt.Desktop
import java.net.URI

private val TRUSTED_STRIPE_HOSTS = setOf("checkout.stripe.com", "billing.stripe.com")

/** Opens only Stripe-hosted HTTPS checkout and portal destinations. */
fun openTrustedStripeUrl(
    value: String,
    browse: (URI) -> Unit = { uri ->
        check(Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE))
        Desktop.getDesktop().browse(uri)
    },
) {
    val uri = URI(value)
    require(uri.scheme == "https" && uri.host in TRUSTED_STRIPE_HOSTS) {
        "Billing destination is not trusted."
    }
    browse(uri)
}
