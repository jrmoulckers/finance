// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.network

import okhttp3.OkHttpClient
import org.koin.core.qualifier.named
import org.koin.dsl.module
import timber.log.Timber

/**
 * Koin module providing network security components.
 *
 * Registers a certificate-pinned [OkHttpClient] as a named singleton
 * (`"pinned"`) so that all HTTP clients used for API communication
 * enforce TLS certificate pinning.
 *
 * ## Usage
 * ```kotlin
 * // In a Koin consumer:
 * val client: OkHttpClient by inject(named("pinned"))
 * ```
 *
 * Add this module to the Koin `startKoin { modules(...) }` call in
 * [com.finance.android.FinanceApplication].
 */
val networkSecurityModule = module {

    /**
     * Certificate-pinned OkHttpClient singleton.
     *
     * All API requests to Supabase and PowerSync endpoints MUST use
     * this client to enforce certificate pinning.
     */
    single(named("pinned")) {
        Timber.i("Initializing certificate-pinned OkHttpClient")
        CertificatePinningInterceptor.createPinnedClient()
    }
}
