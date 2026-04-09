// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
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
import timber.log.Timber

/**
 * UI state for the Budget edit form.
 */
data class BudgetEditUiState(
    val selectedCategory: Category? = null,
    val categories: List<Category> = emptyList(),
    val amount: String = "",
    val period: BudgetPeriod = BudgetPeriod.MONTHLY,
    val errors: List<String> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val isLoading: Boolean = true,
    val isDeleted: Boolean = false,
)

/**
 * ViewModel for the Budget edit screen.
 *
 * Loads the existing [Budget] from [BudgetRepository] via navigation
 * argument `id`, populates the form, and persists updates.
 *
 * @param savedStateHandle Navigation argument handle — must contain key `"id"`.
 * @param householdIdProvider Provides the authenticated user's household ID.
 * @param budgetRepository Repository used to load and update the budget.
 * @param categoryRepository Repository used to load available categories.
 */
class BudgetEditViewModel(
    savedStateHandle: SavedStateHandle,
    private val householdIdProvider: HouseholdIdProvider,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val budgetId: SyncId = SyncId(
        checkNotNull(savedStateHandle["id"]) {
            "BudgetEditViewModel requires navigation argument 'id'"
        },
    )

    private val _uiState = MutableStateFlow(BudgetEditUiState())
    val uiState: StateFlow<BudgetEditUiState> = _uiState.asStateFlow()

    private var originalBudget: Budget? = null

    init {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value
            val categories = if (householdId != null) {
                categoryRepository.observeAll(householdId).first()
            } else {
                emptyList()
            }

            val budget = budgetRepository.getById(budgetId)
            if (budget == null) {
                Timber.w("Budget not found for editing: id=%s", budgetId.value)
                _uiState.update {
                    it.copy(isLoading = false, errors = listOf("Budget not found"))
                }
                return@launch
            }

            originalBudget = budget
            val selectedCat = categories.find { it.id == budget.categoryId }
            val amountStr = if (budget.amount.amount == 0L) "" else {
                val dollars = budget.amount.amount / 100.0
                if (dollars == dollars.toLong().toDouble()) {
                    dollars.toLong().toString()
                } else {
                    "%.2f".format(dollars)
                }
            }

            _uiState.update {
                it.copy(
                    categories = categories,
                    selectedCategory = selectedCat,
                    amount = amountStr,
                    period = budget.period,
                    isLoading = false,
                )
            }
        }
    }

    // ── Field updaters ──────────────────────────────────────────────

    fun selectCategory(id: SyncId) {
        val cat = _uiState.value.categories.find { it.id == id }
        _uiState.update { it.copy(selectedCategory = cat, errors = emptyList()) }
    }

    fun updateAmount(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        _uiState.update { it.copy(amount = limited, errors = emptyList()) }
    }

    fun updatePeriod(period: BudgetPeriod) {
        _uiState.update { it.copy(period = period, errors = emptyList()) }
    }

    // ── Validation ──────────────────────────────────────────────────

    private fun validate(state: BudgetEditUiState): List<String> = buildList {
        if (state.selectedCategory == null) add("Please select a category")
        val amountValue = state.amount.toDoubleOrNull() ?: 0.0
        if (amountValue <= 0.0) add("Budgeted amount must be greater than zero")
    }

    // ── Save ────────────────────────────────────────────────────────

    fun save() {
        val errors = validate(_uiState.value)
        if (errors.isNotEmpty()) {
            _uiState.update { it.copy(errors = errors) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errors = emptyList()) }
            try {
                val original = originalBudget ?: run {
                    _uiState.update {
                        it.copy(isSaving = false, errors = listOf("Budget not found"))
                    }
                    return@launch
                }
                val s = _uiState.value
                val amountCents = Cents.fromDollars(s.amount.toDoubleOrNull() ?: 0.0)
                val updated = original.copy(
                    categoryId = s.selectedCategory!!.id,
                    name = s.selectedCategory.name,
                    amount = amountCents,
                    period = s.period,
                    updatedAt = Clock.System.now(),
                )
                budgetRepository.update(updated)
                Timber.d("Budget updated: id=%s", budgetId.value)
                _uiState.update { it.copy(isSaving = false, isSaved = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to update budget")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to update budget"),
                    )
                }
            }
        }
    }

    // ── Delete ───────────────────────────────────────────────────────

    fun delete() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true) }
            try {
                budgetRepository.delete(budgetId)
                Timber.d("Budget deleted: id=%s", budgetId.value)
                _uiState.update { it.copy(isSaving = false, isDeleted = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to delete budget")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to delete budget"),
                    )
                }
            }
        }
    }
}
