// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.BuildConfig
import com.finance.android.auth.AuthViewModel
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
 * Koin module for the authentication subsystem.
 *
 * Provides secure token storage, the HTTP client for Supabase Auth
 * API calls, the [SupabaseAuthManager] implementation, and the
 * [AuthViewModel].
 *
 * ## Configuration
 * The Supabase URL is read from `BuildConfig.SUPABASE_URL`.
 * Set this in your `build.gradle.kts` via:
 * ```kotlin
 * buildConfigField("String", "SUPABASE_URL", "\"https://your-project.supabase.co\"")
 * ```
 * Or override at build time:
 * ```bash
 * ./gradlew :apps:android:assembleDebug -PSUPABASE_URL=https://your-project.supabase.co
 * ```
 */
val authModule = module {

    // ── Token storage & management ──────────────────────────────────────
    single { TokenStorage() }
    single { TokenManager(get()) }

    // ── HTTP client for Supabase Auth API ────────────────────────────────
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

    // ── Auth manager ────────────────────────────────────────────────────
    single {
        SupabaseAuthManager(
            tokenManager = get(),
            supabaseUrl = BuildConfig.SUPABASE_URL,
            httpClient = get(named("auth")),
        )
    } bind AuthManager::class

    // ── ViewModels ──────────────────────────────────────────────────────
    viewModelOf(::AuthViewModel)
    viewModelOf(::SignupViewModel)
}
