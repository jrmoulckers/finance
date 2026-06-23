// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

/**
 * Transaction fields that a spoken utterance can populate (#2383).
 *
 * Used to drive native prompts when a field is missing or ambiguous so
 * the user is always asked rather than silently defaulted.
 */
enum class VoiceField {
    AMOUNT,
    MERCHANT,
    CATEGORY,
    ACCOUNT,
    NOTE,
}

/**
 * Whether the spoken transaction moves money out (expense) or in (income).
 */
enum class VoiceDirection {
    EXPENSE,
    INCOME,
}

/**
 * A structured, reviewable transaction draft produced from speech (#2383).
 *
 * Money is stored in integer minor units (cents) to avoid floating-point
 * rounding errors in financial math. A `null` field means "not captured" —
 * the review flow must never invent a value.
 *
 * @property amountMinor Amount in minor units (e.g. cents), or null if absent.
 * @property currencyCode ISO-4217 code when spoken (e.g. "USD"), else null.
 * @property merchant Merchant / payee name, or null if not captured.
 * @property category Inferred category, or null if not captured.
 * @property account Account name spoken (e.g. "checking"), or null.
 * @property note Free-form memo, or null if not captured.
 * @property direction Expense vs income inferred from the utterance.
 */
data class VoiceTransactionDraft(
    val amountMinor: Long? = null,
    val currencyCode: String? = null,
    val merchant: String? = null,
    val category: String? = null,
    val account: String? = null,
    val note: String? = null,
    val direction: VoiceDirection = VoiceDirection.EXPENSE,
) {
    /** True when the draft has the minimum fields required to save (amount + merchant). */
    val isComplete: Boolean
        get() = amountMinor != null && !merchant.isNullOrBlank()
}

/**
 * A field that the parser found multiple plausible values for (#2383).
 *
 * The review flow surfaces these candidates so the user disambiguates
 * explicitly. The draft leaves the field `null` until resolved.
 *
 * @property field The ambiguous transaction field.
 * @property candidates Distinct candidate values, in spoken order.
 */
data class FieldAmbiguity(
    val field: VoiceField,
    val candidates: List<String>,
)

/**
 * Result of parsing a spoken utterance into transaction fields (#2383).
 *
 * @property draft The best-effort structured draft (unambiguous fields only).
 * @property missingFields Required fields the utterance did not provide.
 * @property ambiguities Fields with more than one plausible candidate.
 * @property overallConfidence Heuristic confidence in [0.0, 1.0].
 * @property rawUtterance Original transcript, retained in-memory for review.
 *   NEVER log this — it is user financial content.
 */
data class VoiceParseResult(
    val draft: VoiceTransactionDraft,
    val missingFields: List<VoiceField> = emptyList(),
    val ambiguities: List<FieldAmbiguity> = emptyList(),
    val overallConfidence: Float = 0f,
    val rawUtterance: String = "",
) {
    /** True when no field is missing or ambiguous — ready to review-and-save. */
    val isReadyForReview: Boolean
        get() = missingFields.isEmpty() && ambiguities.isEmpty() && draft.isComplete

    /** Fields that still need user input via a native prompt. */
    val fieldsNeedingPrompt: List<VoiceField>
        get() = (missingFields + ambiguities.map { it.field }).distinct()
}
