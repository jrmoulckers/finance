// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.data.repository.impl.InMemoryAccountRepository
import com.finance.android.data.repository.impl.InMemoryBudgetRepository
import com.finance.android.data.repository.impl.InMemoryCategoryRepository
import com.finance.android.data.repository.impl.InMemoryGoalRepository
import com.finance.android.data.repository.impl.InMemoryTransactionRepository
import org.koin.dsl.module

// TODO(#432): Replace in-memory implementations with SQLDelight-backed repositories

/**
 * Koin module providing the data layer (repositories).
 *
 * Each repository is bound as a singleton so that all consumers
 * (ViewModels, sync engine, etc.) share the same instance and
 * observe a single source of truth.
 *
 * The current bindings use in-memory stub implementations. Once
 * issue #432 is complete, swap each `InMemory*` class for the
 * corresponding SQLDelight-backed implementation.
 */
val dataModule = module {

    /** Transaction repository — manages income, expense, and transfer records. */
    single<TransactionRepository> { InMemoryTransactionRepository() }

    /** Account repository — manages bank, credit, cash, and investment accounts. */
    single<AccountRepository> { InMemoryAccountRepository() }

    /** Budget repository — manages spending budgets linked to categories. */
    single<BudgetRepository> { InMemoryBudgetRepository() }

    /** Category repository — manages income and expense categories. */
    single<CategoryRepository> { InMemoryCategoryRepository() }

    /** Goal repository — manages savings goals and progress tracking. */
    single<GoalRepository> { InMemoryGoalRepository() }
}
