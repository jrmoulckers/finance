// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository

import com.finance.models.LiabilityInstallment
import kotlinx.coroutines.flow.Flow
import kotlinx.datetime.Instant

/** Repository interface for scheduled liability installment CRUD operations. */
interface LiabilityInstallmentRepository : BaseRepository<LiabilityInstallment> {
    /** Observe installments for one liability in schedule order. */
    fun observeByLiability(liabilityId: String): Flow<List<LiabilityInstallment>>

    /** Observe all installments in a household by due date. */
    fun observeByHousehold(householdId: String): Flow<List<LiabilityInstallment>>

    /** Return outstanding installments in a household by due date. */
    suspend fun getOutstandingByHousehold(householdId: String): List<LiabilityInstallment>

    /** Return due installments in an inclusive ISO date range. */
    suspend fun getDueBetween(householdId: String, startDate: String, endDate: String): List<LiabilityInstallment>

    /** Mark one installment paid and optionally link it to the repayment transaction. */
    suspend fun markPaid(id: String, paidAt: Instant, paymentTransactionId: String? = null)
}
