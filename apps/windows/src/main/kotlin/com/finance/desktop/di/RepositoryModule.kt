// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.desktop.data.repository.*
import com.finance.desktop.data.repository.impl.*
import com.finance.desktop.data.repository.impl.sqldelight.*
import com.finance.desktop.data.storage.UserDataPaths
import org.koin.core.module.dsl.singleOf
import org.koin.dsl.bind
import org.koin.dsl.module

/**
 * Koin module for repository bindings.
 *
 * Binds SQLDelight-backed repository implementations to their interfaces.
 * All repositories operate against the encrypted SQLite database provided
 * by [databaseModule]. The FinanceDatabase instance is injected by Koin.
 */
val repositoryModule = module {
    singleOf(::SqlDelightAccountRepository) bind AccountRepository::class
    singleOf(::SqlDelightTransactionRepository) bind TransactionRepository::class
    singleOf(::SqlDelightBudgetRepository) bind BudgetRepository::class
    singleOf(::SqlDelightCategoryRepository) bind CategoryRepository::class
    singleOf(::SqlDelightGoalRepository) bind GoalRepository::class

    // ── Settings repository (DPAPI-encrypted persistence) ──
    single<SettingsRepository> {
        DpapiSettingsRepository(
            dpapiManager = get(),
            storageDir = UserDataPaths.settingsDir,
        )
    }
}
