// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * A day in the bill calendar with all bills due on that date.
 *
 * @property date The calendar date.
 * @property bills List of bills due on this date.
 * @property totalAmount Sum of all bill amounts for this date in their original currencies.
 */
@Serializable
data class BillCalendarDay(
    val date: LocalDate,
    val bills: List<BillCalendarEntry>,
    val totalAmount: Cents,
) {
    /** Number of bills due on this date. */
    val billCount: Int get() = bills.size

    /** `true` if any bill on this date is overdue. */
    val hasOverdue: Boolean get() = bills.any { it.isOverdue }
}

/**
 * A single bill entry in the calendar.
 *
 * @property ruleId The recurring transaction rule for this bill.
 * @property merchant The payee/merchant name.
 * @property amount The expected bill amount.
 * @property dueDate The due date.
 * @property isPaid `true` if a matching transaction has been recorded for this cycle.
 * @property isOverdue `true` if the due date has passed without payment.
 */
@Serializable
data class BillCalendarEntry(
    val ruleId: SyncId,
    val merchant: String,
    val amount: Cents,
    val dueDate: LocalDate,
    val isPaid: Boolean = false,
    val isOverdue: Boolean = false,
)

/**
 * Monthly calendar view data for bills.
 *
 * @property year The calendar year.
 * @property month The calendar month (1–12).
 * @property days List of days with bills (only days that have bills are included).
 * @property totalDue Total amount due across all bills this month.
 * @property totalPaid Total amount already paid this month.
 * @property billCount Total number of bills this month.
 */
@Serializable
data class BillCalendarMonth(
    val year: Int,
    val month: Int,
    val days: List<BillCalendarDay>,
    val totalDue: Cents,
    val totalPaid: Cents,
    val billCount: Int,
) {
    /** Amount remaining to be paid this month. */
    val totalRemaining: Cents get() = totalDue - totalPaid

    /** Fraction of bills paid (0.0–1.0). */
    val paidFraction: Double get() = if (billCount > 0) {
        days.sumOf { day -> day.bills.count { it.isPaid } }.toDouble() / billCount
    } else {
        0.0
    }
}

/**
 * Bill confirmation flow states for auto-detected bills.
 */
@Serializable
enum class BillConfirmationAction {
    /** User confirms this is a recurring bill. */
    ACCEPT,

    /** User rejects — this is not a recurring bill. */
    REJECT,

    /** User wants to review later. */
    SNOOZE,
}

/**
 * An auto-detected bill presented to the user for confirmation.
 *
 * @property ruleId The auto-detected recurring rule to confirm.
 * @property merchant Detected merchant name.
 * @property amount Detected average amount.
 * @property frequency Detected recurrence frequency.
 * @property confidence Detection confidence in `[0.0, 1.0]`.
 * @property recentDates Recent transaction dates that contributed to detection.
 * @property action User's decision (null if not yet decided).
 */
@Serializable
data class BillConfirmation(
    val ruleId: SyncId,
    val merchant: String,
    val amount: Cents,
    val frequency: RecurrenceFrequency,
    val confidence: Double,
    val recentDates: List<LocalDate>,
    val action: BillConfirmationAction? = null,
) {
    init {
        require(confidence in 0.0..1.0) { "Confidence must be in [0.0, 1.0], was $confidence" }
    }

    /** `true` if the user has taken an action on this confirmation. */
    val isResolved: Boolean get() = action != null
}

/**
 * Tracks amount changes for a recurring bill across cycles.
 *
 * @property ruleId The recurring rule being tracked.
 * @property merchant The merchant name.
 * @property currentAmount The most recent bill amount.
 * @property previousAmount The previous cycle's amount.
 * @property amountChange The change in cents (positive = increase, negative = decrease).
 * @property changePercentage The percentage change.
 * @property history Recent amounts for trend analysis.
 */
@Serializable
data class BillAmountChange(
    val ruleId: SyncId,
    val merchant: String,
    val currentAmount: Cents,
    val previousAmount: Cents,
    val amountChange: Cents,
    val changePercentage: Double,
    val history: List<BillAmountRecord>,
) {
    /** `true` if the amount increased from the previous cycle. */
    val isIncrease: Boolean get() = amountChange.isPositive()

    /** `true` if the amount decreased from the previous cycle. */
    val isDecrease: Boolean get() = amountChange.isNegative()

    /** `true` if the change exceeds 10% (potential billing error or rate change). */
    val isSignificant: Boolean get() = kotlin.math.abs(changePercentage) > 10.0
}

/**
 * A single historical bill amount record.
 *
 * @property date The date the bill was paid.
 * @property amount The amount paid.
 */
@Serializable
data class BillAmountRecord(
    val date: LocalDate,
    val amount: Cents,
)
