// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

/**
 * Maps a spoken utterance to a reviewable transaction draft (#2383).
 *
 * Kept behind an interface so the deterministic [LocalUtteranceParser] used in
 * tests and offline drafting can be swapped for an ML-backed implementation
 * without changing the confirmation flow or instrumentation.
 */
fun interface UtteranceParser {
    /**
     * @param utterance Raw transcript from Assistant/SpeechRecognizer.
     *   Never logged — treat as financial content.
     * @return A [VoiceParseResult] with the draft plus any missing/ambiguous
     *   fields that require a native prompt before saving.
     */
    fun parse(utterance: String): VoiceParseResult
}

/**
 * Deterministic, fully-offline utterance parser (#2383).
 *
 * Resolves the candidate entities from a [VoiceEntityExtractor] into a single
 * [VoiceTransactionDraft]. The contract is intentionally conservative:
 *
 * - Required fields (amount + merchant) that are absent are reported in
 *   [VoiceParseResult.missingFields] — never silently defaulted.
 * - Fields with more than one plausible candidate are reported in
 *   [VoiceParseResult.ambiguities] and left `null` in the draft so the user
 *   disambiguates explicitly.
 * - Optional fields (category, account, note) are filled when unambiguous and
 *   omitted otherwise.
 *
 * Because both this parser and the default extractor run on-device with no I/O,
 * drafting works even when the Assistant handoff cannot complete (offline).
 *
 * ## Security
 * Never logs the transcript or any extracted value.
 *
 * @param extractor Entity-extraction strategy; defaults to the rule-based one.
 */
class LocalUtteranceParser(
    private val extractor: VoiceEntityExtractor = RuleBasedVoiceEntityExtractor(),
) : UtteranceParser {

    override fun parse(utterance: String): VoiceParseResult {
        val raw = utterance.trim()
        if (raw.isBlank()) {
            return VoiceParseResult(
                draft = VoiceTransactionDraft(),
                missingFields = REQUIRED_FIELDS,
                rawUtterance = raw,
            )
        }

        val entities = extractor.extract(raw)
        val missing = mutableListOf<VoiceField>()
        val ambiguities = mutableListOf<FieldAmbiguity>()

        val amount = resolveSingle(
            field = VoiceField.AMOUNT,
            candidates = entities.amountsMinor.map { it.toString() },
            missing = missing,
            ambiguities = ambiguities,
            required = true,
        )?.toLongOrNull()

        val merchant = resolveSingle(
            field = VoiceField.MERCHANT,
            candidates = entities.merchantCandidates,
            missing = missing,
            ambiguities = ambiguities,
            required = true,
        )

        // Optional fields: fill when unambiguous, otherwise surface ambiguity
        // but do not block (they are not in REQUIRED_FIELDS).
        val category = resolveOptional(VoiceField.CATEGORY, entities.categoryHints, ambiguities)
        val account = resolveOptional(VoiceField.ACCOUNT, entities.accountCandidates, ambiguities)

        val draft = VoiceTransactionDraft(
            amountMinor = amount,
            currencyCode = entities.currencyCode,
            merchant = merchant,
            category = category,
            account = account,
            note = entities.note,
            direction = if (entities.isIncome) VoiceDirection.INCOME else VoiceDirection.EXPENSE,
        )

        return VoiceParseResult(
            draft = draft,
            missingFields = missing.distinct(),
            ambiguities = ambiguities,
            overallConfidence = confidenceOf(draft, ambiguities),
            rawUtterance = raw,
        )
    }

    /**
     * Resolves a field expected to have exactly one value.
     *
     * - 0 candidates and [required] → adds to [missing].
     * - 1 candidate → returns it.
     * - >1 distinct candidates → adds to [ambiguities] and returns null.
     */
    private fun resolveSingle(
        field: VoiceField,
        candidates: List<String>,
        missing: MutableList<VoiceField>,
        ambiguities: MutableList<FieldAmbiguity>,
        required: Boolean,
    ): String? {
        val distinct = candidates.filter { it.isNotBlank() }.distinct()
        return when {
            distinct.isEmpty() -> {
                if (required) missing.add(field)
                null
            }

            distinct.size == 1 -> distinct.first()
            else -> {
                ambiguities.add(FieldAmbiguity(field, distinct))
                null
            }
        }
    }

    private fun resolveOptional(
        field: VoiceField,
        candidates: List<String>,
        ambiguities: MutableList<FieldAmbiguity>,
    ): String? {
        val distinct = candidates.filter { it.isNotBlank() }.distinct()
        return when {
            distinct.isEmpty() -> null
            distinct.size == 1 -> distinct.first()
            else -> {
                ambiguities.add(FieldAmbiguity(field, distinct))
                null
            }
        }
    }

    private fun confidenceOf(
        draft: VoiceTransactionDraft,
        ambiguities: List<FieldAmbiguity>,
    ): Float {
        val factors = listOfNotNull(
            if (draft.amountMinor != null) 0.45f else null,
            if (!draft.merchant.isNullOrBlank()) 0.30f else null,
            if (!draft.category.isNullOrBlank()) 0.10f else null,
            if (!draft.account.isNullOrBlank()) 0.10f else null,
            if (!draft.note.isNullOrBlank()) 0.05f else null,
        )
        val penalty = ambiguities.size * 0.15f
        return (factors.sum() - penalty).coerceIn(0f, 1f)
    }

    private companion object {
        val REQUIRED_FIELDS = listOf(VoiceField.AMOUNT, VoiceField.MERCHANT)
    }
}
