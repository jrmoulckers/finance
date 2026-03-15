// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository for [Account] entities.
 *
 * Provides reactive read streams via [Flow] and suspend write operations.
 * Implementations may be backed by a local database, remote API, or
 * in-memory store (for previews / testing).
 */
interface AccountRepository {

    /** Observe all non-deleted accounts, ordered by [Account.sortOrder]. */
    fun getAll(): Flow<List<Account>>

    /** Observe a single account by its [SyncId], or `null` if not found. */
    fun getById(id: SyncId): Flow<Account?>

    /** Observe accounts filtered by [AccountType]. */
    fun getByType(type: AccountType): Flow<List<Account>>

    /** Insert a new account. */
    suspend fun create(account: Account)

    /** Update an existing account. */
    suspend fun update(account: Account)

    /** Soft-delete an account by its [SyncId]. */
    suspend fun delete(id: SyncId)
}
