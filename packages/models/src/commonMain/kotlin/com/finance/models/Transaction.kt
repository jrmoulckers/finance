// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

@Serializable
enum class TransactionType { EXPENSE, INCOME, TRANSFER }

@Serializable
enum class TransactionStatus { PENDING, CLEARED, RECONCILED, VOID }

@Serializable
data class Transaction(
    val id: SyncId,
    val householdId: SyncId,
    val accountId: SyncId,
    val categoryId: SyncId? = null,
    val type: TransactionType,
    val status: TransactionStatus = TransactionStatus.CLEARED,
    val amount: Cents,
    val currency: Currency,
    val payee: String? = null,
    val note: String? = null,
    val date: LocalDate,
    val transferAccountId: SyncId? = null,
    val transferTransactionId: SyncId? = null,
    val isRecurring: Boolean = false,
    val recurringRuleId: SyncId? = null,
    val tags: List<String> = emptyList(),
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(amount.amount != 0L) { "Transaction amount cannot be zero" }
        if (type == TransactionType.TRANSFER) {
            require(transferAccountId != null) { "Transfer must have a destination account" }
        }
    }
}
