// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.viewmodel

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Account
import com.finance.models.Category
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
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
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.math.abs

// TODO(#434): Replace with authenticated user's household ID
private val PLACEHOLDER_HOUSEHOLD_ID = SyncId("household-1")

enum class CreateStep(val index: Int, val label: String) {
    AMOUNT(0, "Amount & Payee"),
    CATEGORY(1, "Category & Account"),
    CONFIRM(2, "Confirm"),
}

data class TransactionCreateUiState(
    val currentStep: CreateStep = CreateStep.AMOUNT,
    val isEditing: Boolean = false,
    val transactionType: TransactionType = TransactionType.EXPENSE,
    val amountText: String = "",
    val amountCents: Long = 0L,
    val payee: String = "",
    val payeeSuggestions: List<String> = emptyList(),
    val selectedCategoryId: SyncId? = null,
    val selectedAccountId: SyncId? = null,
    val selectedTransferAccountId: SyncId? = null,
    val date: LocalDate = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date,
    val note: String = "",
    val categories: List<Category> = emptyList(),
    val accounts: List<Account> = emptyList(),
    val errors: List<String> = emptyList(),
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val formattedAmount: String = "",
    val selectedCategoryName: String = "",
    val selectedAccountName: String = "",
    val selectedTransferAccountName: String = "",
)

/**
 * ViewModel for Transaction Creation and Editing (#23 / #530).
 *
 * Drives a 3-step wizard flow (Amount → Category/Account → Confirm).
 * When the navigation argument `"id"` is present in [savedStateHandle], the ViewModel
 * enters **edit mode**: the existing transaction is pre-loaded into the form and
 * [save] calls [TransactionRepository.update] rather than [TransactionRepository.insert].
 *
 * @param savedStateHandle Navigation argument handle. When key `"id"` is present the ViewModel
 *   enters edit mode and pre-populates all form fields from the stored transaction.
 * @param transactionRepository Target repository for saving or updating transactions.
 * @param accountRepository Source for account list in the account picker.
 * @param categoryRepository Source for category list in the category picker.
 */
