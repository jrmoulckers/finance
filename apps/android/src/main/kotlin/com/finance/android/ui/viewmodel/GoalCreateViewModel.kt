// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

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
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import timber.log.Timber
import java.util.UUID

/**
 * UI state for the Goal creation form.
 *
 * @property name User-entered goal name.
 * @property targetAmount Text representation of the target savings amount.
 * @property targetDate Selected target date, or null if not yet chosen.
 * @property selectedAccount Optionally linked account for this goal.
 * @property accounts Available accounts loaded from [AccountRepository].
 * @property note Optional user note (max 500 chars).
 * @property errors Validation error messages to display.
 * @property isSaving True while the save operation is in progress.
 * @property isSaved True after a successful save — triggers navigation back.
 */
data class GoalCreateUiState(
    val name: String = "",
    val targetAmount: String = "",
    val targetDate: LocalDate? = null,
    val selectedAccount: Account? = null,
    val accounts: List<Account> = emptyList(),
    val note: String = "",
    val errors: List<String> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
)

/**
 * ViewModel for the Goal creation screen.
 *
 * Loads available accounts on initialization and manages form state,
 * validation, and persistence of new [Goal] entities via [GoalRepository].
 *
 * @param householdIdProvider Provides the authenticated user's household ID.
 * @param goalRepository Repository used to persist the new goal.
 * @param accountRepository Repository used to load accounts for the optional link.
 */
class GoalCreateViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val goalRepository: GoalRepository,
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(GoalCreateUiState())
    val uiState: StateFlow<GoalCreateUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping accounts load")
                return@launch
            }
            val accounts = accountRepository.observeAll(householdId).first()
            _uiState.update { it.copy(accounts = accounts) }
        }
    }

    // ── Field updaters ──────────────────────────────────────────────

    /** Updates the goal name, clamped to 100 characters, clearing previous errors. */
    fun updateName(name: String) {
        _uiState.update { it.copy(name = name.take(100), errors = emptyList()) }
    }

    /** Updates the target amount text, filtering to valid decimal input. */
    fun updateTargetAmount(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        _uiState.update { it.copy(targetAmount = limited, errors = emptyList()) }
    }

    /** Updates the target date, clearing previous errors. */
    fun updateTargetDate(date: LocalDate) {
        _uiState.update { it.copy(targetDate = date, errors = emptyList()) }
    }

    /** Selects a linked account by its [SyncId], or deselects if null. */
    fun selectAccount(id: SyncId?) {
        val account = if (id != null) _uiState.value.accounts.find { it.id == id } else null
        _uiState.update { it.copy(selectedAccount = account, errors = emptyList()) }
    }

    /** Updates the optional note field, clamped to 500 characters. */
    fun updateNote(note: String) {
        _uiState.update { it.copy(note = note.take(500), errors = emptyList()) }
    }

    // ── Validation ──────────────────────────────────────────────────

    private fun validate(state: GoalCreateUiState): List<String> = buildList {
        if (state.name.isBlank()) add("Goal name is required")
        if (state.name.length > 100) add("Goal name is too long (max 100 characters)")
        val amountValue = state.targetAmount.toDoubleOrNull() ?: 0.0
        if (amountValue <= 0.0) add("Target amount must be greater than zero")
        if (state.targetDate == null) add("Target date is required")
        else {
            val today = Clock.System.now()
                .toLocalDateTime(TimeZone.currentSystemDefault()).date
            if (state.targetDate <= today) add("Target date must be in the future")
        }
    }

    // ── Save ────────────────────────────────────────────────────────

    /**
     * Validates and persists the new goal.
     *
     * On success, sets [GoalCreateUiState.isSaved] to `true` so the
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
                val householdId = householdIdProvider.householdId.value ?: run {
                    Timber.w("No household ID available — cannot create goal")
                    _uiState.update { it.copy(isSaving = false, errors = listOf("Not authenticated")) }
                    return@launch
                }
                val s = _uiState.value
                val now = Clock.System.now()
                val targetCents = Cents.fromDollars(s.targetAmount.toDoubleOrNull() ?: 0.0)

                val goal = Goal(
                    id = SyncId(UUID.randomUUID().toString()),
                    householdId = householdId,
                    name = s.name.trim(),
                    targetAmount = targetCents,
                    currentAmount = Cents.ZERO,
                    currency = Currency.USD,
                    targetDate = s.targetDate,
                    accountId = s.selectedAccount?.id,
                    createdAt = now,
                    updatedAt = now,
                )

                goalRepository.insert(goal)
                Timber.d("Goal created: id=%s", goal.id.value)
                _uiState.update { it.copy(isSaving = false, isSaved = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to create goal")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to create goal"),
                    )
                }
            }
        }
    }
}
