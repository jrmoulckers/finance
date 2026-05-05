// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.CategoryRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.*
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.text.NumberFormat
import java.util.Locale

// ─────────────────────────────────────────────────────────────────────────────
// Natural Language Input ViewModel — Sprint 21 (#237) + Enhancement (#1143)
// ─────────────────────────────────────────────────────────────────────────────

/** Confidence level for a single parsed field. */
enum class FieldConfidence {
    /** The field was parsed with high reliability (exact match or strong signal). */
    HIGH,

    /** The field was parsed but may need user review. */
    MEDIUM,

    /** The field was guessed from weak signals and likely needs correction. */
    LOW,

    /** The field was not detected in the input. */
    NONE,
}

/** Per-field parse result with individual confidence. */
data class ParsedField<T>(
    val value: T?,
    val confidence: FieldConfidence,
    val source: String = "",
)

/** Parsed result from a natural language input string with per-field confidence. */
data class ParsedTransaction(
    val amount: Cents?,
    val currency: Currency,
    val payee: String?,
    val category: String?,
    val date: LocalDate?,
    val type: TransactionType,
    val confidence: Float,
    val rawInput: String,
    val amountConfidence: FieldConfidence = FieldConfidence.NONE,
    val payeeConfidence: FieldConfidence = FieldConfidence.NONE,
    val categoryConfidence: FieldConfidence = FieldConfidence.NONE,
    val dateConfidence: FieldConfidence = FieldConfidence.NONE,
    val typeConfidence: FieldConfidence = FieldConfidence.NONE,
)

/** Autocomplete suggestion for the NL input field. */
data class NlSuggestion(
    val text: String,
    val type: String, // "payee", "category", "amount"
)

/** The field currently being edited via the quick-fix UI. */
enum class EditingField { AMOUNT, PAYEE, CATEGORY, DATE, TYPE, NONE }

/** A recent NLP input that was successfully submitted. */
data class RecentNlpInput(
    val rawInput: String,
    val payee: String?,
    val amount: String,
    val timestamp: Instant,
)

data class NaturalLanguageUiState(
    val inputText: String = "",
    val parsedTransaction: ParsedTransaction? = null,
    val suggestions: List<NlSuggestion> = emptyList(),
    val showSuggestions: Boolean = false,
    val isProcessing: Boolean = false,
    val recentPayees: List<String> = emptyList(),
    val availableCategories: List<String> = emptyList(),
    val successMessage: String? = null,
    val errorMessage: String? = null,
    val editingField: EditingField = EditingField.NONE,
    val editFieldValue: String = "",
    val recentInputs: List<RecentNlpInput> = emptyList(),
    val showRecentInputs: Boolean = false,
    val userLocale: Locale = Locale.getDefault(),
)

/**
 * ViewModel for the Natural Language Transaction Input feature.
 *
 * Parses free-text input like "Spent $42.50 at Whole Foods on groceries yesterday"
 * into structured transaction data. Provides:
 * - Inline parsing preview with per-field confidence indicators
 * - Merchant suggestion chips from transaction history
 * - Multi-language / locale-aware amount and date parsing
 * - Quick-fix UI to correct misparsed fields inline
 * - Recent NLP inputs history for quick reuse
 *
 * Transaction creation delegates to [TransactionRepository].
 */