class TransactionCreateViewModel(
    savedStateHandle: SavedStateHandle,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(TransactionCreateUiState())
    val uiState: StateFlow<TransactionCreateUiState> = _uiState.asStateFlow()

    /** In-memory cache of payee history for autocomplete. */
    private var payeeHistory: List<String> = emptyList()

    /** In-memory cache of categories by ID for name lookups. */
    private var categoryMap: Map<SyncId, Category> = emptyMap()

    /** In-memory cache of accounts by ID for name lookups. */
    private var accountMap: Map<SyncId, Account> = emptyMap()

    /**
     * The original [Transaction] being edited in edit mode, or `null` in create mode.
     * Used to preserve immutable fields (id, householdId, createdAt, currency, etc.)
     * when [save] calls [TransactionRepository.update].
     */
    private var editingTransaction: Transaction? = null

    /** Navigation argument key used to distinguish edit mode from create mode. */
    private val editTransactionId: String? = savedStateHandle["id"]

    init {
        viewModelScope.launch {
            val cats = categoryRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
            val accts = accountRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
            payeeHistory = transactionRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first()
                .mapNotNull { it.payee }
                .distinct()
            categoryMap = cats.associateBy { it.id }
            accountMap = accts.associateBy { it.id }
            _uiState.update {
                it.copy(
                    categories = cats, accounts = accts,
                    selectedAccountId = accts.firstOrNull()?.id,
                    selectedAccountName = accts.firstOrNull()?.name ?: "",
                )
            }

            // Pre-populate form for edit mode when a transaction ID is present.
            if (editTransactionId != null) {
                val txn = transactionRepository.getById(SyncId(editTransactionId))
                if (txn != null) {
                    editingTransaction = txn
                    val absAmountCents = abs(txn.amount.amount)
                    val whole = absAmountCents / 100L
                    val frac = absAmountCents % 100L
                    val amountText = "$whole.${frac.toString().padStart(2, '0')}"
                    _uiState.update {
                        it.copy(
                            isEditing = true,
                            transactionType = txn.type,
                            amountText = amountText,
                            amountCents = absAmountCents,
                            payee = txn.payee ?: "",
                            selectedCategoryId = txn.categoryId,
                            selectedCategoryName = txn.categoryId?.let { id -> categoryMap[id]?.name } ?: "",
                            selectedAccountId = txn.accountId,
                            selectedAccountName = accountMap[txn.accountId]?.name ?: "",
                            selectedTransferAccountId = txn.transferAccountId,
                            selectedTransferAccountName = txn.transferAccountId
                                ?.let { id -> accountMap[id]?.name } ?: "",
                            date = txn.date,
                            note = txn.note ?: "",
                        )
                    }
                }
            }
        }
    }

    fun nextStep() {
        val s = _uiState.value
        val errs = validateStep(s)
        if (errs.isNotEmpty()) { _uiState.update { it.copy(errors = errs) }; return }
        _uiState.update { it.copy(errors = emptyList()) }
        when (s.currentStep) {
            CreateStep.AMOUNT -> _uiState.update { it.copy(currentStep = CreateStep.CATEGORY) }
            CreateStep.CATEGORY -> {
                val fmt = CurrencyFormatter.format(Cents(s.amountCents), Currency.USD)
                val cat = s.categories.find { it.id == s.selectedCategoryId }?.name ?: "None"
                val acct = s.accounts.find { it.id == s.selectedAccountId }?.name ?: "None"
                val xfer = if (s.transactionType == TransactionType.TRANSFER)
                    s.accounts.find { it.id == s.selectedTransferAccountId }?.name ?: "None" else ""
                _uiState.update { it.copy(currentStep = CreateStep.CONFIRM, formattedAmount = fmt,
                    selectedCategoryName = cat, selectedAccountName = acct,
                    selectedTransferAccountName = xfer) }
            }
            CreateStep.CONFIRM -> {}
        }
    }

    fun previousStep() {
        when (_uiState.value.currentStep) {
            CreateStep.AMOUNT -> {}
            CreateStep.CATEGORY -> _uiState.update { it.copy(currentStep = CreateStep.AMOUNT, errors = emptyList()) }
            CreateStep.CONFIRM -> _uiState.update { it.copy(currentStep = CreateStep.CATEGORY, errors = emptyList()) }
        }
    }

    fun updateTransactionType(type: TransactionType) {
        _uiState.update { it.copy(transactionType = type, selectedTransferAccountId = null,
            selectedTransferAccountName = "", errors = emptyList()) }
    }

    fun updateAmount(text: String) {
        val cleaned = text.filter { it.isDigit() || it == '.' }
        val parts = cleaned.split(".")
        val limited = if (parts.size > 1) "${parts[0]}.${parts[1].take(2)}" else cleaned
        val cents = ((limited.toDoubleOrNull() ?: 0.0) * 100).toLong()
        _uiState.update { it.copy(amountText = limited, amountCents = cents, errors = emptyList()) }
    }

    fun updatePayee(payee: String) {
        val suggestions = if (payee.length >= 2)
            payeeHistory.filter { it.lowercase().contains(payee.lowercase()) }.take(5)
        else emptyList()
        _uiState.update { it.copy(payee = payee, payeeSuggestions = suggestions, errors = emptyList()) }
    }

    fun selectPayeeSuggestion(p: String) {
        _uiState.update { it.copy(payee = p, payeeSuggestions = emptyList(), errors = emptyList()) }
    }

    fun selectCategory(id: SyncId) {
        _uiState.update { it.copy(selectedCategoryId = id,
            selectedCategoryName = categoryMap[id]?.name ?: "", errors = emptyList()) }
    }

    fun selectAccount(id: SyncId) {
        _uiState.update { it.copy(selectedAccountId = id,
            selectedAccountName = accountMap[id]?.name ?: "", errors = emptyList()) }
    }

    fun selectTransferAccount(id: SyncId) {
        _uiState.update { it.copy(selectedTransferAccountId = id,
            selectedTransferAccountName = accountMap[id]?.name ?: "", errors = emptyList()) }
    }

    fun updateDate(date: LocalDate) { _uiState.update { it.copy(date = date, errors = emptyList()) } }
    fun updateNote(note: String) { _uiState.update { it.copy(note = note, errors = emptyList()) } }

    fun save() {
        val errs = validateAll(_uiState.value)
        if (errs.isNotEmpty()) { _uiState.update { it.copy(errors = errs) }; return }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errors = emptyList()) }
            val s = _uiState.value
            val now = Clock.System.now()
            val amountCents = if (s.transactionType == TransactionType.INCOME)
                Cents(s.amountCents) else Cents(-s.amountCents)
            val existing = editingTransaction
            val transaction = existing?.copy(
                accountId = s.selectedAccountId!!,
                categoryId = s.selectedCategoryId,
                type = s.transactionType,
                amount = amountCents,
                payee = s.payee.ifBlank { null },
                note = s.note.ifBlank { null },
                date = s.date,
                transferAccountId = s.selectedTransferAccountId,
                updatedAt = now,
                isSynced = false,
            ) ?: Transaction(
                id = SyncId("txn-${now.toEpochMilliseconds()}"),
                householdId = PLACEHOLDER_HOUSEHOLD_ID,
                accountId = s.selectedAccountId!!,
                categoryId = s.selectedCategoryId,
                type = s.transactionType,
                status = TransactionStatus.CLEARED,
                amount = amountCents,
                currency = Currency.USD,
                payee = s.payee.ifBlank { null },
                note = s.note.ifBlank { null },
                date = s.date,
                transferAccountId = s.selectedTransferAccountId,
                createdAt = now,
                updatedAt = now,
            )
            if (existing != null) {
                transactionRepository.update(transaction)
            } else {
                transactionRepository.insert(transaction)
            }
            _uiState.update { it.copy(isSaving = false, isSaved = true) }
        }
    }

    private fun validateStep(s: TransactionCreateUiState): List<String> = when (s.currentStep) {
        CreateStep.AMOUNT -> buildList {
            if (s.amountCents <= 0L) add("Please enter a valid amount")
            if (s.payee.isBlank()) add("Please enter a payee")
            if (s.payee.length > 200) add("Payee name is too long (max 200)")
        }
        CreateStep.CATEGORY -> buildList {
            if (s.selectedCategoryId == null) add("Please select a category")
            if (s.selectedAccountId == null) add("Please select an account")
            if (s.transactionType == TransactionType.TRANSFER) {
                if (s.selectedTransferAccountId == null) add("Please select a destination account")
                else if (s.selectedTransferAccountId == s.selectedAccountId) add("Source and destination must differ")
            }
        }
        CreateStep.CONFIRM -> emptyList()
    }

    private fun validateAll(s: TransactionCreateUiState): List<String> = buildList {
        if (s.amountCents <= 0L) add("Please enter a valid amount")
        if (s.payee.isBlank()) add("Please enter a payee")
        if (s.selectedCategoryId == null) add("Please select a category")
        if (s.selectedAccountId == null) add("Please select an account")
        if (s.transactionType == TransactionType.TRANSFER && s.selectedTransferAccountId == null)
            add("Please select a destination account")
        if (s.note.length > 1000) add("Note is too long (max 1000)")
    }
}