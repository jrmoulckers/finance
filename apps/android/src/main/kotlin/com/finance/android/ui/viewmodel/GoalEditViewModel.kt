// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.models.Account
import com.finance.models.Goal
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
import kotlinx.datetime.LocalDate
import timber.log.Timber

/**
 * UI state for the Goal edit form.
 */
data class GoalEditUiState(
    val name: String = "",
    val targetAmount: String = "",
    val currentAmount: String = "",
    val targetDate: LocalDate? = null,
    val selectedAccount: Account? = null,
    val accounts: List<Account> = emptyList(),
    val note: String = "",
    val errors: List<String> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val isLoading: Boolean = true,
    val isDeleted: Boolean = false,
)

/**
 * ViewModel for the Goal edit screen.
 *
 * Loads the existing [Goal] from [GoalRepository] via navigation
 * argument `id`, populates the form, and persists updates.
 *
 * @param savedStateHandle Navigation argument handle — must contain key `"id"`.
 * @param householdIdProvider Provides the authenticated user's household ID.
 * @param goalRepository Repository used to load and update the goal.
 * @param accountRepository Repository used to load accounts for the optional link.
 */
class GoalEditViewModel(
    savedStateHandle: SavedStateHandle,
    private val householdIdProvider: HouseholdIdProvider,
    private val goalRepository: GoalRepository,
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val goalId: SyncId = SyncId(
        checkNotNull(savedStateHandle["id"]) {
            "GoalEditViewModel requires navigation argument 'id'"
        },
    )

    private val _uiState = MutableStateFlow(GoalEditUiState())
    val uiState: StateFlow<GoalEditUiState> = _uiState.asStateFlow()

    private var originalGoal: Goal? = null

    init {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value
            val accounts = if (householdId != null) {
                accountRepository.observeAll(householdId).first()
            } else {
                emptyList()
            }

            val goal = goalRepository.getById(goalId)
            if (goal == null) {
                Timber.w("Goal not found for editing: id=%s", goalId.value)
                _uiState.update {
                    it.copy(isLoading = false, errors = listOf("Goal not found"))
                }
                return@launch
            }

            originalGoal = goal
            val targetStr = formatCents(goal.targetAmount)
            val currentStr = formatCents(goal.currentAmount)
            val linkedAccount = goal.accountId?.let { aid -> accounts.find { it.id == aid } }

            _uiState.update {
                it.copy(
                    name = goal.name,
                    targetAmount = targetStr,
                    currentAmount = currentStr,
                    targetDate = goal.targetDate,
                    selectedAccount = linkedAccount,
                    accounts = accounts,
                    note = goal.note ?: "",
                    isLoading = false,
                )
            }
        }
    }

    private fun formatCents(cents: Cents): String {
        if (cents.amount == 0L) return ""
        val dollars = cents.amount / 100.0
        return if (dollars == dollars.toLong().toDouble()) {
            dollars.toLong().toString()
        } else {
            "%.2f".format(dollars)
        }
    }

    // ── Field updaters ──────────────────────────────────────────────

    fun updateName(name: String) {
        _uiState.update { it.copy(name = name.take(100), errors = emptyList()) }
    }

    fun updateTargetAmount(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        _uiState.update { it.copy(targetAmount = limited, errors = emptyList()) }
    }

    fun updateCurrentAmount(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        _uiState.update { it.copy(currentAmount = limited, errors = emptyList()) }
    }

    fun updateTargetDate(date: LocalDate) {
        _uiState.update { it.copy(targetDate = date, errors = emptyList()) }
    }

    fun selectAccount(id: SyncId?) {
        val account = if (id != null) _uiState.value.accounts.find { it.id == id } else null
        _uiState.update { it.copy(selectedAccount = account, errors = emptyList()) }
    }

    fun updateNote(note: String) {
        _uiState.update { it.copy(note = note.take(500), errors = emptyList()) }
    }

    // ── Validation ──────────────────────────────────────────────────

    private fun validate(state: GoalEditUiState): List<String> = buildList {
        if (state.name.isBlank()) add("Goal name is required")
        if (state.name.length > 100) add("Goal name is too long (max 100 characters)")
        val amountValue = state.targetAmount.toDoubleOrNull() ?: 0.0
        if (amountValue <= 0.0) add("Target amount must be greater than zero")
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
                val original = originalGoal ?: run {
                    _uiState.update {
                        it.copy(isSaving = false, errors = listOf("Goal not found"))
                    }
                    return@launch
                }
                val s = _uiState.value
                val targetCents = Cents.fromDollars(s.targetAmount.toDoubleOrNull() ?: 0.0)
                val currentCents = Cents.fromDollars(s.currentAmount.toDoubleOrNull() ?: 0.0)
                val updated = original.copy(
                    name = s.name.trim(),
                    targetAmount = targetCents,
                    currentAmount = currentCents,
                    targetDate = s.targetDate,
                    accountId = s.selectedAccount?.id,
                    updatedAt = Clock.System.now(),
                )
                goalRepository.update(updated)
                Timber.d("Goal updated: id=%s", goalId.value)
                _uiState.update { it.copy(isSaving = false, isSaved = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to update goal")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to update goal"),
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
                goalRepository.delete(goalId)
                Timber.d("Goal deleted: id=%s", goalId.value)
                _uiState.update { it.copy(isSaving = false, isDeleted = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to delete goal")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to delete goal"),
                    )
                }
            }
        }
    }
}