class NaturalLanguageViewModel(
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(NaturalLanguageUiState())
    val uiState: StateFlow<NaturalLanguageUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    /** Maximum number of recent inputs to retain. */
    private val maxRecentInputs = 10

    init {
        loadSuggestionData()
    }

    private fun loadSuggestionData() {
        viewModelScope.launch {
            val transactions = transactionRepository.observeAll(hid).first()
            val categories = categoryRepository.observeAll(hid).first()
            val payees = transactions.mapNotNull { it.payee }.distinct().sorted()
            val categoryNames = categories.map { it.name }.sorted()

            _uiState.value = _uiState.value.copy(
                recentPayees = payees,
                availableCategories = categoryNames,
            )
        }
    }

    /** Updates the input text and re-parses in real time. */
    fun updateInput(text: String) {
        _uiState.value = _uiState.value.copy(
            inputText = text,
            errorMessage = null,
            successMessage = null,
        )

        if (text.isBlank()) {
            _uiState.value = _uiState.value.copy(
                parsedTransaction = null,
                suggestions = emptyList(),
                showSuggestions = false,
            )
            return
        }

        // Generate suggestions
        val suggestions = generateSuggestions(text)
        _uiState.value = _uiState.value.copy(
            suggestions = suggestions,
            showSuggestions = suggestions.isNotEmpty(),
        )

        // Parse the input with locale awareness
        val parsed = parseInput(text, _uiState.value.userLocale)
        _uiState.value = _uiState.value.copy(parsedTransaction = parsed)
    }

    /** Applies a selected suggestion to the input text. */
    fun applySuggestion(suggestion: NlSuggestion) {
        val currentText = _uiState.value.inputText
        val newText = when (suggestion.type) {
            "payee" -> {
                // Replace partial payee with full name
                val words = currentText.split(" ").toMutableList()
                if (words.isNotEmpty()) {
                    words[words.lastIndex] = suggestion.text
                }
                words.joinToString(" ")
            }
            else -> "$currentText ${suggestion.text}"
        }
        updateInput(newText)
        _uiState.value = _uiState.value.copy(showSuggestions = false)
    }

    /** Dismisses the suggestion dropdown. */
    fun dismissSuggestions() {
        _uiState.value = _uiState.value.copy(showSuggestions = false)
    }

    /** Creates a transaction from the parsed input and records to recent history. */
    fun createTransaction() {
        val parsed = _uiState.value.parsedTransaction
        if (parsed == null || parsed.amount == null) {
            _uiState.value = _uiState.value.copy(
                errorMessage = "Could not parse a valid transaction. Include an amount like '$25.00'.",
            )
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isProcessing = true)

            val now = Clock.System.now()
            val txn = Transaction(
                id = SyncId("nl-${now.toEpochMilliseconds()}"),
                householdId = hid,
                ownerId = hid,
                accountId = SyncId("a1"), // Default account
                amount = parsed.amount,
                currency = parsed.currency,
                type = parsed.type,
                date = parsed.date ?: Clock.System.now()
                    .toLocalDateTime(TimeZone.currentSystemDefault()).date,
                payee = parsed.payee,
                categoryId = null, // Would map from category name
                note = "Created via natural language: ${parsed.rawInput}",
                createdAt = now,
                updatedAt = now,
            )

            transactionRepository.insert(txn)

            // Add to recent history
            val recentEntry = RecentNlpInput(
                rawInput = parsed.rawInput,
                payee = parsed.payee,
                amount = formatCents(parsed.amount, parsed.currency),
                timestamp = now,
            )
            val updatedRecent = (listOf(recentEntry) + _uiState.value.recentInputs)
                .take(maxRecentInputs)

            _uiState.value = _uiState.value.copy(
                isProcessing = false,
                inputText = "",
                parsedTransaction = null,
                recentInputs = updatedRecent,
                successMessage = "Transaction created: ${parsed.payee ?: "Unknown"} for ${formatCents(parsed.amount, parsed.currency)}",
            )

            // Clear success after delay
            kotlinx.coroutines.delay(3000)
            _uiState.value = _uiState.value.copy(successMessage = null)
        }
    }

    /** Clears the input field and resets all parse state. */
    fun clearInput() {
        _uiState.value = _uiState.value.copy(
            inputText = "",
            parsedTransaction = null,
            suggestions = emptyList(),
            showSuggestions = false,
            errorMessage = null,
            successMessage = null,
            editingField = EditingField.NONE,
            editFieldValue = "",
        )
    }

    // ── Quick-fix field editing ──────────────────────────────────────────────

    /**
     * Begins editing a parsed field via the quick-fix UI.
     * The current value is pre-populated for the user to correct.
     */
    fun startEditingField(field: EditingField) {
        val parsed = _uiState.value.parsedTransaction ?: return
        val currentValue = when (field) {
            EditingField.AMOUNT -> parsed.amount?.let {
                String.format("%.2f", it.amount / 100.0)
            } ?: ""
            EditingField.PAYEE -> parsed.payee ?: ""
            EditingField.CATEGORY -> parsed.category ?: ""
            EditingField.DATE -> parsed.date?.toString() ?: ""
            EditingField.TYPE -> parsed.type.name.lowercase()
            EditingField.NONE -> ""
        }
        _uiState.value = _uiState.value.copy(
            editingField = field,
            editFieldValue = currentValue,
        )
    }

    /** Updates the in-progress quick-fix field value. */
    fun updateEditFieldValue(value: String) {
        _uiState.value = _uiState.value.copy(editFieldValue = value)
    }

    /** Applies the quick-fix correction to the parsed transaction. */
    fun confirmFieldEdit() {
        val parsed = _uiState.value.parsedTransaction ?: return
        val value = _uiState.value.editFieldValue.trim()
        val field = _uiState.value.editingField

        val updated = when (field) {
            EditingField.AMOUNT -> {
                val cents = value.toDoubleOrNull()?.let { Cents((it * 100).toLong()) }
                parsed.copy(
                    amount = cents ?: parsed.amount,
                    amountConfidence = if (cents != null) FieldConfidence.HIGH else parsed.amountConfidence,
                )
            }
            EditingField.PAYEE -> parsed.copy(
                payee = value.ifBlank { null },
                payeeConfidence = if (value.isNotBlank()) FieldConfidence.HIGH else FieldConfidence.NONE,
            )
            EditingField.CATEGORY -> parsed.copy(
                category = value.ifBlank { null },
                categoryConfidence = if (value.isNotBlank()) FieldConfidence.HIGH else FieldConfidence.NONE,
            )
            EditingField.DATE -> {
                val date = try { LocalDate.parse(value) } catch (_: Exception) { parsed.date }
                parsed.copy(
                    date = date,
                    dateConfidence = if (date != null) FieldConfidence.HIGH else parsed.dateConfidence,
                )
            }
            EditingField.TYPE -> {
                val type = when (value.lowercase()) {
                    "income" -> TransactionType.INCOME
                    "expense" -> TransactionType.EXPENSE
                    else -> parsed.type
                }
                parsed.copy(type = type, typeConfidence = FieldConfidence.HIGH)
            }
            EditingField.NONE -> parsed
        }

        _uiState.value = _uiState.value.copy(
            parsedTransaction = updated,
            editingField = EditingField.NONE,
            editFieldValue = "",
        )
    }

    /** Cancels the quick-fix edit without applying changes. */
    fun cancelFieldEdit() {
        _uiState.value = _uiState.value.copy(
            editingField = EditingField.NONE,
            editFieldValue = "",
        )
    }

    // ── Recent inputs history ───────────────────────────────────────────────

    /** Toggles visibility of the recent inputs panel. */
    fun toggleRecentInputs() {
        _uiState.value = _uiState.value.copy(
            showRecentInputs = !_uiState.value.showRecentInputs,
        )
    }

    /** Reuses a recent input by copying it into the input field. */
    fun reuseRecentInput(input: RecentNlpInput) {
        updateInput(input.rawInput)
        _uiState.value = _uiState.value.copy(showRecentInputs = false)
    }

    // ── Parsing logic (locale-aware) ────────────────────────────────────────

    private fun parseInput(text: String, locale: Locale): ParsedTransaction {
        val lower = text.lowercase(locale).trim()
        var overallConfidence = 0.0f

        // Parse amount with locale-aware number formats
        val amountResult = parseAmount(lower, locale)
        if (amountResult.value != null) overallConfidence += 0.4f

        // Parse type (spent, paid, earned, received — multi-language keywords)
        val typeResult = parseType(lower, locale)
        if (typeResult.confidence != FieldConfidence.NONE) overallConfidence += 0.1f

        // Parse payee (after "at" or "to" or "from")
        val payeeResult = parsePayee(lower)
        if (payeeResult.value != null) overallConfidence += 0.2f

        // Parse category (after "on" or "for")
        val categoryResult = parseCategory(lower)
        if (categoryResult.value != null) overallConfidence += 0.15f

        // Parse date with locale-aware patterns
        val dateResult = parseDate(lower, locale)
        if (dateResult.value != null) overallConfidence += 0.15f

        return ParsedTransaction(
            amount = amountResult.value,
            currency = Currency.USD,
            payee = payeeResult.value,
            category = categoryResult.value,
            date = dateResult.value,
            type = typeResult.value ?: TransactionType.EXPENSE,
            confidence = overallConfidence.coerceIn(0f, 1f),
            rawInput = text,
            amountConfidence = amountResult.confidence,
            payeeConfidence = payeeResult.confidence,
            categoryConfidence = categoryResult.confidence,
            dateConfidence = dateResult.confidence,
            typeConfidence = typeResult.confidence,
        )
    }

    /**
     * Parses an amount from the input, supporting locale-specific decimal
     * separators (e.g. "42,50" in European locales, "42.50" in US).
     */
    private fun parseAmount(text: String, locale: Locale): ParsedField<Cents> {
        // Try locale-specific currency symbols first
        val symbols = DecimalFormatSymbols.getInstance(locale)
        val decSep = symbols.decimalSeparator
        val grpSep = symbols.groupingSeparator

        // Match common patterns: $42.50, €42,50, 42.50, 1,200.50, 1.200,50
        val patterns = listOf(
            Regex("""[\$€£¥]?\s*(\d{1,3}(?:[${Regex.escape(grpSep.toString())}]\d{3})*(?:[${Regex.escape(decSep.toString())}]\d{1,2})?)"""),
            Regex("""\$?(\d+(?:\.\d{1,2})?)"""),
            Regex("""(\d+(?:,\d{1,2})?)"""),
        )

        for (pattern in patterns) {
            val match = pattern.find(text) ?: continue
            val raw = match.groupValues[1]
                .replace(grpSep.toString(), "")
                .replace(decSep, '.')
            val value = raw.toDoubleOrNull() ?: continue
            if (value > 0) {
                val cents = Cents((value * 100).toLong())
                val conf = if (text.contains("$") || text.contains("€") || text.contains("£"))
                    FieldConfidence.HIGH else FieldConfidence.MEDIUM
                return ParsedField(cents, conf, match.value)
            }
        }
        return ParsedField(null, FieldConfidence.NONE)
    }

    /** Parses the transaction type from keywords. */
    private fun parseType(text: String, locale: Locale): ParsedField<TransactionType> {
        // English keywords
        val incomeKeywords = listOf("earned", "received", "income", "got paid", "salary", "refund")
        val expenseKeywords = listOf("spent", "paid", "bought", "purchased", "cost")

        // Spanish keywords
        val incomeKeywordsEs = listOf("ganado", "recibido", "ingreso", "salario")
        val expenseKeywordsEs = listOf("gastado", "pagado", "comprado", "compré")

        // French keywords
        val incomeKeywordsFr = listOf("gagné", "reçu", "revenu", "salaire")
        val expenseKeywordsFr = listOf("dépensé", "payé", "acheté")

        val allIncome = incomeKeywords + incomeKeywordsEs + incomeKeywordsFr
        val allExpense = expenseKeywords + expenseKeywordsEs + expenseKeywordsFr

        return when {
            allIncome.any { text.contains(it) } ->
                ParsedField(TransactionType.INCOME, FieldConfidence.HIGH)
            allExpense.any { text.contains(it) } ->
                ParsedField(TransactionType.EXPENSE, FieldConfidence.HIGH)
            else -> ParsedField(TransactionType.EXPENSE, FieldConfidence.LOW)
        }
    }

    /** Parses payee from preposition patterns (at/to/from). */
    private fun parsePayee(text: String): ParsedField<String> {
        val payeeRegex = Regex("""(?:at|to|from|en|à|chez)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s']+?)(?:\s+(?:on|for|yesterday|today|para|pour|\d)|\s*$)""")
        val match = payeeRegex.find(text) ?: return ParsedField(null, FieldConfidence.NONE)
        val payee = match.groupValues[1].trim().split(' ')
            .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }

        // Check if payee matches a known merchant for higher confidence
        val isKnown = _uiState.value.recentPayees.any { it.equals(payee, ignoreCase = true) }
        val conf = if (isKnown) FieldConfidence.HIGH else FieldConfidence.MEDIUM
        return ParsedField(payee, conf, match.value)
    }

    /** Parses category from preposition patterns (on/for). */
    private fun parseCategory(text: String): ParsedField<String> {
        val catRegex = Regex("""(?:on|for|para|pour)\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+)?)""")
        val match = catRegex.find(text) ?: return ParsedField(null, FieldConfidence.NONE)
        val category = match.groupValues[1].trim().replaceFirstChar { it.uppercase() }

        // Check if category matches a known category
        val isKnown = _uiState.value.availableCategories.any { it.equals(category, ignoreCase = true) }
        val conf = if (isKnown) FieldConfidence.HIGH else FieldConfidence.LOW
        return ParsedField(category, conf, match.value)
    }

    /** Parses date from relative keywords and locale-aware date patterns. */
    private fun parseDate(text: String, locale: Locale): ParsedField<LocalDate> {
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date

        // Relative date keywords (English + Spanish + French)
        val dateKeywords = mapOf(
            "yesterday" to today.minus(1, DateTimeUnit.DAY),
            "today" to today,
            "last week" to today.minus(7, DateTimeUnit.DAY),
            "ayer" to today.minus(1, DateTimeUnit.DAY),
            "hoy" to today,
            "hier" to today.minus(1, DateTimeUnit.DAY),
            "aujourd'hui" to today,
        )

        for ((keyword, date) in dateKeywords) {
            if (text.contains(keyword)) {
                return ParsedField(date, FieldConfidence.HIGH, keyword)
            }
        }

        // Try explicit date patterns: MM/DD, DD/MM, YYYY-MM-DD
        val isoMatch = Regex("""\d{4}-\d{2}-\d{2}""").find(text)
        if (isoMatch != null) {
            val date = try { LocalDate.parse(isoMatch.value) } catch (_: Exception) { null }
            if (date != null) return ParsedField(date, FieldConfidence.HIGH, isoMatch.value)
        }

        val slashMatch = Regex("""(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?""").find(text)
        if (slashMatch != null) {
            val a = slashMatch.groupValues[1].toIntOrNull() ?: return ParsedField(null, FieldConfidence.NONE)
            val b = slashMatch.groupValues[2].toIntOrNull() ?: return ParsedField(null, FieldConfidence.NONE)
            val year = slashMatch.groupValues[3].toIntOrNull()?.let {
                if (it < 100) 2000 + it else it
            } ?: today.year

            // Locale-based: US = MM/DD, most others = DD/MM
            val (month, day) = if (locale.country == "US") a to b else b to a
            val date = try { LocalDate(year, month, day) } catch (_: Exception) { null }
            if (date != null) return ParsedField(date, FieldConfidence.MEDIUM, slashMatch.value)
        }

        return ParsedField(null, FieldConfidence.NONE)
    }

    private fun generateSuggestions(text: String): List<NlSuggestion> {
        val lastWord = text.split(" ").lastOrNull()?.lowercase() ?: return emptyList()
        if (lastWord.length < 2) return emptyList()

        val suggestions = mutableListOf<NlSuggestion>()

        // Payee suggestions — match prefix and also fuzzy contains
        _uiState.value.recentPayees
            .filter { it.lowercase().startsWith(lastWord) || it.lowercase().contains(lastWord) }
            .take(3)
            .forEach { suggestions.add(NlSuggestion(it, "payee")) }

        // Category suggestions
        _uiState.value.availableCategories
            .filter { it.lowercase().startsWith(lastWord) || it.lowercase().contains(lastWord) }
            .take(3)
            .forEach { suggestions.add(NlSuggestion(it, "category")) }

        return suggestions.take(5)
    }

    private fun formatCents(cents: Cents, currency: Currency): String {
        val dollars = cents.amount / 100.0
        return "$${String.format("%.2f", dollars)}"
    }
}
