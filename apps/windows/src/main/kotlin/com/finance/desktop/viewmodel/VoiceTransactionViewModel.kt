// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.TransactionRepository
import com.finance.desktop.voice.ParsedTransaction
import com.finance.desktop.voice.VoiceCommandManager
import com.finance.desktop.voice.VoiceCommandParser
import com.finance.desktop.voice.VoiceRecognitionState
import com.finance.models.Transaction
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.datetime.Clock
import kotlinx.datetime.toLocalDateTime
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Voice transaction entry state.
 */
enum class VoiceEntryPhase {
    /** Ready to start voice input. */
    IDLE,

    /** Listening for voice input. */
    LISTENING,

    /** Processing speech-to-text. */
    PROCESSING,

    /** Showing parsed transaction for confirmation. */
    CONFIRMING,

    /** Transaction successfully saved. */
    SUCCESS,

    /** An error occurred. */
    ERROR,
}

/**
 * UI state for the voice transaction entry overlay.
 */
data class VoiceTransactionUiState(
    val phase: VoiceEntryPhase = VoiceEntryPhase.IDLE,
    val isVoiceAvailable: Boolean = false,
    val transcribedText: String = "",
    val parsedTransaction: ParsedTransaction? = null,
    val errorMessage: String? = null,
    val isOverlayVisible: Boolean = false,
)

/**
 * ViewModel for voice-driven quick transaction entry.
 *
 * Coordinates the full voice transaction lifecycle:
 * 1. **Listen** — activates microphone, captures speech
 * 2. **Parse** — converts speech text to structured [ParsedTransaction]
 * 3. **Confirm** — displays parsed data for user confirmation
 * 4. **Save** — commits transaction to the repository
 *
 * The overlay is activated via Ctrl+Shift+V keyboard shortcut (registered
 * in the shortcut handler) or through the UI.
 *
 * ## State Management
 *
 * Exposes a single [StateFlow<VoiceTransactionUiState>] that drives the
 * overlay composable. The state machine transitions through [VoiceEntryPhase]
 * values in a linear flow with error branches.
 */
class VoiceTransactionViewModel(
    private val voiceManager: VoiceCommandManager,
    private val parser: VoiceCommandParser,
    private val transactionRepository: TransactionRepository,
) : DesktopViewModel() {

    companion object {
        private val logger: Logger = Logger.getLogger(VoiceTransactionViewModel::class.java.name)
    }

    private val _uiState = MutableStateFlow(VoiceTransactionUiState())
    val uiState: StateFlow<VoiceTransactionUiState> = _uiState.asStateFlow()

    init {
        checkAvailability()
    }

    // ── Public actions ──────────────────────────────────────────────────────

    /**
     * Shows the voice transaction overlay and starts listening.
     */
    fun activate() {
        _uiState.value = VoiceTransactionUiState(
            phase = VoiceEntryPhase.IDLE,
            isVoiceAvailable = voiceManager.isAvailable(),
            isOverlayVisible = true,
        )
        startListening()
    }

    /**
     * Starts (or restarts) voice listening.
     */
    fun startListening() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                phase = VoiceEntryPhase.LISTENING,
                errorMessage = null,
                transcribedText = "",
                parsedTransaction = null,
            )

            val result = withContext(Dispatchers.IO) {
                voiceManager.listen(timeoutSeconds = 10)
            }

            if (result.isSuccess && result.text.isNotBlank()) {
                _uiState.value = _uiState.value.copy(
                    phase = VoiceEntryPhase.PROCESSING,
                    transcribedText = result.text,
                )

                // Parse the transcribed text
                val parsed = parser.parse(result.text)
                _uiState.value = _uiState.value.copy(
                    phase = VoiceEntryPhase.CONFIRMING,
                    parsedTransaction = parsed,
                )
            } else {
                _uiState.value = _uiState.value.copy(
                    phase = VoiceEntryPhase.ERROR,
                    errorMessage = result.errorMessage ?: "No speech detected. Try again.",
                )
            }
        }
    }

    /**
     * Confirms the parsed transaction and saves it to the repository.
     */
    fun confirmTransaction() {
        val parsed = _uiState.value.parsedTransaction ?: return

        viewModelScope.launch {
            @Suppress("TooGenericExceptionCaught") // Voice transaction error boundary
            try {
                _uiState.value = _uiState.value.copy(phase = VoiceEntryPhase.PROCESSING)

                val amount = parsed.amount ?: Cents.ZERO
                val signedAmount = if (parsed.isExpense) {
                    if (amount.isPositive()) -amount else amount
                } else {
                    amount.abs()
                }

                val transaction = Transaction(
                    id = SyncId(java.util.UUID.randomUUID().toString()),
                    householdId = SyncId("d1"),
                    ownerId = SyncId("local-user"),
                    accountId = SyncId("default"),
                    categoryId = SyncId(parsed.category?.lowercase()?.replace(" ", "-") ?: "uncategorized"),
                    type = if (parsed.isExpense) com.finance.models.TransactionType.EXPENSE else com.finance.models.TransactionType.INCOME,
                    amount = signedAmount,
                    currency = com.finance.models.types.Currency("USD"),
                    note = parsed.description ?: "Voice transaction",
                    date = parsed.date ?: kotlinx.datetime.Clock.System.now()
                        .toLocalDateTime(kotlinx.datetime.TimeZone.currentSystemDefault()).date,
                    createdAt = Clock.System.now(),
                    updatedAt = Clock.System.now(),
                )

                transactionRepository.insert(transaction)

                _uiState.value = _uiState.value.copy(
                    phase = VoiceEntryPhase.SUCCESS,
                )

                logger.info("Voice transaction saved: ${parsed.description} (${parsed.amount})")
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Failed to save voice transaction", e)
                _uiState.value = _uiState.value.copy(
                    phase = VoiceEntryPhase.ERROR,
                    errorMessage = "Failed to save transaction: ${e.message}",
                )
            }
        }
    }

    /**
     * Cancels the current voice session and hides the overlay.
     */
    fun cancel() {
        voiceManager.cancel()
        _uiState.value = VoiceTransactionUiState(
            isVoiceAvailable = voiceManager.isAvailable(),
        )
    }

    /**
     * Dismisses the overlay after a successful save.
     */
    fun dismiss() {
        _uiState.value = VoiceTransactionUiState(
            isVoiceAvailable = voiceManager.isAvailable(),
        )
    }

    // ── Internal ────────────────────────────────────────────────────────────

    private fun checkAvailability() {
        _uiState.value = _uiState.value.copy(
            isVoiceAvailable = voiceManager.isAvailable(),
        )
    }
}
