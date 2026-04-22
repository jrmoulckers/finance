// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.nlp

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.nlp.NaturalLanguageParser
import com.finance.core.nlp.ParseConfidence
import com.finance.core.nlp.ParseResult
import com.finance.core.nlp.TransactionInput
import com.finance.models.Category
import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.Job
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
import timber.log.Timber

/**
 * UI state for the Natural Language Transaction Input (#1118).
 */
data class NlpInputUiState(
    val inputText: String = "",
    val isParsingActive: Boolean = false,
    // Parsed result preview
    val parsedAmount: String? = null,
    val parsedPayee: String? = null,
    val parsedCategory: String? = null,
    val parsedDate: String? = null,
    val parsedType: TransactionType? = null,
    val confidence: ParseConfidence? = null,
    // Suggestions
    val suggestions: List<String> = emptyList(),
    val showSuggestions: Boolean = false,
    // Saving
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val errorMessage: String? = null,
    // Matched category
    val matchedCategoryId: SyncId? = null,
    val matchedAccountId: SyncId? = null,
)

/**
 * ViewModel for Natural Language Transaction Input (#1118).
 *
 * Provides real-time parsing of free-form text into structured transaction
 * data via the KMP [NaturalLanguageParser]. Supports autocomplete suggestions
 * from transaction history and category auto-detection.
 *
 * @param householdIdProvider Provides the current household scope.
 * @param transactionRepository Source for payee history and saving transactions.
 * @param categoryRepository Source for category matching.
 */
class NlpInputViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NlpInputUiState())
    val uiState: StateFlow<NlpInputUiState> = _uiState.asStateFlow()

    private val currency = Currency.USD
    private var parseJob: Job? = null
    private var payeeHistory: List<String> = emptyList()
    private var categories: List<Category> = emptyList()
    private var defaultAccountId: SyncId? = null

    init {
        loadSuggestionData()
    }

    private fun loadSuggestionData() {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value ?: return@launch
            val transactions = transactionRepository.observeAll(householdId).first()
            payeeHistory = transactions.mapNotNull { it.payee }.distinct()
            categories = categoryRepository.observeAll(householdId).first()

            // Use first account as default
            defaultAccountId = householdId
            Timber.d("NLP input loaded: %d payees, %d categories", payeeHistory.size, categories.size)
        }
    }

    fun onInputChanged(text: String) {
        _uiState.update { it.copy(inputText = text, errorMessage = null, isSaved = false) }

        // Cancel previous parse job
        parseJob?.cancel()

        if (text.isBlank()) {
            _uiState.update {
                it.copy(
                    parsedAmount = null, parsedPayee = null,
                    parsedCategory = null, parsedDate = null,
                    parsedType = null, confidence = null,
                    suggestions = emptyList(), showSuggestions = false,
                )
            }
            return
        }

        // Update autocomplete suggestions
        val suggestions = if (text.length >= 2) {
            payeeHistory.filter { it.lowercase().contains(text.lowercase()) }.take(5)
        } else {
            emptyList()
        }
        _uiState.update { it.copy(suggestions = suggestions, showSuggestions = suggestions.isNotEmpty()) }

        // Debounced parsing
        parseJob = viewModelScope.launch {
            delay(300)
            parseInput(text)
        }
    }

    fun onSuggestionSelected(suggestion: String) {
        _uiState.update { it.copy(inputText = suggestion, showSuggestions = false) }
        parseJob?.cancel()
        parseJob = viewModelScope.launch {
            parseInput(suggestion)
        }
    }

    fun dismissSuggestions() {
        _uiState.update { it.copy(showSuggestions = false) }
    }

    private fun parseInput(text: String) {
        _uiState.update { it.copy(isParsingActive = true) }

        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        when (val result = NaturalLanguageParser.parse(text, today)) {
            is ParseResult.Success -> {
                val txn = result.transaction
                val matchedCategory = txn.categoryHint?.let { hint ->
                    categories.find { it.name.equals(hint, ignoreCase = true) }
                }

                _uiState.update {
                    it.copy(
                        isParsingActive = false,
                        parsedAmount = CurrencyFormatter.format(txn.amount, currency),
                        parsedPayee = txn.payee,
                        parsedCategory = txn.categoryHint,
                        parsedDate = txn.date.toString(),
                        parsedType = txn.type,
                        confidence = txn.confidence,
                        matchedCategoryId = matchedCategory?.id,
                    )
                }
                Timber.d(
                    "NLP parsed: payee=%s, category=%s, confidence=%s",
                    txn.payee, txn.categoryHint, txn.confidence.name,
                )
            }
            is ParseResult.Failure -> {
                _uiState.update {
                    it.copy(
                        isParsingActive = false,
                        parsedAmount = null, parsedPayee = null,
                        parsedCategory = null, parsedDate = null,
                        parsedType = null, confidence = null,
                    )
                }
            }
        }
    }

    fun saveTransaction() {
        val state = _uiState.value
        if (state.parsedAmount == null) {
            _uiState.update { it.copy(errorMessage = "Could not parse a valid transaction") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, errorMessage = null) }
            try {
                val householdId = householdIdProvider.householdId.value
                    ?: error("No household ID")
                val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
                val parseResult = NaturalLanguageParser.parse(state.inputText, today)
                if (parseResult !is ParseResult.Success) {
                    _uiState.update {
                        it.copy(isSaving = false, errorMessage = "Could not parse transaction")
                    }
                    return@launch
                }

                val parsed = parseResult.transaction
                val now = Clock.System.now()
                val transaction = Transaction(
                    id = SyncId("nlp-${now.toEpochMilliseconds()}"),
                    householdId = householdId,
                    ownerId = householdId,
                    accountId = state.matchedAccountId ?: defaultAccountId ?: householdId,
                    categoryId = state.matchedCategoryId,
                    type = parsed.type,
                    status = TransactionStatus.CLEARED,
                    amount = if (parsed.type == TransactionType.EXPENSE) Cents(-parsed.amount.amount) else parsed.amount,
                    currency = currency,
                    payee = parsed.payee,
                    note = "Created via natural language: ${state.inputText}",
                    date = parsed.date,
                    createdAt = now,
                    updatedAt = now,
                )
                transactionRepository.insert(transaction)

                _uiState.update {
                    it.copy(
                        isSaving = false,
                        isSaved = true,
                        inputText = "",
                        parsedAmount = null, parsedPayee = null,
                        parsedCategory = null, parsedDate = null,
                        parsedType = null, confidence = null,
                    )
                }
                Timber.d("NLP transaction saved: id=%s", transaction.id.value)
            } catch (e: Exception) {
                Timber.e(e, "Failed to save NLP transaction")
                _uiState.update {
                    it.copy(isSaving = false, errorMessage = "Failed to save transaction")
                }
            }
        }
    }

    fun reset() {
        parseJob?.cancel()
        _uiState.update { NlpInputUiState() }
    }
}
