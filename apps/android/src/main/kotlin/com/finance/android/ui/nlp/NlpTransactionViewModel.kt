// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.nlp

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/**
 * UI state for the natural language transaction input (#237).
 *
 * @property inputText The raw text the user is typing.
 * @property parsedTransaction The live-parsed result, or null before input.
 * @property isConfirmed Whether the user has confirmed the parsed data.
 * @property showSuggestions Whether to show auto-complete suggestions.
 */
data class NlpInputUiState(
    val inputText: String = "",
    val parsedTransaction: ParsedTransaction? = null,
    val isConfirmed: Boolean = false,
    val showSuggestions: Boolean = false,
)

/**
 * ViewModel for natural language transaction input (#237).
 *
 * Provides real-time parsing of free-form text into structured transaction
 * data using [TransactionNlpParser]. The parsed result updates on every
 * keystroke for instant feedback.
 */
class NlpTransactionViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(NlpInputUiState())
    val uiState: StateFlow<NlpInputUiState> = _uiState.asStateFlow()

    /** Example phrases shown as placeholder suggestions. */
    val examplePhrases = listOf(
        "Coffee at Starbucks $4.50",
        "Lunch at Chipotle $12",
        "Uber ride $15.00 yesterday",
        "Groceries at Walmart $85.50",
        "Received salary $3,500",
        "Netflix subscription $15.99",
        "Gas station $45 last Friday",
    )

    /**
     * Updates the input text and triggers real-time parsing.
     */
    fun onInputChanged(text: String) {
        val parsed = if (text.isNotBlank()) {
            TransactionNlpParser.parse(text)
        } else {
            null
        }

        _uiState.update {
            it.copy(
                inputText = text,
                parsedTransaction = parsed,
                isConfirmed = false,
                showSuggestions = text.isEmpty(),
            )
        }
    }

    /**
     * Applies a suggestion phrase to the input.
     */
    fun applySuggestion(phrase: String) {
        onInputChanged(phrase)
    }

    /**
     * Confirms the parsed transaction data for form pre-population.
     */
    fun confirmParsed() {
        val parsed = _uiState.value.parsedTransaction ?: return
        _uiState.update { it.copy(isConfirmed = true) }
        Timber.d("NLP transaction confirmed: type=%s, confidence=%.2f", parsed.type, parsed.confidence)
    }

    /**
     * Resets the input state.
     */
    fun reset() {
        _uiState.update { NlpInputUiState(showSuggestions = true) }
    }
}
