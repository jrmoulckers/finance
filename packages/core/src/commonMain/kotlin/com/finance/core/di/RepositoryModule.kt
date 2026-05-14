// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.di

import com.finance.db.repository.AccountRepository
import com.finance.db.repository.BudgetRepository
import com.finance.db.repository.CategoryRepository
import com.finance.db.repository.GoalRepository
import com.finance.db.repository.TransactionRepository
import com.finance.db.repository.impl.SqlDelightAccountRepository
import com.finance.db.repository.impl.SqlDelightBudgetRepository
import com.finance.db.repository.impl.SqlDelightCategoryRepository
import com.finance.db.repository.impl.SqlDelightGoalRepository
import com.finance.db.repository.impl.SqlDelightTransactionRepository
import org.koin.core.module.Module
import org.koin.dsl.module

/**
 * Koin module providing all repository implementations.
 *
 * Requires a [com.finance.db.FinanceDatabase] instance in the DI graph.
 * Platform modules must provide the database via [com.finance.db.DatabaseFactory].
 */
val repositoryModule: Module = module {
    single<AccountRepository> { SqlDelightAccountRepository(get()) }
    single<TransactionRepository> { SqlDelightTransactionRepository(get()) }
    single<BudgetRepository> { SqlDelightBudgetRepository(get()) }
    single<GoalRepository> { SqlDelightGoalRepository(get()) }
    single<CategoryRepository> { SqlDelightCategoryRepository(get()) }
}

/** All shared KMP modules bundled for convenience. */
val sharedModules: List<Module> = listOf(repositoryModule)
