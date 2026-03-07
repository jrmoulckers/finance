package com.finance.core.recurring

import com.finance.models.Transaction
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate

/**
 * A reminder for an upcoming or overdue recurring transaction.
 *
 * @property transactionTemplate The template [Transaction] that the recurring rule generates from.
 * @property ruleId The [SyncId] of the [RecurrenceRule] that produced this reminder.
 * @property dueDate The date the transaction is due.
 * @property daysBefore How many days before the due date this reminder fires (0 = on the day).
 * @property isOverdue Whether [dueDate] has already passed relative to the evaluation date.
 */
data class Reminder(
    val transactionTemplate: Transaction,
    val ruleId: SyncId,
    val dueDate: LocalDate,
    val daysBefore: Int,
    val isOverdue: Boolean,
) {
    init {
        require(daysBefore >= 0) { "daysBefore must be non-negative, was $daysBefore" }
    }
}
