// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.data.repository.*
import com.finance.desktop.data.repository.impl.*
import com.finance.desktop.sync.DesktopSyncProvider
import com.finance.desktop.viewmodel.*
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

val appModule = module {
    // ── Repositories (in-memory, to be replaced by SQLDelight-backed impls) ──
    singleOf(::InMemoryAccountRepository) bind AccountRepository::class
    singleOf(::InMemoryTransactionRepository) bind TransactionRepository::class
    singleOf(::InMemoryBudgetRepository) bind BudgetRepository::class
    singleOf(::InMemoryCategoryRepository) bind CategoryRepository::class
    singleOf(::InMemoryGoalRepository) bind GoalRepository::class

    // ── Sync infrastructure (KMP shared packages) ──
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

    // ── ViewModels ──
    single { DashboardViewModel(get(), get(), get()) }
    single { AccountsViewModel(get(), get()) }
    single { TransactionsViewModel(get()) }
    single { SyncViewModel(get()) }
}
