// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

import com.finance.core.monitoring.MetricsCollector

/**
 * Privacy-safe instrumentation for voice transaction entry (#2383).
 *
 * Records *only* the outcome and shape of a voice entry session — never the
 * transcript, amounts, merchant, or any other transaction content. All events
 * are gated by the consent check inside [MetricsCollector]; with consent off
 * every call is a silent no-op.
 *
 * Tracked rates (derivable downstream from these counts):
 * - success rate — [recordEntryCompleted] vs [recordEntryCancelled]
 * - cancellation rate — [recordEntryCancelled]
 * - correction rate — [recordFieldCorrected] / [recordPromptShown]
 *
 * @param metrics The shared anonymous metrics collector.
 */
class VoiceTransactionInstrumentation(
    private val metrics: MetricsCollector,
) {

    /** A voice entry session was started (mic opened or Assistant handoff received). */
    fun recordEntryStarted(source: EntrySource) {
        metrics.recordFeatureUsage(
            FEATURE,
            mapOf("event" to "started", "source" to source.tag),
        )
    }

    /**
     * The parsed draft was confirmed and saved.
     *
     * @param fieldCount Number of populated fields (a count, not values).
     * @param correctionCount How many fields the user edited before saving.
     */
    fun recordEntryCompleted(fieldCount: Int, correctionCount: Int) {
        metrics.recordFeatureUsage(
            FEATURE,
            mapOf(
                "event" to "completed",
                "field_count" to fieldCount.coerceAtLeast(0).toString(),
                "correction_count" to correctionCount.coerceAtLeast(0).toString(),
            ),
        )
    }

    /** The user abandoned the session before saving. */
    fun recordEntryCancelled(stage: CancelStage) {
        metrics.recordFeatureUsage(
            FEATURE,
            mapOf("event" to "cancelled", "stage" to stage.tag),
        )
    }

    /** A native prompt was shown because a field was missing or ambiguous. */
    fun recordPromptShown(field: VoiceField) {
        metrics.recordFeatureUsage(
            FEATURE,
            mapOf("event" to "prompt_shown", "field" to field.name.lowercase()),
        )
    }

    /** The user changed a parsed field during review (a correction). */
    fun recordFieldCorrected(field: VoiceField) {
        metrics.recordFeatureUsage(
            FEATURE,
            mapOf("event" to "field_corrected", "field" to field.name.lowercase()),
        )
    }

    /** The draft was saved locally because the Assistant handoff could not complete. */
    fun recordOfflineDraftSaved() {
        metrics.recordFeatureUsage(
            FEATURE,
            mapOf("event" to "offline_draft_saved"),
        )
    }

    /** Where the session originated. */
    enum class EntrySource(val tag: String) {
        ASSISTANT("assistant"),
        IN_APP_MIC("in_app_mic"),
        OFFLINE_DRAFT("offline_draft"),
    }

    /** The stage at which a session was cancelled. */
    enum class CancelStage(val tag: String) {
        LISTENING("listening"),
        PROMPTING("prompting"),
        REVIEW("review"),
    }

    private companion object {
        const val FEATURE = "voice_transaction_entry"
    }
}
