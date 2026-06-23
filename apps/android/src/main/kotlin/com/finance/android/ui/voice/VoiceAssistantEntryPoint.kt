// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

/**
 * Device-only seam between the Google Assistant / `SpeechRecognizer` and the
 * on-device voice transaction flow (#2383).
 *
 * The deterministic parsing, prompting, review, and instrumentation are all
 * unit-tested on the JVM. The pieces that genuinely require a physical device,
 * Android Studio, and Play Console review are marked `// TODO(human)` below.
 *
 * ## Needs Human Action
 *
 * 1. App Actions / Assistant wiring — register a custom intent in
 *    `res/xml/shortcuts.xml`, declare the capability in the manifest, and route
 *    the transcript into [VoiceTransactionViewModel.onUtteranceReceived].
 * 2. In-app microphone capture — wire a `SpeechRecognizer` (preferring an
 *    on-device recognizer) and request `RECORD_AUDIO` at point of use.
 *
 * These cannot be validated headlessly in CI, so they are intentionally left as
 * documented stubs rather than half-wired code.
 */
object VoiceAssistantEntryPoint {

    /**
     * Entry hook the App Action / mic capture should call once it has a
     * transcript. Kept pure (no Android imports) so it stays testable.
     *
     * @param transcript Recognised speech. Never logged.
     * @param viewModel The active [VoiceTransactionViewModel].
     * @param online Whether the Assistant handoff completed successfully.
     */
    fun handleTranscript(
        transcript: String,
        viewModel: VoiceTransactionViewModel,
        online: Boolean,
    ) {
        if (online) {
            viewModel.onUtteranceReceived(
                transcript,
                VoiceTransactionInstrumentation.EntrySource.ASSISTANT,
            )
        } else {
            viewModel.onAssistantHandoffUnavailable(transcript)
        }
    }

    // TODO(human): Register the Assistant App Action capability.
    //   - Add res/xml/shortcuts.xml with a custom intent (e.g. ADD_EXPENSE).
    //   - Declare <capability> + <meta-data android:name="android.app.shortcuts">.
    //   - In the receiving Activity, read the spoken transcript extra and call
    //     [handleTranscript]. Requires an Assistant test device.

    // TODO(human): Wire in-app SpeechRecognizer capture.
    //   - Request RECORD_AUDIO at point of use.
    //   - Prefer an on-device recognizer; fall back to system Assistant.
    //   - Forward the final transcript to [handleTranscript].
}
