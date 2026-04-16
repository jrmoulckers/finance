// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.data.repository.*
import com.finance.desktop.data.repository.impl.*
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.bind
import org.koin.dsl.module

/**
 * Koin module for repository bindings.
 *
 * Binds in-memory repository implementations to their interfaces.
 * When SQLDelight-backed implementations are ready, swap them here
 * without touching any ViewModel or screen code.
 */
val repositoryModule = module {
    singleOf(::InMemoryAccountRepository) bind AccountRepository::class
    singleOf(::InMemoryTransactionRepository) bind TransactionRepository::class
    singleOf(::InMemoryBudgetRepository) bind BudgetRepository::class
    singleOf(::InMemoryCategoryRepository) bind CategoryRepository::class
    singleOf(::InMemoryGoalRepository) bind GoalRepository::class
}
