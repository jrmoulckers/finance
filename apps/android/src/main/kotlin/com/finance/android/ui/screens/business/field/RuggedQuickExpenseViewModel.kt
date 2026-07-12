// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.field

import androidx.lifecycle.ViewModel
import com.finance.android.ui.screens.business.BusinessCategory
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/** A recently saved quick expense shown for confirmation. */
data class QuickExpenseUi(
    val categoryLabel: String,
    val amountFormatted: String,
)

data class RuggedQuickExpenseUiState(
    val amountCents: Long = 0L,
    val amountFormatted: String = "$0.00",
    val selectedCategory: BusinessCategory? = null,
    val canSave: Boolean = false,
    val recent: List<QuickExpenseUi> = emptyList(),
    val lastSavedMessage: String? = null,
)

/**
 * ViewModel for the rugged one-handed quick-expense entry (#2186).
 *
 * Drives a large-target numeric keypad and oversized category buttons so an
 * operator with wet or gloved hands can log an expense in a few big taps
 * without opening hidden flows.
 */
class RuggedQuickExpenseViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(RuggedQuickExpenseUiState())
    val uiState: StateFlow<RuggedQuickExpenseUiState> = _uiState.asStateFlow()

    /** The big, common food-truck buckets surfaced as oversized buttons. */
    val quickCategories: List<BusinessCategory> = listOf(
        BusinessCategory.COGS,
        BusinessCategory.SUPPLIES,
        BusinessCategory.FUEL,
        BusinessCategory.LABOR,
    )

    /** Append a digit to the amount using cents-based entry (like a card reader). */
    fun pressDigit(digit: Int) {
        val next = _uiState.value.amountCents * 10 + digit
        if (next > MAX_CENTS) return
        update(next, _uiState.value.selectedCategory)
    }

    fun backspace() {
        update(_uiState.value.amountCents / 10, _uiState.value.selectedCategory)
    }

    fun clearAmount() = update(0L, _uiState.value.selectedCategory)

    fun selectCategory(category: BusinessCategory) {
        update(_uiState.value.amountCents, category)
    }

    fun save() {
        val state = _uiState.value
        val category = state.selectedCategory ?: return
        if (state.amountCents <= 0L) return
        val entry = QuickExpenseUi(
            categoryLabel = category.label,
            amountFormatted = CurrencyFormatter.format(Cents(state.amountCents), Currency.USD),
        )
        Timber.d("Rugged quick expense saved: %s %s", entry.categoryLabel, entry.amountFormatted)
        _uiState.update {
            it.copy(
                amountCents = 0L,
                amountFormatted = format(0L),
                selectedCategory = null,
                canSave = false,
                recent = (listOf(entry) + it.recent).take(RECENT_LIMIT),
                lastSavedMessage = "Saved ${entry.amountFormatted} to ${entry.categoryLabel}",
            )
        }
    }

    private fun update(cents: Long, category: BusinessCategory?) {
        _uiState.update {
            it.copy(
                amountCents = cents,
                amountFormatted = format(cents),
                selectedCategory = category,
                canSave = cents > 0L && category != null,
                lastSavedMessage = null,
            )
        }
    }

    private fun format(cents: Long): String = CurrencyFormatter.format(Cents(cents), Currency.USD)

    private companion object {
        const val MAX_CENTS = 99_999_99L
        const val RECENT_LIMIT = 5
    }
}
