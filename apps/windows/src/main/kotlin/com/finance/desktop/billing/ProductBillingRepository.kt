// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.billing

interface ProductBillingRepository {
    val channel: WindowsBillingChannel

    suspend fun startCheckout(
        choice: BillingCatalogChoice,
        householdIntent: String? = null,
    ): Result<String>

    suspend fun openPortal(): Result<String>

    suspend fun reconcile(): Result<Unit>
}
