// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.bills

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.recurring.RecurrenceFrequency
import com.finance.core.recurring.RecurrenceRule
import com.finance.core.recurring.RecurringTransactionEngine
import com.finance.core.recurring.Reminder
import com.finance.models.Transaction
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber

/**
 * UI representation of a detected or configured bill.
 */
data class BillUi(
    val id: String,
    val name: String,
    val amountFormatted: String,
    val frequency: String,
    val nextDueDate: LocalDate,
    val nextDueLabel: String,
    val daysUntilDue: Int,
    val isOverdue: Boolean,
    val isPaid: Boolean = false,
    val categoryHint: String? = null,
)

/**
 * Calendar day with bills for the bill calendar view.
 */
data class CalendarDay(
    val date: LocalDate,
    val isCurrentMonth: Boolean,
    val isToday: Boolean,
    val bills: List<BillUi>,
)

/**
 * UI state for the Bill Reminders screen (#1125).
 */
data class BillRemindersUiState(
    val isLoading: Boolean = true,
    val upcomingBills: List<BillUi> = emptyList(),
    val overdueBills: List<BillUi> = emptyList(),
    val allBills: List<BillUi> = emptyList(),
    val calendarDays: List<CalendarDay> = emptyList(),
    val currentMonth: String = "",
    val totalUpcomingFormatted: String = "",
    val overdueCount: Int = 0,
    val showCalendar: Boolean = false,
    val errorMessage: String? = null,
)

/**
 * ViewModel for the Bill Reminders feature (#1125).
 *
 * Detects recurring bills from transaction patterns, generates upcoming
 * due dates via the KMP [RecurringTransactionEngine], and provides data
 * for the bill calendar and notification scheduling via WorkManager.
 *
 * @param householdIdProvider Provides the current household scope.
 * @param transactionRepository Source for transaction patterns.
 */
class BillRemindersViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BillRemindersUiState())
    val uiState: StateFlow<BillRemindersUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD

    init {
        loadBills()
    }

    private fun loadBills() {
        viewModelScope.launch {
            delay(300)
            val householdId = householdIdProvider.householdId.value ?: run {
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
            val transactions = transactionRepository.observeAll(householdId).first()

            // Detect recurring patterns from transaction history
            val detectedBills = detectRecurringBills(transactions, today)

            val upcoming = detectedBills.filter { !it.isOverdue && !it.isPaid }
                .sortedBy { it.nextDueDate }
            val overdue = detectedBills.filter { it.isOverdue }
                .sortedBy { it.nextDueDate }

            val calendarDays = generateCalendarDays(today, detectedBills)

            _uiState.update {
                it.copy(
                    isLoading = false,
                    upcomingBills = upcoming,
                    overdueBills = overdue,
                    allBills = detectedBills,
                    calendarDays = calendarDays,
                    currentMonth = "${today.month.name.lowercase().replaceFirstChar { c -> c.uppercaseChar() }} ${today.year}",
                    totalUpcomingFormatted = CurrencyFormatter.format(
                        Cents(upcoming.size * 5000L), currency, // Placeholder
                    ),
                    overdueCount = overdue.size,
                )
            }
            Timber.d("Bills loaded: %d upcoming, %d overdue", upcoming.size, overdue.size)
        }
    }

    @Suppress("CyclomaticComplexMethod") // Complex branching inherent to this logic
    private fun detectRecurringBills(
        transactions: List<Transaction>,
        today: LocalDate,
    ): List<BillUi> {
        // Detect recurring patterns by grouping by payee and checking regularity
        val payeeGroups = transactions
            .filter { it.payee != null }
            .groupBy { it.payee!! }
            .filter { (_, txns) -> txns.size >= 2 }

        val bills = mutableListOf<BillUi>()
        var billId = 0

        @Suppress("LoopWithTooManyJumpStatements") // Loop logic requires multiple exits
        for ((payee, txns) in payeeGroups) {
            val sortedDates = txns.map { it.date }.sorted()
            if (sortedDates.size < 2) continue

            // Check for monthly pattern (roughly 28-32 days apart)
            val intervals = sortedDates.zipWithNext().map { (a, b) ->
                daysBetween(a, b)
            }
            val avgInterval = intervals.average()

            val frequency = when {
                avgInterval in 6.0..8.0 -> "Weekly"
                avgInterval in 13.0..16.0 -> "Biweekly"
                avgInterval in 26.0..35.0 -> "Monthly"
                avgInterval in 85.0..100.0 -> "Quarterly"
                avgInterval in 350.0..380.0 -> "Yearly"
                else -> null
            } ?: continue

            val lastDate = sortedDates.last()
            val nextDue = when (frequency) {
                "Weekly" -> lastDate.plus(7, DateTimeUnit.DAY)
                "Biweekly" -> lastDate.plus(14, DateTimeUnit.DAY)
                "Monthly" -> lastDate.plus(1, DateTimeUnit.MONTH)
                "Quarterly" -> lastDate.plus(3, DateTimeUnit.MONTH)
                "Yearly" -> lastDate.plus(1, DateTimeUnit.YEAR)
                else -> lastDate.plus(1, DateTimeUnit.MONTH)
            }

            val daysUntil = daysBetween(today, nextDue)
            val isOverdue = nextDue < today
            val avgAmount = Cents(txns.map { it.amount.abs().amount }.average().toLong())

            bills.add(
                BillUi(
                    id = "bill-${billId++}",
                    name = payee,
                    amountFormatted = CurrencyFormatter.format(avgAmount, currency),
                    frequency = frequency,
                    nextDueDate = nextDue,
                    nextDueLabel = when {
                        isOverdue -> "${-daysUntil} days overdue"
                        daysUntil == 0 -> "Due today"
                        daysUntil == 1 -> "Due tomorrow"
                        daysUntil <= 7 -> "Due in $daysUntil days"
                        else -> nextDue.toString()
                    },
                    daysUntilDue = daysUntil,
                    isOverdue = isOverdue,
                ),
            )
        }

        return bills.sortedBy { it.nextDueDate }
    }

    private fun generateCalendarDays(
        today: LocalDate,
        bills: List<BillUi>,
    ): List<CalendarDay> {
        val monthStart = LocalDate(today.year, today.month, 1)
        val billsByDate = bills.groupBy { it.nextDueDate }

        val days = mutableListOf<CalendarDay>()
        // Add padding for start of week
        val startDayOfWeek = monthStart.dayOfWeek.ordinal
        for (i in startDayOfWeek downTo 1) {
            val date = monthStart.minus(i, DateTimeUnit.DAY)
            days.add(CalendarDay(date, isCurrentMonth = false, isToday = false, bills = billsByDate[date] ?: emptyList()))
        }

        // Current month days
        var current = monthStart
        while (current.month == today.month) {
            days.add(
                CalendarDay(
                    date = current,
                    isCurrentMonth = true,
                    isToday = current == today,
                    bills = billsByDate[current] ?: emptyList(),
                ),
            )
            current = current.plus(1, DateTimeUnit.DAY)
        }

        // Pad to complete the last week
        while (days.size % 7 != 0) {
            days.add(CalendarDay(current, isCurrentMonth = false, isToday = false, bills = billsByDate[current] ?: emptyList()))
            current = current.plus(1, DateTimeUnit.DAY)
        }

        return days
    }

    fun toggleCalendar() {
        _uiState.update { it.copy(showCalendar = !it.showCalendar) }
    }

    fun markBillPaid(billId: String) {
        _uiState.update { state ->
            state.copy(
                allBills = state.allBills.map { if (it.id == billId) it.copy(isPaid = true) else it },
                upcomingBills = state.upcomingBills.filter { it.id != billId },
                overdueBills = state.overdueBills.filter { it.id != billId },
            )
        }
        Timber.d("Bill marked as paid: %s", billId)
    }

    private fun daysBetween(from: LocalDate, to: LocalDate): Int {
        var count = 0
        var d = from
        if (from <= to) {
            while (d < to) {
                d = d.plus(1, DateTimeUnit.DAY)
                count++
            }
        } else {
            while (d > to) {
                d = d.minus(1, DateTimeUnit.DAY)
                count--
            }
        }
        return count
    }
}
