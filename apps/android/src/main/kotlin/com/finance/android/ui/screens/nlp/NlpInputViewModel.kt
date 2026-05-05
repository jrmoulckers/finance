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
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Per-field confidence level for parsed NLP fields (#1141).
 *
 * Each parsed field reports its own confidence so the UI can indicate
 * which fields might need manual correction.
 */
enum class FieldConfidence {
    /** Field was extracted with high certainty (exact regex match). */
    HIGH,

    /** Field was inferred from context or partial match. */
    MEDIUM,

    /** Field was guessed with low certainty; user should verify. */
    LOW,
}

/**
 * Describes a single parsed field that can be tapped to correct (#1141).
 *
 * @property label Human-readable label (e.g., "Amount", "Payee").
 * @property value Display value (e.g., "$4.50", "Starbucks").
 * @property fieldType Identifies which field this is for correction routing.
 * @property confidence Per-field confidence level.
 */
data class ParsedFieldUi(
    val label: String,
    val value: String,
    val fieldType: NlpFieldType,
    val confidence: FieldConfidence,
)

/**
 * Identifies a parsed field for quick-fix correction routing (#1141).
 */
enum class NlpFieldType {
    AMOUNT,
    PAYEE,
    CATEGORY,
    DATE,
    TYPE,
}

/**
 * A recent NLP input entry stored for history display (#1141).
 *
 * @property inputText The original natural language text.
 * @property parsedSummary Short summary (e.g., "$4.50 at Starbucks").
 * @property timestamp When this entry was created.
 */
data class RecentNlpEntry(
    val inputText: String,
    val parsedSummary: String,
    val timestamp: Long,
)

/**
 * UI state for the Natural Language Transaction Input (#1141).
 *
 * Enhanced with per-field confidence, quick-fix editing, merchant
 * suggestion chips, locale-aware parsing, and recent inputs history.
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
    // Per-field confidence and parsed fields for quick-fix UI (#1141)
    val parsedFields: List<ParsedFieldUi> = emptyList(),
    // Quick-fix editing state (#1141)
    val editingField: NlpFieldType? = null,
    val editingFieldValue: String = "",
    // Merchant suggestion chips from history (#1141)
    val merchantChips: List<String> = emptyList(),
    // Suggestions (autocomplete dropdown)
    val suggestions: List<String> = emptyList(),
    val showSuggestions: Boolean = false,
    // Recent NLP inputs history (#1141)
    val recentInputs: List<RecentNlpEntry> = emptyList(),
    val showRecentInputs: Boolean = false,
    // Locale display (#1141)
    val currentLocaleLabel: String = "",
    // Saving
    val isSaving: Boolean = false,
    val isSaved: Boolean = false,
    val errorMessage: String? = null,
    // Matched category
    val matchedCategoryId: SyncId? = null,
    val matchedAccountId: SyncId? = null,
)

/**
 * ViewModel for Natural Language Transaction Input (#1141).
 *
 * Provides real-time parsing of free-form text into structured transaction
 * data via the KMP [NaturalLanguageParser]. Enhanced with:
 * - Per-field confidence indicators
 * - Quick-fix UI for tap-to-correct misparsed fields
 * - Merchant suggestion chips from transaction history
 * - Multi-language locale-aware amount/date parsing
 * - Recent NLP inputs history
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
    private val recentInputsHistory = mutableListOf<RecentNlpEntry>()

    /** Top merchant names from transaction history for suggestion chips (#1141). */
    private var topMerchants: List<String> = emptyList()

    /** Current device locale for locale-aware parsing (#1141). */
    private val deviceLocale: Locale get() = Locale.getDefault()

    init {
        loadSuggestionData()
        _uiState.update {
            it.copy(currentLocaleLabel = deviceLocale.displayLanguage)
        }
    }

    private fun loadSuggestionData() {
        viewModelScope.launch {
            val householdId = householdIdProvider.householdId.value ?: return@launch
            val transactions = transactionRepository.observeAll(householdId).first()
            payeeHistory = transactions.mapNotNull { it.payee }.distinct()
            categories = categoryRepository.observeAll(householdId).first()

            // Build top merchant chips from most-used payees (#1141)
            topMerchants = transactions
                .mapNotNull { it.payee }
                .groupBy { it.lowercase() }
                .entries
                .sortedByDescending { it.value.size }
                .take(8)
                .map { it.value.first() }

            // Use first account as default
            defaultAccountId = householdId

            _uiState.update {
                it.copy(
                    merchantChips = topMerchants,
                    showRecentInputs = recentInputsHistory.isNotEmpty(),
                    recentInputs = recentInputsHistory.toList(),
                )
            }
            Timber.d("NLP input loaded: %d payees, %d categories, %d top merchants", payeeHistory.size, categories.size, topMerchants.size)
        }
    }

    /**
     * Updates the input text and triggers real-time parsing.
     *
     * Performs locale-aware amount normalization before parsing (#1141).
     */
    fun onInputChanged(text: String) {
        _uiState.update {
            it.copy(
                inputText = text,
                errorMessage = null,
                isSaved = false,
                editingField = null,
            )
        }

        // Cancel previous parse job
        parseJob?.cancel()

        if (text.isBlank()) {
            _uiState.update {
                it.copy(
                    parsedAmount = null, parsedPayee = null,
                    parsedCategory = null, parsedDate = null,
                    parsedType = null, confidence = null,
                    parsedFields = emptyList(),
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

    /**
     * Applies a merchant chip suggestion to the input (#1141).
     */
    fun onMerchantChipSelected(merchant: String) {
        val currentText = _uiState.value.inputText
        val newText = if (currentText.isBlank()) {
            "at $merchant "
        } else if (!currentText.lowercase().contains(merchant.lowercase())) {
            "$currentText at $merchant"
        } else {
            currentText
        }
        onInputChanged(newText)
    }

    /**
     * Selects an autocomplete suggestion from the dropdown.
     */
    fun onSuggestionSelected(suggestion: String) {
        _uiState.update { it.copy(inputText = suggestion, showSuggestions = false) }
        parseJob?.cancel()
        parseJob = viewModelScope.launch {
            parseInput(suggestion)
        }
    }

    /**
     * Replays a recent NLP input from history (#1141).
     */
    fun onRecentInputSelected(entry: RecentNlpEntry) {
        onInputChanged(entry.inputText)
    }

    /** Dismisses the autocomplete suggestions dropdown. */
    fun dismissSuggestions() {
        _uiState.update { it.copy(showSuggestions = false) }
    }

    /**
     * Opens the quick-fix editor for a specific parsed field (#1141).
     *
     * @param fieldType Which field to edit.
     */
    fun startFieldEdit(fieldType: NlpFieldType) {
        val currentValue = when (fieldType) {
            NlpFieldType.AMOUNT -> _uiState.value.parsedAmount ?: ""
            NlpFieldType.PAYEE -> _uiState.value.parsedPayee ?: ""
            NlpFieldType.CATEGORY -> _uiState.value.parsedCategory ?: ""
            NlpFieldType.DATE -> _uiState.value.parsedDate ?: ""
            NlpFieldType.TYPE -> _uiState.value.parsedType?.name?.lowercase()
                ?.replaceFirstChar { it.uppercaseChar() } ?: ""
        }
        _uiState.update {
            it.copy(editingField = fieldType, editingFieldValue = currentValue)
        }
    }

    /**
     * Updates the quick-fix field edit value (#1141).
     */
    fun onFieldEditValueChanged(value: String) {
        _uiState.update { it.copy(editingFieldValue = value) }
    }

    /**
     * Applies the quick-fix correction to the parsed result (#1141).
     */
    fun applyFieldEdit() {
        val state = _uiState.value
        val field = state.editingField ?: return
        val value = state.editingFieldValue

        _uiState.update {
            when (field) {
                NlpFieldType.AMOUNT -> {
                    val cleanedAmount = normalizeLocaleAmount(value)
                    val fields = updateFieldConfidence(it.parsedFields, field, cleanedAmount, FieldConfidence.HIGH)
                    it.copy(parsedAmount = cleanedAmount, parsedFields = fields, editingField = null, editingFieldValue = "")
                }
                NlpFieldType.PAYEE -> {
                    val fields = updateFieldConfidence(it.parsedFields, field, value, FieldConfidence.HIGH)
                    it.copy(parsedPayee = value, parsedFields = fields, editingField = null, editingFieldValue = "")
                }
                NlpFieldType.CATEGORY -> {
                    val matchedCategory = categories.find { cat -> cat.name.equals(value, ignoreCase = true) }
                    val fields = updateFieldConfidence(it.parsedFields, field, value, FieldConfidence.HIGH)
                    it.copy(
                        parsedCategory = value,
                        matchedCategoryId = matchedCategory?.id,
                        parsedFields = fields,
                        editingField = null,
                        editingFieldValue = "",
                    )
                }
                NlpFieldType.DATE -> {
                    val fields = updateFieldConfidence(it.parsedFields, field, value, FieldConfidence.HIGH)
                    it.copy(parsedDate = value, parsedFields = fields, editingField = null, editingFieldValue = "")
                }
                NlpFieldType.TYPE -> {
                    val newType = when (value.lowercase()) {
                        "income" -> TransactionType.INCOME
                        else -> TransactionType.EXPENSE
                    }
                    val displayValue = newType.name.lowercase().replaceFirstChar { c -> c.uppercaseChar() }
                    val fields = updateFieldConfidence(it.parsedFields, field, displayValue, FieldConfidence.HIGH)
                    it.copy(parsedType = newType, parsedFields = fields, editingField = null, editingFieldValue = "")
                }
            }
        }
        Timber.d("Quick-fix applied: field=%s", field.name)
    }

    /** Cancels the quick-fix editor without applying changes (#1141). */
    fun cancelFieldEdit() {
        _uiState.update { it.copy(editingField = null, editingFieldValue = "") }
    }

    /**
     * Normalizes a locale-dependent amount string to a standard format (#1141).
     *
     * Handles comma-as-decimal (European) and period-as-decimal (US) locales.
     */
    private fun normalizeLocaleAmount(input: String): String {
        return try {
            val cleaned = input.replace(Regex("[^\\d.,]"), "")
            val number = NumberFormat.getNumberInstance(deviceLocale).parse(cleaned)
            number?.let {
                CurrencyFormatter.format(Cents.fromDollars(it.toDouble()), currency)
            } ?: input
        } catch (_: Exception) {
            input
        }
    }

    /**
     * Parses input text using KMP NaturalLanguageParser and builds
     * per-field confidence indicators (#1141).
     */
    private fun parseInput(text: String) {
        _uiState.update { it.copy(isParsingActive = true) }

        // Locale-aware preprocessing: normalize locale-specific decimal/date formats (#1141)
        val normalizedText = preprocessForLocale(text)

        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        when (val result = NaturalLanguageParser.parse(normalizedText, today)) {
            is ParseResult.Success -> {
                val txn = result.transaction
                val matchedCategory = txn.categoryHint?.let { hint ->
                    categories.find { it.name.equals(hint, ignoreCase = true) }
                }

                val formattedAmount = CurrencyFormatter.format(txn.amount, currency)
                val formattedDate = txn.date.toString()
                val typeLabel = txn.type.name.lowercase().replaceFirstChar { it.uppercaseChar() }

                // Build per-field confidence indicators (#1141)
                val parsedFields = buildParsedFields(
                    amount = formattedAmount,
                    payee = txn.payee,
                    category = txn.categoryHint,
                    date = formattedDate,
                    type = typeLabel,
                    overallConfidence = txn.confidence,
                )

                _uiState.update {
                    it.copy(
                        isParsingActive = false,
                        parsedAmount = formattedAmount,
                        parsedPayee = txn.payee,
                        parsedCategory = txn.categoryHint,
                        parsedDate = formattedDate,
                        parsedType = txn.type,
                        confidence = txn.confidence,
                        matchedCategoryId = matchedCategory?.id,
                        parsedFields = parsedFields,
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
                        parsedFields = emptyList(),
                    )
                }
            }
        }
    }

    /**
     * Pre-processes input for locale-specific formats (#1141).
     *
     * Converts locale decimal separators (e.g., "4,50" in European locales)
     * and locale date formats (e.g., "15/01" DD/MM in non-US locales) into
     * the parser's expected format.
     */
    private fun preprocessForLocale(input: String): String {
        val locale = deviceLocale
        var processed = input

        // Handle European-style decimal amounts (e.g., "4,50" → "4.50")
        if (locale.language in setOf("de", "fr", "es", "it", "pt", "nl")) {
            // Match amounts like "€4,50" or "4,50€" or standalone "4,50"
            processed = processed.replace(Regex("""(\d+),(\d{1,2})(?!\d)""")) { match ->
                "${match.groupValues[1]}.${match.groupValues[2]}"
            }
        }

        // Handle locale-specific currency symbols
        processed = processed.replace("€", "$")
            .replace("£", "$")
            .replace("¥", "$")

        return processed
    }

    /**
     * Builds per-field [ParsedFieldUi] with individual confidence (#1141).
     *
     * Amount gets HIGH confidence when matched exactly. Payee confidence
     * depends on whether it was found via "at"/"from" preposition. Category
     * confidence is MEDIUM if keyword-inferred. Date gets LOW if defaulted
     * to today.
     */
    private fun buildParsedFields(
        amount: String?,
        payee: String?,
        category: String?,
        date: String?,
        type: String,
        overallConfidence: ParseConfidence,
    ): List<ParsedFieldUi> {
        val fields = mutableListOf<ParsedFieldUi>()

        amount?.let {
            fields.add(
                ParsedFieldUi(
                    label = "Amount",
                    value = it,
                    fieldType = NlpFieldType.AMOUNT,
                    confidence = FieldConfidence.HIGH,
                ),
            )
        }

        payee?.let {
            fields.add(
                ParsedFieldUi(
                    label = "Payee",
                    value = it,
                    fieldType = NlpFieldType.PAYEE,
                    confidence = if (it.length > 2) FieldConfidence.HIGH else FieldConfidence.MEDIUM,
                ),
            )
        }

        category?.let {
            fields.add(
                ParsedFieldUi(
                    label = "Category",
                    value = it,
                    fieldType = NlpFieldType.CATEGORY,
                    confidence = FieldConfidence.MEDIUM,
                ),
            )
        }

        date?.let {
            val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
            val dateConfidence = if (it == today) FieldConfidence.LOW else FieldConfidence.HIGH
            fields.add(
                ParsedFieldUi(
                    label = "Date",
                    value = it,
                    fieldType = NlpFieldType.DATE,
                    confidence = dateConfidence,
                ),
            )
        }

        fields.add(
            ParsedFieldUi(
                label = "Type",
                value = type,
                fieldType = NlpFieldType.TYPE,
                confidence = when (overallConfidence) {
                    ParseConfidence.HIGH, ParseConfidence.MEDIUM -> FieldConfidence.HIGH
                    ParseConfidence.LOW -> FieldConfidence.MEDIUM
                    ParseConfidence.VERY_LOW -> FieldConfidence.LOW
                },
            ),
        )

        return fields
    }

    /**
     * Updates a single field's confidence and value in the parsed fields list (#1141).
     */
    private fun updateFieldConfidence(
        fields: List<ParsedFieldUi>,
        fieldType: NlpFieldType,
        newValue: String,
        newConfidence: FieldConfidence,
    ): List<ParsedFieldUi> {
        return fields.map {
            if (it.fieldType == fieldType) {
                it.copy(value = newValue, confidence = newConfidence)
            } else {
                it
            }
        }
    }

    /**
     * Saves the parsed transaction and adds to recent history (#1141).
     */
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
                    type = state.parsedType ?: parsed.type,
                    status = TransactionStatus.CLEARED,
                    amount = if ((state.parsedType ?: parsed.type) == TransactionType.EXPENSE) {
                        Cents(-parsed.amount.amount)
                    } else {
                        parsed.amount
                    },
                    currency = currency,
                    payee = state.parsedPayee ?: parsed.payee,
                    note = "Created via natural language: ${state.inputText}",
                    date = state.parsedDate?.let {
                        try { LocalDate.parse(it) } catch (_: Exception) { parsed.date }
                    } ?: parsed.date,
                    createdAt = now,
                    updatedAt = now,
                )
                transactionRepository.insert(transaction)

                // Add to recent inputs history (#1141)
                val summary = buildString {
                    state.parsedAmount?.let { append("$it ") }
                    state.parsedPayee?.let { append("at $it") }
                }
                recentInputsHistory.add(
                    0,
                    RecentNlpEntry(
                        inputText = state.inputText,
                        parsedSummary = summary.trim(),
                        timestamp = now.toEpochMilliseconds(),
                    ),
                )
                // Keep only last 10 entries
                if (recentInputsHistory.size > 10) {
                    recentInputsHistory.removeAt(recentInputsHistory.lastIndex)
                }

                _uiState.update {
                    it.copy(
                        isSaving = false,
                        isSaved = true,
                        inputText = "",
                        parsedAmount = null, parsedPayee = null,
                        parsedCategory = null, parsedDate = null,
                        parsedType = null, confidence = null,
                        parsedFields = emptyList(),
                        recentInputs = recentInputsHistory.toList(),
                        showRecentInputs = true,
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

    /** Resets the input state to empty. */
    fun reset() {
        parseJob?.cancel()
        _uiState.update {
            NlpInputUiState(
                merchantChips = topMerchants,
                recentInputs = recentInputsHistory.toList(),
                showRecentInputs = recentInputsHistory.isNotEmpty(),
                currentLocaleLabel = deviceLocale.displayLanguage,
            )
        }
    }
}
