// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/** Payment status for a liability repayment installment. */
@Serializable
enum class LiabilityInstallmentStatus { DUE, PAID, SKIPPED, VOID }

/**
 * One scheduled repayment in a first-class liability, such as a BNPL installment.
 */
@Serializable
data class LiabilityInstallment(
    val id: SyncId,
    val liabilityId: SyncId,
    val householdId: SyncId,
    val ownerId: SyncId,
    val sequenceNumber: Int,
    val dueDate: LocalDate,
    val amount: Cents,
    val currency: Currency,
    val status: LiabilityInstallmentStatus = LiabilityInstallmentStatus.DUE,
    val paidAt: Instant? = null,
    val paymentTransactionId: SyncId? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(sequenceNumber > 0) { "Installment sequence number must be positive" }
        require(amount.amount > 0L) { "Installment amount must be positive" }
        require(status != LiabilityInstallmentStatus.PAID || paidAt != null) {
            "Paid installments must include paidAt"
        }
    }

    /** True when this installment is still expected to affect future cash flow. */
    val isOutstanding: Boolean
        get() = deletedAt == null && status == LiabilityInstallmentStatus.DUE
}
