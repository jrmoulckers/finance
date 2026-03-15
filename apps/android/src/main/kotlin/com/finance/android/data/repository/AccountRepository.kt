// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.data.repository

import com.finance.models.Account
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.Flow

/**
 * Repository contract for [Account] entities.
 *
 * Extends [BaseRepository] with account-specific operations such as
 * filtering active (non-archived) accounts and updating balances.
 */
interface AccountRepository : BaseRepository<Account> {

    /**
     * Observes all non-deleted, non-archived accounts for a household,
     * ordered by [Account.sortOrder].
     *
     * @param householdId The household to scope the query to.
     */
    fun observeActive(householdId: SyncId): Flow<List<Account>>

    /**
     * Updates the current balance of an account.
     *
     * Marks the account as unsynced so the change is pushed on the
     * next sync cycle.
     *
     * @param id The account's [SyncId].
     * @param newBalance The new balance in [Cents].
     */
    suspend fun updateBalance(id: SyncId, newBalance: Cents)

    /**
     * Archives an account, hiding it from active views but retaining
     * its data and transaction history.
     *
     * @param id The account's [SyncId].
     */
    suspend fun archive(id: SyncId)
}
