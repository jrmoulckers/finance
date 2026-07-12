// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickcash

import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Account
import com.finance.models.Category
import com.finance.models.types.Cents
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

/**
 * Immutable UI state for the quick cash entry surface.
 *
 * @property amountText the raw text shown in the amount field.
 * @property formattedAmount the parsed amount rendered with the account currency.
 * @property note optional note text.
 * @property cashAccounts cash-first list of accounts the user can record against.
 * @property selectedAccountId the account the entry will be saved to.
 * @property selectedAccountName display name of [selectedAccountId].
 * @property categories optional expense categories (income excluded).
 * @property selectedCategoryId optional chosen category.
 * @property errors deterministic validation failures, surfaced for accessibility.
 * @property isSaving true while the insert is in flight.
 * @property isSaved true once the entry has been persisted (UI dismisses on this).
 */
data class QuickCashUiState(
    val amountText: String = "",
    val formattedAmount: String = "",
    val note: String = "",
    val cashAccounts: List<Account> = emptyList(),
    val selectedAccountId: SyncId? = null,
    val selectedAccountName: String = "",
    val categories: List<Category> = emptyList(),
    val selectedCategoryId: SyncId? = null,
    val gigPresets: List<com.finance.android.ui.gig.ScheduleCPreset> =
        com.finance.android.ui.gig.ScheduleCPresets.presets,
    val selectedPresetKey: String? = null,
    val errors: List<QuickCashError> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
) {
    /** True when the current input is savable — drives the Save button enabled state. */
    val canSave: Boolean
        get() = !isSaving && selectedAccountId != null && amountText.isNotBlank()
}

/**
 * ViewModel for **true quick cash entry** (#2180).
 *
 * Unlike [com.finance.android.ui.viewmodel.TransactionCreateViewModel] (a 3-step wizard),
 * this drives a single, low-friction surface: the amount defaults to focus, the account
 * defaults to the user's cash wallet, and [save] persists the expense in one tap. All
 * decision logic is delegated to [QuickCashEntry] so it stays deterministic and unit
 * tested; this class only wires those helpers to repositories and reactive state.
 *
 * @param householdIdProvider provides the authenticated household scope.
 * @param transactionRepository persistence target for the new expense.
 * @param accountRepository source of the cash-first account list.
 * @param categoryRepository source of optional expense categories.
 * @param prefs optional store for the user's remembered default account/category.
 * @param clock injectable clock; defaults to the system clock for production.
 */
class QuickCashEntryViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository,
    private val prefs: SharedPreferences? = null,
    private val clock: Clock = Clock.System,
) : ViewModel() {

    private val _uiState = MutableStateFlow(QuickCashUiState())
    val uiState: StateFlow<QuickCashUiState> = _uiState.asStateFlow()

    private var accountMap: Map<SyncId, Account> = emptyMap()
    private var categoryMap: Map<SyncId, Category> = emptyMap()

    init {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping quick cash entry init")
                return@launch
            }
            val accounts = accountRepository.observeAll(householdId).first()
            val categories = categoryRepository.observeAll(householdId).first()
            accountMap = accounts.associateBy { it.id }
            categoryMap = categories.associateBy { it.id }

            val preferredAccountId = prefs?.getString(PREF_DEFAULT_ACCOUNT, null)?.let(::SyncId)
            val preferredCategoryId = prefs?.getString(PREF_DEFAULT_CATEGORY, null)?.let(::SyncId)
            val defaultAccount = QuickCashEntry.selectDefaultCashAccount(accounts, preferredAccountId)
            val defaultCategory = QuickCashEntry.selectDefaultCategory(categories, preferredCategoryId)
            val cashFirst = accounts
                .filter { it.deletedAt == null && !it.isArchived }
                .sortedWith(compareByDescending<Account> { it.type == com.finance.models.AccountType.CASH }
                    .thenBy { it.sortOrder })

            _uiState.update {
                it.copy(
                    cashAccounts = cashFirst,
                    selectedAccountId = defaultAccount?.id,
                    selectedAccountName = defaultAccount?.name.orEmpty(),
                    categories = categories.filter { c -> c.deletedAt == null && !c.isIncome },
                    selectedCategoryId = defaultCategory?.id,
                )
            }
        }
    }

    /** Updates the amount text and recomputes the formatted preview. */
    fun updateAmount(text: String) {
        val cents = QuickCashEntry.parseAmountToCents(text)
        val currency = currentCurrency()
        _uiState.update {
            it.copy(
                amountText = text,
                formattedAmount = if (cents in 1..QuickCashEntry.MAX_AMOUNT_CENTS) {
                    CurrencyFormatter.format(Cents(cents), currency)
                } else {
                    ""
                },
                errors = emptyList(),
            )
        }
    }

    /** Updates the optional note. */
    fun updateNote(note: String) {
        _uiState.update { it.copy(note = note, errors = emptyList()) }
    }

    /** Selects the cash account the entry will be recorded against. */
    fun selectAccount(id: SyncId) {
        _uiState.update {
            it.copy(
                selectedAccountId = id,
                selectedAccountName = accountMap[id]?.name.orEmpty(),
                errors = emptyList(),
            )
        }
        // Recompute formatted amount in case the account currency changed.
        updateAmount(_uiState.value.amountText)
    }

    /** Toggles the optional category. Selecting the active category clears it. */
    fun selectCategory(id: SyncId?) {
        _uiState.update { current ->
            current.copy(
                selectedCategoryId = if (id != null && current.selectedCategoryId == id) null else id,
                errors = emptyList(),
            )
        }
    }

    /**
     * Applies a Schedule C gig preset (#2141): pre-fills the note with the preset's
     * IRS-aligned label and tags the entry for later Schedule C export. Tapping the active
     * preset again clears it and the note it contributed.
     */
    fun applyPreset(key: String) {
        _uiState.update { current ->
            val preset = com.finance.android.ui.gig.ScheduleCPresets.byKey(key)
            if (preset == null) return@update current
            if (current.selectedPresetKey == key) {
                current.copy(selectedPresetKey = null, note = "", errors = emptyList())
            } else {
                current.copy(
                    selectedPresetKey = key,
                    note = com.finance.android.ui.gig.ScheduleCPresets.noteFor(preset),
                    errors = emptyList(),
                )
            }
        }
    }

    /** Builds a [QuickCashDraft] from the current state. */
    private fun draft(): QuickCashDraft = with(_uiState.value) {
        QuickCashDraft(
            amountCents = QuickCashEntry.parseAmountToCents(amountText),
            note = note,
            categoryId = selectedCategoryId,
            accountId = selectedAccountId,
            currency = currentCurrency(),
            scheduleCPresetKey = selectedPresetKey,
        )
    }

    /**
     * Validates and persists the quick cash expense. On success, remembers the chosen
     * account/category as defaults for next time and sets [QuickCashUiState.isSaved].
     */
    fun save() {
        val draft = draft()
        val errors = QuickCashEntry.validate(draft)
        if (errors.isNotEmpty()) {
            _uiState.update { it.copy(errors = errors) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errors = emptyList()) }
            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — cannot save quick cash entry")
                _uiState.update { it.copy(isSaving = false, errors = listOf(QuickCashError.NO_ACCOUNT)) }
                return@launch
            }
            val now = clock.now()
            val date = now.toLocalDateTime(TimeZone.currentSystemDefault()).date
            val transaction = QuickCashEntry.buildTransaction(draft, householdId, date, now)
            transactionRepository.insert(transaction)
            rememberDefaults(draft)
            _uiState.update { it.copy(isSaving = false, isSaved = true) }
        }
    }

    private fun rememberDefaults(draft: QuickCashDraft) {
        val editor = prefs?.edit() ?: return
        draft.accountId?.let { editor.putString(PREF_DEFAULT_ACCOUNT, it.value) }
        if (draft.categoryId != null) {
            editor.putString(PREF_DEFAULT_CATEGORY, draft.categoryId.value)
        } else {
            editor.remove(PREF_DEFAULT_CATEGORY)
        }
        editor.apply()
    }

    private fun currentCurrency() =
        _uiState.value.selectedAccountId?.let { accountMap[it]?.currency }
            ?: com.finance.models.types.Currency.USD

    private companion object {
        const val PREF_DEFAULT_ACCOUNT = "quickcash.defaultAccountId"
        const val PREF_DEFAULT_CATEGORY = "quickcash.defaultCategoryId"
    }
}
