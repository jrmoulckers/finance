// SPDX-License-Identifier: BUSL-1.1

package com.finance.db.repository.impl

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.finance.db.FinanceDatabase
import com.finance.db.repository.LiabilityInstallmentRepository
import com.finance.models.LiabilityInstallment
import com.finance.models.util.DateTimeUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.datetime.Instant
import kotlin.coroutines.CoroutineContext

/** SQLDelight-backed repository for liability installments. */
class SqlDelightLiabilityInstallmentRepository(
    private val db: FinanceDatabase,
    private val context: CoroutineContext = Dispatchers.Default,
) : LiabilityInstallmentRepository {

    private val queries get() = db.liabilityInstallmentQueries

    override fun observeAll(): Flow<List<LiabilityInstallment>> =
        queries.selectAll(::mapRow).asFlow().mapToList(context)

    override fun observeByLiability(liabilityId: String): Flow<List<LiabilityInstallment>> =
        queries.selectByLiability(liabilityId, ::mapRow).asFlow().mapToList(context)

    override fun observeByHousehold(householdId: String): Flow<List<LiabilityInstallment>> =
        queries.selectByHousehold(householdId, ::mapRow).asFlow().mapToList(context)

    override suspend fun getById(id: String): LiabilityInstallment? = withContext(context) {
        queries.selectById(id, ::mapRow).executeAsOneOrNull()
    }

    override suspend fun getOutstandingByHousehold(householdId: String): List<LiabilityInstallment> = withContext(context) {
        queries.selectOutstandingByHousehold(householdId, ::mapRow).executeAsList()
    }

    override suspend fun getDueBetween(householdId: String, startDate: String, endDate: String): List<LiabilityInstallment> =
        withContext(context) { queries.selectDueBetween(householdId, startDate, endDate, ::mapRow).executeAsList() }

    override suspend fun insert(entity: LiabilityInstallment) = withContext(context) {
        queries.insert(
            entity.id.value, entity.liabilityId.value, entity.householdId.value, entity.ownerId.value,
            entity.sequenceNumber.toLong(), entity.dueDate.toString(), entity.amount.amount,
            entity.currency.code, entity.status.name, entity.paidAt?.toString(),
            entity.paymentTransactionId?.value, entity.createdAt.toString(), entity.updatedAt.toString(),
            entity.syncVersion, 0L,
        )
    }

    override suspend fun update(entity: LiabilityInstallment) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.update(
            entity.sequenceNumber.toLong(), entity.dueDate.toString(), entity.amount.amount,
            entity.currency.code, entity.status.name, entity.paidAt?.toString(),
            entity.paymentTransactionId?.value, now, entity.syncVersion + 1, 0L, entity.id.value,
        )
    }

    override suspend fun markPaid(id: String, paidAt: Instant, paymentTransactionId: String?) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.markPaid(paidAt.toString(), paymentTransactionId, now, id)
    }

    override suspend fun softDelete(id: String) = withContext(context) {
        val now = DateTimeUtil.now().toString()
        queries.softDelete(now, now, id)
    }

    override suspend fun getUnsynced(): List<LiabilityInstallment> = withContext(context) {
        queries.selectUnsynced(::mapRow).executeAsList()
    }

    override suspend fun markSynced(id: String, syncVersion: Long) = withContext(context) {
        queries.markSynced(syncVersion, id)
    }

    @Suppress("LongParameterList")
    private fun mapRow(
        id: String, liabilityId: String, householdId: String, ownerId: String,
        sequenceNumber: Long, dueDate: String, amount: Long, currency: String, status: String,
        paidAt: String?, paymentTransactionId: String?, createdAt: String, updatedAt: String,
        deletedAt: String?, syncVersion: Long, isSynced: Long,
    ): LiabilityInstallment = EntityMappers.mapLiabilityInstallment(
        id, liabilityId, householdId, ownerId, sequenceNumber, dueDate, amount, currency,
        status, paidAt, paymentTransactionId, createdAt, updatedAt, deletedAt, syncVersion, isSynced,
    )
}
