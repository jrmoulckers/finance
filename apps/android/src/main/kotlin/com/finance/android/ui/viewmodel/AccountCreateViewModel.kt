// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.AccountRepository
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import timber.log.Timber
import java.util.UUID

// TODO(#434): Replace with authenticated user's household ID
private val PLACEHOLDER_HOUSEHOLD_ID = SyncId("household-1")

/**
 * UI state for the Account creation form.
 *
 * @property name User-entered account name.
 * @property accountType Selected account type (defaults to CHECKING).
 * @property currency ISO 4217 currency code (defaults to "USD").
 * @property initialBalance Text representation of the starting balance.
 * @property note Optional user note (max 500 chars).
 * @property errors Validation error messages to display.
 * @property isSaving True while the save operation is in progress.
 * @property isSaved True after a successful save — triggers navigation back.
 * @property isEditing Reserved for future edit-mode reuse.
 */
data class AccountCreateUiState(
    val name: String = "",
    val accountType: AccountType = AccountType.CHECKING,
    val currency: String = "USD",
    val initialBalance: String = "",
    val note: String = "",
    val errors: List<String> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val isEditing: Boolean = false,
)

/**
 * ViewModel for the Account creation screen.
 *
 * Manages form state, validation, and persistence of new [Account] entities
 * via [AccountRepository]. Follows the same reactive [StateFlow] pattern
 * used throughout the Finance app.
 *
 * @param accountRepository Repository used to persist the new account.
 */
class AccountCreateViewModel(
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AccountCreateUiState())
    val uiState: StateFlow<AccountCreateUiState> = _uiState.asStateFlow()

    /** Supported currency codes for the currency dropdown. */
    val supportedCurrencies: List<String> = listOf("USD", "EUR", "GBP", "JPY", "CAD")

    // ── Field updaters ──────────────────────────────────────────────

    /** Updates the account name, clearing previous errors. */
    fun updateName(name: String) {
        _uiState.update { it.copy(name = name.take(100), errors = emptyList()) }
    }

    /** Updates the selected account type, clearing previous errors. */
    fun updateAccountType(type: AccountType) {
        _uiState.update { it.copy(accountType = type, errors = emptyList()) }
    }

    /** Updates the selected currency code, clearing previous errors. */
    fun updateCurrency(currency: String) {
        _uiState.update { it.copy(currency = currency, errors = emptyList()) }
    }

    /** Updates the initial balance text, filtering to valid decimal input. */
    fun updateInitialBalance(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        _uiState.update { it.copy(initialBalance = limited, errors = emptyList()) }
    }

    /** Updates the optional note field, clearing previous errors. */
    fun updateNote(note: String) {
        _uiState.update { it.copy(note = note.take(500), errors = emptyList()) }
    }

    // ── Validation ──────────────────────────────────────────────────

    private fun validate(state: AccountCreateUiState): List<String> = buildList {
        if (state.name.isBlank()) add("Account name is required")
        if (state.name.length > 100) add("Account name is too long (max 100 characters)")
    }

    // ── Save ────────────────────────────────────────────────────────

    /**
     * Validates and persists the new account.
     *
     * On success, sets [AccountCreateUiState.isSaved] to `true` so the
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
                val balanceCents = Cents.fromDollars(s.initialBalance.toDoubleOrNull() ?: 0.0)

                val account = Account(
                    id = SyncId(UUID.randomUUID().toString()),
                    householdId = PLACEHOLDER_HOUSEHOLD_ID,
                    name = s.name.trim(),
                    type = s.accountType,
                    currency = Currency(s.currency),
                    currentBalance = balanceCents,
                    createdAt = now,
                    updatedAt = now,
                )

                accountRepository.insert(account)
                Timber.d("Account created: id=%s, type=%s", account.id.value, account.type)
                _uiState.update { it.copy(isSaving = false, isSaved = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to create account")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to create account"),
                    )
                }
            }
        }
    }
}
