// SPDX-License-Identifier: BUSL-1.1

package com.finance.models

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/** Supported first-class liability categories. */
@Serializable
enum class LiabilityType { BNPL, LOAN, CREDIT_LINE, OTHER }

/** Lifecycle state for a manually tracked liability. */
@Serializable
enum class LiabilityStatus { ACTIVE, CLOSED, CANCELLED, DEFAULTED }

/**
 * First-class liability tracked separately from transactions and accounts.
 *
 * BNPL plans use [type] = [LiabilityType.BNPL] and store their repayment
 * schedule as [LiabilityInstallment] rows.
 */
@Serializable
data class Liability(
    val id: SyncId,
    val householdId: SyncId,
    val ownerId: SyncId,
    val type: LiabilityType,
    val status: LiabilityStatus = LiabilityStatus.ACTIVE,
    val provider: String,
    val merchantName: String,
    val originalAmount: Cents,
    val remainingBalance: Cents,
    val currency: Currency,
    val openedDate: LocalDate,
    val closedDate: LocalDate? = null,
    val accountId: SyncId? = null,
    val note: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(provider.isNotBlank()) { "Liability provider cannot be blank" }
        require(merchantName.isNotBlank()) { "Liability merchant name cannot be blank" }
        require(originalAmount.amount > 0L) { "Original liability amount must be positive" }
        require(remainingBalance.amount >= 0L) { "Remaining liability balance cannot be negative" }
        require(remainingBalance.amount <= originalAmount.amount) {
            "Remaining liability balance cannot exceed original amount"
        }
        require(closedDate == null || closedDate >= openedDate) {
            "Closed date cannot be before opened date"
        }
    }

    /** True when the liability still contributes to cash-flow and net-worth risk. */
    val isActive: Boolean get() = deletedAt == null && status == LiabilityStatus.ACTIVE
}
