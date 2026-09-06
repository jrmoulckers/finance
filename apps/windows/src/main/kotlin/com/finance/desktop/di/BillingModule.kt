// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.billing.ProductBillingRepository
import com.finance.desktop.billing.StripeProductBillingRepository
import org.koin.dsl.module

/** Direct-distribution billing. Microsoft Store remains a future provider adapter. */
val billingModule = module {
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
