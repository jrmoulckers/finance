// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.data.repository.impl.SqlDelightAccountRepository
import com.finance.android.data.repository.impl.SqlDelightBudgetRepository
import com.finance.android.data.repository.impl.SqlDelightCategoryRepository
import com.finance.android.data.repository.impl.SqlDelightGoalRepository
import com.finance.android.data.repository.impl.SqlDelightTransactionRepository
import com.finance.android.security.KeystoreEncryptionKeyProvider
import com.finance.db.DatabaseFactory
import com.finance.db.EncryptionKeyProvider
import com.finance.db.FinanceDatabase
import org.koin.android.ext.koin.androidContext
import org.koin.dsl.module

/**
 * Koin module providing the data layer (database + repositories).
 *
 * Each repository is bound as a singleton so that all consumers
 * (ViewModels, sync engine, etc.) share the same instance and
 * observe a single source of truth backed by the SQLDelight
 * [FinanceDatabase].
 */
val dataModule = module {

    // ── Database ────────────────────────────────────────────────────

    /** Encryption key provider — stores the SQLCipher passphrase in Android Keystore. */
    single<EncryptionKeyProvider> { KeystoreEncryptionKeyProvider(androidContext()) }

    /** Database factory — creates the encrypted SQLDelight database driver. */
    single { DatabaseFactory(androidContext(), get()) }

    /** SQLDelight database — single source of truth for all local data. */
    single<FinanceDatabase> { get<DatabaseFactory>().createDatabase() }

    // ── Repositories ────────────────────────────────────────────────

    /** Transaction repository — manages income, expense, and transfer records. */
    single<TransactionRepository> { SqlDelightTransactionRepository(get()) }

    /** Account repository — manages bank, credit, cash, and investment accounts. */
    single<AccountRepository> { SqlDelightAccountRepository(get()) }

    /** Budget repository — manages spending budgets linked to categories. */
    single<BudgetRepository> { SqlDelightBudgetRepository(get()) }

    /** Category repository — manages income and expense categories. */
    single<CategoryRepository> { SqlDelightCategoryRepository(get()) }

    /** Goal repository — manages savings goals and progress tracking. */
    single<GoalRepository> { SqlDelightGoalRepository(get()) }
}
