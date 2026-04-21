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

// ─────────────────────────────────────────────────────────────────────────────
// Natural Language Input ViewModel — Sprint 21 (#237)
// ─────────────────────────────────────────────────────────────────────────────

/** Parsed result from a natural language input string. */
data class ParsedTransaction(
    val amount: Cents?,
    val currency: Currency,
    val payee: String?,
    val category: String?,
    val date: LocalDate?,
    val type: TransactionType,
    val confidence: Float,
    val rawInput: String,
)

/** Autocomplete suggestion for the NL input field. */
data class NlSuggestion(
    val text: String,
    val type: String, // "payee", "category", "amount"
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
)

/**
 * ViewModel for the Natural Language Transaction Input feature.
 *
 * Parses free-text input like "Spent $42.50 at Whole Foods on groceries yesterday"
 * into structured transaction data. Provides autocomplete suggestions based on
 * known payees and categories. Transaction creation delegates to [TransactionRepository].
 */
class NaturalLanguageViewModel(
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(NaturalLanguageUiState())
    val uiState: StateFlow<NaturalLanguageUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

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

        // Parse the input
        val parsed = parseInput(text)
        _uiState.value = _uiState.value.copy(parsedTransaction = parsed)
    }

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

    fun dismissSuggestions() {
        _uiState.value = _uiState.value.copy(showSuggestions = false)
    }

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
                accountId = SyncId("a1"), // Default account
                amount = parsed.amount,
                currency = parsed.currency,
                type = parsed.type,
                date = parsed.date ?: Clock.System.now()
                    .toLocalDateTime(TimeZone.currentSystemDefault()).date,
                payee = parsed.payee,
                categoryId = null, // Would map from category name
                notes = "Created via natural language: ${parsed.rawInput}",
                createdAt = now,
                updatedAt = now,
            )

            transactionRepository.insert(txn)

            _uiState.value = _uiState.value.copy(
                isProcessing = false,
                inputText = "",
                parsedTransaction = null,
                successMessage = "Transaction created: ${parsed.payee ?: "Unknown"} for ${formatCents(parsed.amount, parsed.currency)}",
            )

            // Clear success after delay
            kotlinx.coroutines.delay(3000)
            _uiState.value = _uiState.value.copy(successMessage = null)
        }
    }

    fun clearInput() {
        _uiState.value = _uiState.value.copy(
            inputText = "",
            parsedTransaction = null,
            suggestions = emptyList(),
            showSuggestions = false,
            errorMessage = null,
            successMessage = null,
        )
    }

    // ── Parsing logic ────────────────────────────────────────────────────────

    private fun parseInput(text: String): ParsedTransaction {
        val lower = text.lowercase().trim()
        var confidence = 0.0f

        // Parse amount (e.g. $42.50, 42.50, $42)
        val amountRegex = Regex("""\$?(\d+(?:\.\d{1,2})?)""")
        val amountMatch = amountRegex.find(lower)
        val amount = amountMatch?.groupValues?.get(1)?.let {
            val cents = (it.toDouble() * 100).toLong()
            confidence += 0.4f
            Cents(cents)
        }

        // Parse type (spent, paid, earned, received)
        val isIncome = lower.contains("earned") || lower.contains("received") ||
            lower.contains("income") || lower.contains("got paid")
        val type = if (isIncome) TransactionType.INCOME else TransactionType.EXPENSE
        if (lower.contains("spent") || lower.contains("paid") || isIncome) {
            confidence += 0.1f
        }

        // Parse payee (after "at" or "to" or "from")
        val payeeRegex = Regex("""(?:at|to|from)\s+([A-Za-z][A-Za-z\s']+?)(?:\s+(?:on|for|yesterday|today|\d)|\s*$)""")
        val payeeMatch = payeeRegex.find(lower)
        val payee = payeeMatch?.groupValues?.get(1)?.trim()?.split(' ')
            ?.joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
        if (payee != null) confidence += 0.2f

        // Parse category (after "on" or "for")
        val catRegex = Regex("""(?:on|for)\s+([a-z]+(?:\s+[a-z]+)?)""")
        val catMatch = catRegex.find(lower)
        val category = catMatch?.groupValues?.get(1)?.trim()?.replaceFirstChar { it.uppercase() }
        if (category != null) confidence += 0.15f

        // Parse date
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        val date = when {
            lower.contains("yesterday") -> {
                confidence += 0.15f
                today.minus(1, DateTimeUnit.DAY)
            }
            lower.contains("today") -> {
                confidence += 0.15f
                today
            }
            lower.contains("last week") -> {
                confidence += 0.1f
                today.minus(7, DateTimeUnit.DAY)
            }
            else -> null
        }

        return ParsedTransaction(
            amount = amount,
            currency = Currency.USD,
            payee = payee,
            category = category,
            date = date,
            type = type,
            confidence = confidence.coerceIn(0f, 1f),
            rawInput = text,
        )
    }

    private fun generateSuggestions(text: String): List<NlSuggestion> {
        val lastWord = text.split(" ").lastOrNull()?.lowercase() ?: return emptyList()
        if (lastWord.length < 2) return emptyList()

        val suggestions = mutableListOf<NlSuggestion>()

        // Payee suggestions
        _uiState.value.recentPayees
            .filter { it.lowercase().startsWith(lastWord) }
            .take(3)
            .forEach { suggestions.add(NlSuggestion(it, "payee")) }

        // Category suggestions
        _uiState.value.availableCategories
            .filter { it.lowercase().startsWith(lastWord) }
            .take(3)
            .forEach { suggestions.add(NlSuggestion(it, "category")) }

        return suggestions.take(5)
    }

    private fun formatCents(cents: Cents, currency: Currency): String {
        val dollars = cents.amount / 100.0
        return "$${String.format("%.2f", dollars)}"
    }
}
