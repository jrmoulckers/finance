// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.data.repository.*
import com.finance.desktop.data.repository.impl.*
import com.finance.desktop.viewmodel.*
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.bind
import org.koin.dsl.module

val appModule = module {
    singleOf(::InMemoryAccountRepository) bind AccountRepository::class
    singleOf(::InMemoryTransactionRepository) bind TransactionRepository::class
    singleOf(::InMemoryBudgetRepository) bind BudgetRepository::class
    singleOf(::InMemoryCategoryRepository) bind CategoryRepository::class
    singleOf(::InMemoryGoalRepository) bind GoalRepository::class

    single { DashboardViewModel(get(), get(), get()) }
    single { AccountsViewModel(get(), get()) }
    single { TransactionsViewModel(get()) }
}
