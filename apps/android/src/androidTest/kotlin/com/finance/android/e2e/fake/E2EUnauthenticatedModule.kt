// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.e2e.fake

import com.finance.android.auth.AuthHouseholdIdProvider
import com.finance.android.auth.AuthViewModel
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.auth.SignupViewModel
import com.finance.android.auth.SupabaseAuthManager
import com.finance.sync.auth.AuthManager
import com.finance.sync.auth.TokenManager
import com.finance.sync.auth.TokenStorage
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import org.koin.core.module.dsl.viewModelOf
import org.koin.core.qualifier.named
import org.koin.dsl.bind
import org.koin.dsl.module

/**
 * Koin module for E2E tests that need to verify the login/sign-up UI.
 *
 * Uses [UnauthenticatedTokenStorage] so the app starts in the
 * unauthenticated state, displaying the login screen instead of
 * the authenticated main content.
 */
val e2eUnauthenticatedModule = module {

    single<TokenStorage> { UnauthenticatedTokenStorage() }
    single { TokenManager(get()) }

    single(named("auth")) {
        HttpClient(OkHttp) {
            install(ContentNegotiation) {
                json(
                    Json {
                        ignoreUnknownKeys = true
                        isLenient = true
                    },
                )
            }
        }
    }

    single {
        SupabaseAuthManager(
            tokenManager = get(),
            supabaseUrl = "https://fake-e2e.supabase.co",
            httpClient = get(named("auth")),
        )
    } bind AuthManager::class

    // ── Household ID provider ───────────────────────────────────────
    single<HouseholdIdProvider> { AuthHouseholdIdProvider(get()) }

    viewModelOf(::AuthViewModel)
    viewModelOf(::SignupViewModel)
}
