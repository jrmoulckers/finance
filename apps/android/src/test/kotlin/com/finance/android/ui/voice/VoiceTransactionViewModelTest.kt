// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

import com.finance.core.monitoring.MetricsCollector
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [VoiceTransactionViewModel] (#2383).
 *
 * Covers the confirmation/review flow, native prompting for missing and
 * ambiguous fields (no silent defaults), correction tracking, and offline-safe
 * drafting when the Assistant handoff cannot complete.
 */
class VoiceTransactionViewModelTest {

    private fun newViewModel(
        draftStore: VoiceDraftStore = InMemoryVoiceDraftStore(),
    ): VoiceTransactionViewModel {
        val metrics = MetricsCollector(consentProvider = { true })
        return VoiceTransactionViewModel(
            parser = LocalUtteranceParser(),
            instrumentation = VoiceTransactionInstrumentation(metrics),
            draftStore = draftStore,
        )
    }

    @Test
    fun `complete utterance goes straight to review and can save`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Coffee at Starbucks \$4.50")

        val state = vm.uiState.value
        assertEquals(VoiceEntryStage.REVIEW, state.stage)
        assertTrue(state.canSave)
        assertEquals(450L, state.draft.amountMinor)
        assertEquals("Starbucks", state.draft.merchant)
    }

    @Test
    fun `missing merchant produces a prompt that blocks saving`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Spent 20 dollars")

        val state = vm.uiState.value
        assertEquals(VoiceEntryStage.PROMPTING, state.stage)
        assertEquals(VoiceField.MERCHANT, state.currentPrompt?.field)
        assertEquals(PromptReason.MISSING, state.currentPrompt?.reason)
        assertFalse(state.canSave)
    }

    @Test
    fun `resolving the prompt advances to review`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Spent 20 dollars")
        vm.onPromptResolved("Cafe")

        val state = vm.uiState.value
        assertEquals(VoiceEntryStage.REVIEW, state.stage)
        assertEquals("Cafe", state.draft.merchant)
        assertTrue(state.canSave)
    }

    @Test
    fun `ambiguous amount prompts with candidates and never auto-picks`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Lunch at Cafe 20 dollars or 30 dollars")

        val prompt = vm.uiState.value.currentPrompt
        assertEquals(VoiceField.AMOUNT, prompt?.field)
        assertEquals(PromptReason.AMBIGUOUS, prompt?.reason)
        assertEquals(listOf("2000", "3000"), prompt?.candidates)
        assertNull(vm.uiState.value.draft.amountMinor)

        vm.onPromptResolved("3000")
        assertEquals(3000L, vm.uiState.value.draft.amountMinor)
    }

    @Test
    fun `confirm save emits draft and marks saved`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Coffee at Starbucks \$4.50")

        var saved: VoiceTransactionDraft? = null
        val result = vm.onConfirmSave { saved = it }

        assertTrue(result)
        assertEquals("Starbucks", saved?.merchant)
        assertEquals(VoiceEntryStage.SAVED, vm.uiState.value.stage)
    }

    @Test
    fun `confirm save is blocked while a prompt is pending`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Spent 20 dollars")

        var saved = false
        val result = vm.onConfirmSave { saved = true }

        assertFalse(result)
        assertFalse(saved)
    }

    @Test
    fun `field correction updates draft and counts the correction`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Coffee at Starbucks \$4.50")
        vm.onFieldCorrected(VoiceField.MERCHANT, "Blue Bottle")

        assertEquals("Blue Bottle", vm.uiState.value.draft.merchant)
        assertEquals(1, vm.uiState.value.correctionCount)
    }

    @Test
    fun `offline handoff stashes a draft and flags offline`() {
        val store = InMemoryVoiceDraftStore()
        val vm = newViewModel(store)
        vm.onAssistantHandoffUnavailable("Coffee at Starbucks \$4.50")

        assertTrue(vm.uiState.value.isOfflineDraft)
        assertEquals(1, store.pendingDrafts().size)
        assertEquals("Starbucks", store.pendingDrafts().first().merchant)
    }

    @Test
    fun `cancel resets to idle`() {
        val vm = newViewModel()
        vm.onUtteranceReceived("Coffee at Starbucks \$4.50")
        vm.onCancel()

        assertEquals(VoiceEntryStage.IDLE, vm.uiState.value.stage)
    }
}
