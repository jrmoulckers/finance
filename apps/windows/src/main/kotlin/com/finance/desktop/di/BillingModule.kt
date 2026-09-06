// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.core.entitlement.EntitlementRepository
import com.finance.desktop.billing.ProductBillingRepository
import com.finance.desktop.billing.StripeProductBillingRepository
import com.finance.desktop.entitlement.DpapiEntitlementDisplayCache
import com.finance.desktop.entitlement.EntitlementDisplayCache
import com.finance.desktop.entitlement.EntitlementHouseholdSource
import com.finance.desktop.entitlement.SqlDelightEntitlementHouseholdSource
import com.finance.desktop.entitlement.WindowsEntitlementRepository
import org.koin.dsl.module

/** Direct-distribution billing. Microsoft Store remains a future provider adapter. */
val billingModule = module {
    single<EntitlementRepository> {
        val config = get<SupabaseConfig>()
        WindowsEntitlementRepository(
            httpClient = get(),
            supabaseUrl = config.url,
            supabaseAnonKey = config.anonKey,
            authRepository = get(),
        )
    }
    single<EntitlementDisplayCache> {
        DpapiEntitlementDisplayCache.createDefault(get())
    }
    single<EntitlementHouseholdSource> {
        SqlDelightEntitlementHouseholdSource(get())
    }
    single<ProductBillingRepository> {
        val config = get<SupabaseConfig>()
        StripeProductBillingRepository(
            httpClient = get(),
            supabaseUrl = config.url,
            supabaseAnonKey = config.anonKey,
            authRepository = get(),
        )
    }
}
