// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.BuildConfig
import com.finance.android.sync.AndroidSyncManager
import com.finance.android.sync.ConnectivityObserver
import com.finance.android.ui.sync.SyncStatusViewModel
import com.finance.sync.DefaultSyncEngine
import com.finance.sync.SyncConfig
import com.finance.sync.SyncEngine
import com.finance.sync.SyncProvider
import com.finance.sync.auth.TokenManager
import com.finance.sync.auth.TokenStorage
import com.finance.sync.delta.DeltaSyncManager
import com.finance.sync.delta.InMemorySequenceTracker
import com.finance.sync.delta.SequenceTracker
import com.finance.sync.provider.HttpSyncProvider
import com.finance.sync.queue.InMemoryMutationQueue
import com.finance.sync.queue.MutationQueue
import org.koin.android.ext.koin.androidContext
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import org.koin.core.module.dsl.viewModelOf
import org.koin.core.qualifier.named
import org.koin.dsl.module

/**
 * Koin module for the sync subsystem.
 *
 * Wires together the shared KMP sync engine components with Android-specific
 * adapters ([ConnectivityObserver], [AndroidSyncManager]).
 *
 * ## Configuration
 * The PowerSync endpoint URL is read from `BuildConfig.POWERSYNC_URL`.
 * Set this in your `build.gradle.kts` via:
 * ```kotlin
 * buildConfigField("String", "POWERSYNC_URL", "\"https://your-instance.powersync.com\"")
 * ```
 */
val syncModule = module {

    // ── Sync configuration ──────────────────────────────────────────
    single {
        SyncConfig(
            endpoint = BuildConfig.POWERSYNC_URL,
            databaseName = "finance_sync.db",
        )
    }

    // ── Mutation queue (in-memory; swap to persistent for production) ─
    single<MutationQueue> { InMemoryMutationQueue() }

    // ── Sequence tracking for delta sync ────────────────────────────
    single<SequenceTracker> { InMemorySequenceTracker() }

    // ── Delta sync manager ──────────────────────────────────────────
    single { DeltaSyncManager(get(), get<SequenceTracker>(), get()) }

    // ── Token management ────────────────────────────────────────────
    single { TokenStorage() }
    single { TokenManager(get()) }

    // ── Network connectivity ────────────────────────────────────────
    single { ConnectivityObserver(androidContext()) }

    // ── Android sync manager ────────────────────────────────────────
    single {
        AndroidSyncManager(
            syncEngine = get(),
            mutationQueue = get(),
            connectivityObserver = get(),
        )
    }

    viewModelOf(::SyncStatusViewModel)
}
