// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.models.Budget
import com.finance.models.BudgetPeriod
import com.finance.models.Category
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber
import java.util.UUID

// TODO(#434): Replace with authenticated user's household ID
private val PLACEHOLDER_HOUSEHOLD_ID = SyncId("household-1")

/**
 * UI state for the Budget creation form.
 *
 * @property selectedCategory Currently selected category, or null if none chosen.
 * @property categories Available categories loaded from [CategoryRepository].
 * @property amount Text representation of the budgeted amount.
 * @property period Selected budget recurrence period (defaults to MONTHLY).
 * @property errors Validation error messages to display.
 * @property isSaving True while the save operation is in progress.
 * @property isSaved True after a successful save — triggers navigation back.
 */
data class BudgetCreateUiState(
    val selectedCategory: Category? = null,
    val categories: List<Category> = emptyList(),
    val amount: String = "",
    val period: BudgetPeriod = BudgetPeriod.MONTHLY,
    val errors: List<String> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
)

/**
 * ViewModel for the Budget creation screen.
 *
 * Loads available categories on initialization and manages form state,
 * validation, and persistence of new [Budget] entities via [BudgetRepository].
 *
 * @param budgetRepository Repository used to persist the new budget.
 * @param categoryRepository Repository used to load available categories.
 */
class BudgetCreateViewModel(
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BudgetCreateUiState())
    val uiState: StateFlow<BudgetCreateUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val categories = categoryRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
            _uiState.update { it.copy(categories = categories) }
        }
    }

    // ── Field updaters ──────────────────────────────────────────────

    /** Selects a category by its [SyncId], clearing previous errors. */
    fun selectCategory(id: SyncId) {
        val cat = _uiState.value.categories.find { it.id == id }
        _uiState.update { it.copy(selectedCategory = cat, errors = emptyList()) }
    }

    /** Updates the budgeted amount text, filtering to valid decimal input. */
    fun updateAmount(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        _uiState.update { it.copy(amount = limited, errors = emptyList()) }
    }

    /** Updates the selected budget period, clearing previous errors. */
    fun updatePeriod(period: BudgetPeriod) {
        _uiState.update { it.copy(period = period, errors = emptyList()) }
    }

    // ── Validation ──────────────────────────────────────────────────

    private fun validate(state: BudgetCreateUiState): List<String> = buildList {
        if (state.selectedCategory == null) add("Please select a category")
        val amountValue = state.amount.toDoubleOrNull() ?: 0.0
        if (amountValue <= 0.0) add("Budgeted amount must be greater than zero")
    }

    // ── Save ────────────────────────────────────────────────────────

    /**
     * Validates and persists the new budget.
     *
     * On success, sets [BudgetCreateUiState.isSaved] to `true` so the
     * composable layer can navigate back.
     */
    fun save() {
        val errors = validate(_uiState.value)
        if (errors.isNotEmpty()) {
            _uiState.update { it.copy(errors = errors) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errors = emptyList()) }
            try {
                val s = _uiState.value
                val now = Clock.System.now()
                val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date
                val amountCents = Cents.fromDollars(s.amount.toDoubleOrNull() ?: 0.0)

                val budget = Budget(
                    id = SyncId(UUID.randomUUID().toString()),
                    householdId = PLACEHOLDER_HOUSEHOLD_ID,
                    categoryId = s.selectedCategory!!.id,
                    name = s.selectedCategory.name,
                    amount = amountCents,
                    currency = Currency.USD,
                    period = s.period,
                    startDate = today,
                    createdAt = now,
                    updatedAt = now,
                )

                budgetRepository.insert(budget)
                Timber.d("Budget created: id=%s, period=%s", budget.id.value, budget.period)
                _uiState.update { it.copy(isSaving = false, isSaved = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to create budget")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to create budget"),
                    )
                }
            }
        }
    }
}
