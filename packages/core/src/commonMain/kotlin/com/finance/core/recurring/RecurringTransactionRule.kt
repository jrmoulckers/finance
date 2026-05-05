// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * A recurring transaction rule defining a repeating bill or income.
 *
 * This model represents the full metadata for a recurring bill/transaction,
 * including merchant, amount, frequency, and notification preferences.
 * It extends the scheduling concept from [RecurrenceRule] with financial
 * context needed for bill management.
 *
 * @property id Unique identifier for this rule.
 * @property ownerId Authenticated user who owns this rule.
 * @property householdId Household this rule belongs to.
 * @property merchant The payee/merchant name for this recurring bill.
 * @property amount Expected bill amount in cents.
 * @property currency Currency for the bill amount.
 * @property accountId Account to charge/credit.
 * @property categoryId Category for generated transactions.
 * @property recurrenceRule The scheduling rule (frequency, interval, start/end).
 * @property nextDueDate The next upcoming due date.
 * @property isAutoDetected `true` if this rule was auto-detected from transaction history.
 * @property isConfirmed `true` if the user has confirmed this rule (relevant for auto-detected rules).
 * @property note Optional user note.
 * @property createdAt Record creation timestamp.
 * @property updatedAt Last modification timestamp.
 * @property deletedAt Soft-delete timestamp.
 * @property syncVersion Sync versioning for conflict resolution.
 * @property isSynced Whether this record has been synced to the server.
 */
@Serializable
data class RecurringTransactionRule(
    val id: SyncId,
    val ownerId: SyncId,
    val householdId: SyncId,
    val merchant: String,
    val amount: Cents,
    val currency: Currency,
    val accountId: SyncId,
    val categoryId: SyncId? = null,
    val recurrenceRule: RecurrenceRule,
    val nextDueDate: LocalDate,
    val isAutoDetected: Boolean = false,
    val isConfirmed: Boolean = true,
    val note: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    val deletedAt: Instant? = null,
    val syncVersion: Long = 0,
    val isSynced: Boolean = false,
) {
    init {
        require(merchant.isNotBlank()) { "Merchant name cannot be blank" }
        require(amount.amount != 0L) { "Bill amount cannot be zero" }
    }
}
