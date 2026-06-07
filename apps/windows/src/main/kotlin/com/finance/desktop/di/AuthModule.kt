// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.data.repository.impl.DesktopAuthRepository
import com.finance.sync.auth.TokenManager
import com.finance.sync.auth.TokenStorage
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import org.koin.dsl.module

/**
 * Koin module for authentication infrastructure.
 *
 * Provides:
 * - Ktor [HttpClient] with OkHttp engine for Supabase REST API calls
 * - KMP [TokenStorage] and [TokenManager] for token lifecycle
 * - [DesktopAuthRepository] binding [AuthRepository] interface
 *
 * Supabase configuration is read from required environment variables:
 * - `SUPABASE_URL` — project URL (e.g., "https://xxx.supabase.co")
 * - `SUPABASE_ANON_KEY` — public/anonymous API key
 */
val authModule = createAuthModule()

internal fun createAuthModule(
    configProvider: () -> SupabaseConfig = { SupabaseConfig.fromEnvironment() },
) = module {
    single { configProvider() }

    // Ktor HTTP client for auth API calls
    single {
        HttpClient(OkHttp) {
            engine {
                config {
                    followRedirects(true)
                    connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                    readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                }
            }
        }
    }

    // KMP token storage and manager
    single { TokenStorage() }
    single { TokenManager(get()) }

    // Auth repository
    single<AuthRepository> {
        val config = get<SupabaseConfig>()
        DesktopAuthRepository(
            httpClient = get(),
            supabaseUrl = config.url,
            supabaseAnonKey = config.anonKey,
            secureTokenStorage = get(),
            tokenManager = get(),
        )
    }
}
