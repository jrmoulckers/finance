// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/** Why a field needs a native prompt before the transaction can be saved. */
enum class PromptReason {
    /** The utterance did not provide a required field. */
    MISSING,

    /** The utterance provided more than one plausible value. */
    AMBIGUOUS,
}

/**
 * A native prompt the user must resolve before saving (#2383).
 *
 * @property field The field being clarified.
 * @property candidates Disambiguation options; empty for free entry (missing).
 * @property reason Whether the field was missing or ambiguous.
 */
data class FieldPrompt(
    val field: VoiceField,
    val candidates: List<String>,
    val reason: PromptReason,
)

/** Stages of a single voice transaction entry session. */
enum class VoiceEntryStage {
    IDLE,
    PROMPTING,
    REVIEW,
    SAVED,
}

/**
 * UI state for the voice transaction review flow (#2383).
 *
 * @property stage Current stage of the session.
 * @property draft The working draft assembled so far.
 * @property pendingPrompts Outstanding prompts for missing/ambiguous fields.
 * @property overallConfidence Heuristic parse confidence in [0.0, 1.0].
 * @property isOfflineDraft True when this came from a failed Assistant handoff.
 * @property correctionCount Fields the user edited during review (for metrics).
 */
data class VoiceEntryUiState(
    val stage: VoiceEntryStage = VoiceEntryStage.IDLE,
    val draft: VoiceTransactionDraft = VoiceTransactionDraft(),
    val pendingPrompts: List<FieldPrompt> = emptyList(),
    val overallConfidence: Float = 0f,
    val isOfflineDraft: Boolean = false,
    val correctionCount: Int = 0,
) {
    /** The prompt currently being shown, or null when none remain. */
    val currentPrompt: FieldPrompt?
        get() = pendingPrompts.firstOrNull()

    /** True when the draft can be saved (required fields present, no prompts). */
    val canSave: Boolean
        get() = pendingPrompts.isEmpty() && draft.isComplete
}

/**
 * Drives the confirmation/review flow for spoken transactions (#2383).
 *
 * Responsibilities:
 * - Parse an utterance into a [VoiceTransactionDraft] via [UtteranceParser].
 * - Surface native prompts for every missing or ambiguous field — there are
 *   no silent defaults.
 * - Require explicit user confirmation before any spoken transaction is saved.
 * - Support offline-safe drafting when the Assistant handoff cannot complete.
 * - Emit privacy-safe instrumentation (no transaction content).
 *
 * ## Security
 * Logs only field *names* and stage transitions — never amounts, merchant
 * names, the transcript, or any other transaction content.
 *
 * @param parser Deterministic, offline-capable utterance parser.
 * @param instrumentation Privacy-safe outcome metrics.
 * @param draftStore Offline-safe draft persistence.
 */
