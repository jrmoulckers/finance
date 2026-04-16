// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.sync.DesktopSyncProvider
import com.finance.sync.DefaultSyncEngine
import com.finance.sync.SyncConfig
import com.finance.sync.SyncProvider
import com.finance.sync.delta.DeltaSyncManager
import com.finance.sync.delta.InMemorySequenceTracker
import com.finance.sync.delta.SequenceTracker
import com.finance.sync.queue.InMemoryMutationQueue
import com.finance.sync.queue.MutationQueue
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.bind
import org.koin.dsl.module

/**
 * Koin module for sync infrastructure from KMP shared packages.
 *
 * Wires the desktop sync provider, mutation queue, sequence tracker,
 * delta sync manager, and the top-level sync engine. The [SyncConfig]
 * specifies the remote endpoint and local database name.
 *
 * When moving to a production backend (PowerSync), update [SyncConfig]
 * and swap [DesktopSyncProvider] for a Ktor-backed implementation.
 */
val syncModule = module {
    single<SyncConfig> {
        SyncConfig(
            endpoint = "https://sync.finance.app",
            databaseName = "finance-desktop.db",
        )
    }
    singleOf(::DesktopSyncProvider) bind SyncProvider::class
    singleOf(::InMemoryMutationQueue) bind MutationQueue::class
    singleOf(::InMemorySequenceTracker) bind SequenceTracker::class
    single {
        DeltaSyncManager(
            provider = get(),
            sequenceTracker = get(),
            config = get(),
        )
    }
    single {
        DefaultSyncEngine(
            config = get(),
            provider = get(),
            mutationQueue = get(),
            deltaSyncManager = get(),
        )
    }
}
