// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

/**
 * Offline-safe storage for voice transaction drafts (#2383).
 *
 * When the Google Assistant handoff cannot complete (no connectivity, app not
 * foregrounded, etc.) a parsed draft is stashed here so the user can review and
 * save it later — drafting never depends on network or the Assistant service.
 *
 * The default [InMemoryVoiceDraftStore] is process-local. A durable,
 * SQLCipher-backed implementation is wired separately.
 */
interface VoiceDraftStore {
    /** Persist a pending draft for later review. */
    fun saveDraft(draft: VoiceTransactionDraft)

    /** All drafts awaiting review, oldest first. */
    fun pendingDrafts(): List<VoiceTransactionDraft>

    /** Remove a draft once it has been reviewed (saved or discarded). */
    fun remove(draft: VoiceTransactionDraft)

    /** Drop all pending drafts. */
    fun clear()
}

/**
 * Process-local [VoiceDraftStore] used for offline drafting and tests (#2383).
 *
 * NEVER logs draft contents.
 *
 * TODO(human): Back this with an encrypted (SQLCipher) store so offline drafts
 * survive process death. See "## Needs Human Action" in the PR description.
 */
class InMemoryVoiceDraftStore : VoiceDraftStore {
    private val drafts = mutableListOf<VoiceTransactionDraft>()

    override fun saveDraft(draft: VoiceTransactionDraft) {
        drafts.add(draft)
    }

    override fun pendingDrafts(): List<VoiceTransactionDraft> = drafts.toList()

    override fun remove(draft: VoiceTransactionDraft) {
        drafts.remove(draft)
    }

    override fun clear() {
        drafts.clear()
    }
}
