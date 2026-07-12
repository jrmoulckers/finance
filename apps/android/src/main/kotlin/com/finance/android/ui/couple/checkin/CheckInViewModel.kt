// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.checkin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.ui.couple.wedding.WeddingRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.todayIn
import timber.log.Timber

/** A neutral, high-level category total for the check-in summary. */
data class CategorySummaryUi(val name: String, val amountFormatted: String)

/** UI state for the couples money check-in (#2150). */
data class CheckInUiState(
    val isLoading: Boolean = true,
    val enabled: Boolean = false,
    val frequency: CheckInFrequency = CheckInFrequency.WEEKLY,
    val shareSummaries: Boolean = true,
    val isDue: Boolean = false,
    val lastCheckInText: String = "No check-ins yet",
    val totalSpentFormatted: String = "$0.00",
    val transactionCount: Int = 0,
    val topCategories: List<CategorySummaryUi> = emptyList(),
    val weddingPaidFormatted: String = "$0.00",
    val prompts: List<CheckInPrompt> = emptyList(),
    val completedCount: Int = 0,
)

/**
 * ViewModel for supportive couples money check-ins (#2150).
 *
 * Builds a neutral, high-level summary (category totals, this-period spending,
 * wedding pace) — never a line-item feed — and pairs it with rotating,
 * collaborative discussion prompts. Everything is opt-in; the tone is
 * supportive, never a surveillance report.
 */
class CheckInViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
    private val weddingRepository: WeddingRepository,
    private val checkInRepository: CheckInRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckInUiState())
    val uiState: StateFlow<CheckInUiState> = _uiState.asStateFlow()

    private val currency: Currency = Currency.USD

    init {
        load()
    }

    fun setEnabled(enabled: Boolean) {
        checkInRepository.setEnabled(enabled)
        load()
    }

    fun setFrequency(frequency: CheckInFrequency) {
        checkInRepository.setFrequency(frequency)
        load()
    }

    fun setShareSummaries(share: Boolean) {
        checkInRepository.setShareSummaries(share)
        _uiState.update { it.copy(shareSummaries = share) }
    }

    /** Marks the current check-in complete, advancing the prompt rotation. */
    fun completeCheckIn() {
        val today = Clock.System.todayIn(TimeZone.currentSystemDefault()).toEpochDays().toLong()
        checkInRepository.recordCheckIn(today)
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID — skipping check-in load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            @Suppress("TooGenericExceptionCaught")
            try {
                val transactions = transactionRepository.observeAll(householdId).first()
                val categories = categoryRepository.observeAll(householdId).first()
                budgetRepository.observeAll(householdId).first() // touch to reflect budget context
                val wedding = weddingRepository.load()

                val today = Clock.System.todayIn(TimeZone.currentSystemDefault())
                val periodStart = today.toEpochDays() - checkInRepository.frequency().days
                val recentExpenses = transactions.filter {
                    it.type == TransactionType.EXPENSE && it.date.toEpochDays() >= periodStart
                }

                val totalSpent = recentExpenses.fold(0L) { s, t -> s + t.amount.amount }
                val categoryNames = categories.associate { it.id.value to it.name }
                val topCategories = recentExpenses
                    .groupBy { it.categoryId?.value }
                    .map { (catId, txns) ->
                        val name = catId?.let { categoryNames[it] } ?: "Uncategorized"
                        name to txns.fold(0L) { s, t -> s + t.amount.amount }
                    }
                    .sortedByDescending { it.second }
                    .take(TOP_CATEGORY_COUNT)
                    .map { (name, amount) ->
                        CategorySummaryUi(name, CurrencyFormatter.format(Cents(amount), currency))
                    }

                val weddingPaid = wedding.vendors.fold(0L) { s, v -> s + v.paid.amount }

                val lastEpoch = checkInRepository.lastCheckInEpochDay()
                val isDue = lastEpoch == null ||
                    (today.toEpochDays() - lastEpoch) >= checkInRepository.frequency().days

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        enabled = checkInRepository.isEnabled(),
                        frequency = checkInRepository.frequency(),
                        shareSummaries = checkInRepository.shareSummaries(),
                        isDue = isDue,
                        lastCheckInText = lastEpoch?.let { d ->
                            "Last check-in ${daysAgoText((today.toEpochDays() - d).toInt())}"
                        } ?: "No check-ins yet",
                        totalSpentFormatted = CurrencyFormatter.format(Cents(totalSpent), currency),
                        transactionCount = recentExpenses.size,
                        topCategories = topCategories,
                        weddingPaidFormatted = CurrencyFormatter.format(Cents(weddingPaid), currency),
                        prompts = CheckInContent.promptsFor(checkInRepository.completedCount()),
                        completedCount = checkInRepository.completedCount(),
                    )
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to load check-in")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun daysAgoText(days: Int): String = when {
        days <= 0 -> "today"
        days == 1 -> "yesterday"
        days < DAYS_IN_WEEK -> "$days days ago"
        else -> "${days / DAYS_IN_WEEK} week(s) ago"
    }

    private companion object {
        const val TOP_CATEGORY_COUNT = 4
        const val DAYS_IN_WEEK = 7
    }
}
