// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.Liability
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.LocalDate

/** Repository interface for first-class liability CRUD operations. */
interface LiabilityRepository : BaseRepository<Liability> {
    /** Observe all liabilities in a household. */
    fun observeByHousehold(householdId: String): Flow<List<Liability>>

    /** Return all liabilities owned by a user. */
    suspend fun getByOwner(ownerId: String): List<Liability>

    /** Return active liabilities for a household. */
    suspend fun getActiveByHousehold(householdId: String): List<Liability>

    /** Update the remaining balance after installment payment or manual adjustment. */
    suspend fun updateRemainingBalance(id: String, remainingBalanceCents: Long)

    /** Close a liability once no further installments remain. */
    suspend fun close(id: String, closedDate: LocalDate)
}
