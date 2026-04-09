// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.SavedStateHandle
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

/**
 * UI state for the Account edit form.
 *
 * Reuses the same field set as [AccountCreateUiState] but adds
 * [isLoaded] to distinguish "loading from repository" from
 * "ready to edit" and [isDeleted] for post-deletion navigation.
 */
data class AccountEditUiState(
    val name: String = "",
    val accountType: AccountType = AccountType.CHECKING,
    val currency: String = "USD",
    val initialBalance: String = "",
    val note: String = "",
    val errors: List<String> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val isLoading: Boolean = true,
    val isDeleted: Boolean = false,
)

/**
 * ViewModel for the Account edit screen.
 *
 * Loads the existing [Account] from [AccountRepository] via the
 * navigation argument `id`, populates the form, and persists
 * updates via [AccountRepository.update].
 *
 * @param savedStateHandle Navigation argument handle — must contain key `"id"`.
 * @param accountRepository Repository used to load and update the account.
 */
class AccountEditViewModel(
    savedStateHandle: SavedStateHandle,
    private val accountRepository: AccountRepository,
) : ViewModel() {

    private val accountId: SyncId = SyncId(
        checkNotNull(savedStateHandle["id"]) {
            "AccountEditViewModel requires navigation argument 'id'"
        },
    )

    private val _uiState = MutableStateFlow(AccountEditUiState())
    val uiState: StateFlow<AccountEditUiState> = _uiState.asStateFlow()

    /** Supported currency codes for the currency dropdown. */
    val supportedCurrencies: List<String> = listOf("USD", "EUR", "GBP", "JPY", "CAD")

    private var originalAccount: Account? = null

    init {
        viewModelScope.launch {
            val account = accountRepository.getById(accountId)
            if (account == null) {
                Timber.w("Account not found for editing: id=%s", accountId.value)
                _uiState.update {
                    it.copy(isLoading = false, errors = listOf("Account not found"))
                }
                return@launch
            }
            originalAccount = account
            val balanceStr = if (account.currentBalance.amount == 0L) "" else {
                val dollars = account.currentBalance.amount / 100.0
                if (dollars == dollars.toLong().toDouble()) {
                    dollars.toLong().toString()
                } else {
                    "%.2f".format(dollars)
                }
            }
            _uiState.update {
                it.copy(
                    name = account.name,
                    accountType = account.type,
                    currency = account.currency.code,
                    initialBalance = balanceStr,
                    isLoading = false,
                )
            }
        }
    }

    // ── Field updaters ──────────────────────────────────────────────

    fun updateName(name: String) {
        _uiState.update { it.copy(name = name.take(100), errors = emptyList()) }
    }

    fun updateAccountType(type: AccountType) {
        _uiState.update { it.copy(accountType = type, errors = emptyList()) }
    }

    fun updateCurrency(currency: String) {
        _uiState.update { it.copy(currency = currency, errors = emptyList()) }
    }

    fun updateInitialBalance(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        _uiState.update { it.copy(initialBalance = limited, errors = emptyList()) }
    }

    fun updateNote(note: String) {
        _uiState.update { it.copy(note = note.take(500), errors = emptyList()) }
    }

    // ── Validation ──────────────────────────────────────────────────

    private fun validate(state: AccountEditUiState): List<String> = buildList {
        if (state.name.isBlank()) add("Account name is required")
        if (state.name.length > 100) add("Account name is too long (max 100 characters)")
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
                val original = originalAccount ?: run {
                    _uiState.update {
                        it.copy(isSaving = false, errors = listOf("Account not found"))
                    }
                    return@launch
                }
                val s = _uiState.value
                val balanceCents = Cents.fromDollars(s.initialBalance.toDoubleOrNull() ?: 0.0)
                val updated = original.copy(
                    name = s.name.trim(),
                    type = s.accountType,
                    currency = Currency(s.currency),
                    currentBalance = balanceCents,
                    updatedAt = Clock.System.now(),
                )
                accountRepository.update(updated)
                Timber.d("Account updated: id=%s", accountId.value)
                _uiState.update { it.copy(isSaving = false, isSaved = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to update account")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to update account"),
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
                accountRepository.delete(accountId)
                Timber.d("Account deleted: id=%s", accountId.value)
                _uiState.update { it.copy(isSaving = false, isDeleted = true) }
            } catch (e: Exception) {
                Timber.e(e, "Failed to delete account")
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errors = listOf(e.message ?: "Failed to delete account"),
                    )
                }
            }
        }
    }
}