class VoiceTransactionViewModel(
    private val parser: UtteranceParser,
    private val instrumentation: VoiceTransactionInstrumentation,
    private val draftStore: VoiceDraftStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VoiceEntryUiState())
    val uiState: StateFlow<VoiceEntryUiState> = _uiState.asStateFlow()

    /**
     * Begins a session from a transcript received in-app or via Assistant.
     *
     * @param utterance Raw transcript. Never logged.
     * @param source Where the transcript came from (for metrics only).
     */
    fun onUtteranceReceived(
        utterance: String,
        source: VoiceTransactionInstrumentation.EntrySource =
            VoiceTransactionInstrumentation.EntrySource.IN_APP_MIC,
    ) {
        instrumentation.recordEntryStarted(source)
        val result = parser.parse(utterance)
        applyParseResult(result, isOffline = false)
    }

    /**
     * Handles a transcript when the Assistant handoff could not complete.
     *
     * The draft is parsed locally and stashed in [draftStore] so the user can
     * finish it later — drafting works fully offline.
     *
     * @param utterance Raw transcript captured before the handoff failed.
     */
    fun onAssistantHandoffUnavailable(utterance: String) {
        instrumentation.recordEntryStarted(
            VoiceTransactionInstrumentation.EntrySource.OFFLINE_DRAFT,
        )
        val result = parser.parse(utterance)
        draftStore.saveDraft(result.draft)
        instrumentation.recordOfflineDraftSaved()
        Timber.i("Voice handoff unavailable — draft stashed for later review")
        applyParseResult(result, isOffline = true)
    }

    /**
     * Resolves the current prompt with a user-supplied value.
     *
     * @param value The value chosen (candidate) or typed (missing field).
     */
    fun onPromptResolved(value: String) {
        val state = _uiState.value
        val prompt = state.currentPrompt ?: return
        val updatedDraft = state.draft.withField(prompt.field, value)
        val remaining = state.pendingPrompts.drop(1)

        _uiState.update {
            it.copy(
                draft = updatedDraft,
                pendingPrompts = remaining,
                stage = if (remaining.isEmpty()) VoiceEntryStage.REVIEW else VoiceEntryStage.PROMPTING,
            )
        }
        if (remaining.isNotEmpty()) {
            instrumentation.recordPromptShown(remaining.first().field)
        }
        Timber.d("Prompt resolved for field=%s; remaining=%d", prompt.field.name, remaining.size)
    }

    /**
     * Edits an already-parsed field during review (counts as a correction).
     */
    fun onFieldCorrected(field: VoiceField, value: String) {
        instrumentation.recordFieldCorrected(field)
        _uiState.update {
            it.copy(
                draft = it.draft.withField(field, value),
                correctionCount = it.correctionCount + 1,
            )
        }
        Timber.d("Field corrected: %s", field.name)
    }

    /**
     * Confirms and saves the reviewed draft.
     *
     * Saving is blocked unless [VoiceEntryUiState.canSave] is true, guaranteeing
     * the user reviewed every prompted field first.
     *
     * @param onSave Sink for the confirmed draft (e.g. transaction repository).
     * @return true if the draft was saved, false if it was not yet complete.
     */
    fun onConfirmSave(onSave: (VoiceTransactionDraft) -> Unit): Boolean {
        val state = _uiState.value
        if (!state.canSave) return false

        onSave(state.draft)
        draftStore.remove(state.draft)
        instrumentation.recordEntryCompleted(
            fieldCount = state.draft.populatedFieldCount(),
            correctionCount = state.correctionCount,
        )
        _uiState.update { it.copy(stage = VoiceEntryStage.SAVED) }
        Timber.i("Voice transaction confirmed and saved")
        return true
    }

    /** Abandons the session and records a cancellation for the given stage. */
    fun onCancel() {
        val stage = when (_uiState.value.stage) {
            VoiceEntryStage.PROMPTING ->
                VoiceTransactionInstrumentation.CancelStage.PROMPTING

            else -> VoiceTransactionInstrumentation.CancelStage.REVIEW
        }
        instrumentation.recordEntryCancelled(stage)
        reset()
    }

    /** Resets to the idle state. */
    fun reset() {
        _uiState.value = VoiceEntryUiState()
    }

    private fun applyParseResult(result: VoiceParseResult, isOffline: Boolean) {
        val prompts = buildPrompts(result)
        prompts.firstOrNull()?.let { instrumentation.recordPromptShown(it.field) }

        _uiState.value = VoiceEntryUiState(
            stage = if (prompts.isEmpty()) VoiceEntryStage.REVIEW else VoiceEntryStage.PROMPTING,
            draft = result.draft,
            pendingPrompts = prompts,
            overallConfidence = result.overallConfidence,
            isOfflineDraft = isOffline,
        )
        Timber.d(
            "Parsed utterance: prompts=%d, confidence=%.2f, offline=%b",
            prompts.size,
            result.overallConfidence,
            isOffline,
        )
    }

    private fun buildPrompts(result: VoiceParseResult): List<FieldPrompt> {
        val missingPrompts = result.missingFields.map {
            FieldPrompt(field = it, candidates = emptyList(), reason = PromptReason.MISSING)
        }
        val ambiguousPrompts = result.ambiguities.map {
            FieldPrompt(field = it.field, candidates = it.candidates, reason = PromptReason.AMBIGUOUS)
        }
        // Resolve required-missing fields first, then ambiguities.
        return missingPrompts + ambiguousPrompts
    }
}

/** Returns a copy with [field] set to [value], parsing amounts to minor units. */
internal fun VoiceTransactionDraft.withField(field: VoiceField, value: String): VoiceTransactionDraft =
    when (field) {
        VoiceField.AMOUNT -> copy(amountMinor = value.toLongOrNull() ?: amountMinor)
        VoiceField.MERCHANT -> copy(merchant = value)
        VoiceField.CATEGORY -> copy(category = value)
        VoiceField.ACCOUNT -> copy(account = value)
        VoiceField.NOTE -> copy(note = value)
    }

/** Number of non-null/non-blank fields, used for anonymous metrics only. */
internal fun VoiceTransactionDraft.populatedFieldCount(): Int = listOf(
    amountMinor != null,
    !merchant.isNullOrBlank(),
    !category.isNullOrBlank(),
    !account.isNullOrBlank(),
    !note.isNullOrBlank(),
).count { it }
