// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.receipt

import com.finance.core.dataimport.ExtractedReceiptLineItem
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate

/**
 * A single reviewable field on a [ReceiptTransactionDraft] (#2388).
 *
 * Wraps a parsed value with its per-field confidence so the review UI can
 * surface low-confidence fields for correction. A `null` [value] means the
 * on-device parser could not extract the field and the user must supply it.
 *
 * @param T the field value type (e.g. [String], [Cents], [LocalDate]).
 * @property value the parsed value, or `null` when extraction failed.
 * @property confidence parser confidence in `[0.0, 1.0]`.
 * @property needsReview whether the field should be highlighted for correction.
 */
data class ReceiptDraftField<T>(
    val value: T? = null,
    val confidence: Float = 0f,
    val needsReview: Boolean = true,
) {
    /**
     * Returns a copy reflecting a user correction.
     *
     * A user-supplied value is treated as fully trusted: confidence is set to
     * `1.0` and [needsReview] cleared.
     */
    fun corrected(newValue: T?): ReceiptDraftField<T> = copy(
        value = newValue,
        confidence = 1f,
        needsReview = false,
    )
}

/**
 * Coarse payment-method hint detected from receipt text (#2388).
 *
 * Purely a hint to pre-select an account/payment type during review — never a
 * source of truth and never derived from full card numbers.
 */
enum class ReceiptPaymentHint {
    CASH,
    DEBIT,
    CREDIT,
    VISA,
    MASTERCARD,
    AMEX,
    DISCOVER,
    CARD,
    UNKNOWN,
}

/**
 * A reviewable transaction draft produced from an on-device receipt scan (#2388).
 *
 * Every monetary/text field is wrapped in a [ReceiptDraftField] so the review
 * screen can show confidence and request corrections. No receipt image is held
 * here — image retention is opt-in and handled separately.
 *
 * @property merchant extracted merchant/payee name.
 * @property date extracted purchase date.
 * @property total extracted grand total.
 * @property tax extracted tax amount.
 * @property paymentHint detected payment-method hint.
 * @property currency detected currency, or `null` if unknown.
 * @property lineItems optional itemised lines for split suggestions.
 * @property overallConfidence aggregate parser confidence in `[0.0, 1.0]`.
 */
data class ReceiptTransactionDraft(
    val merchant: ReceiptDraftField<String> = ReceiptDraftField(),
    val date: ReceiptDraftField<LocalDate> = ReceiptDraftField(),
    val total: ReceiptDraftField<Cents> = ReceiptDraftField(),
    val tax: ReceiptDraftField<Cents> = ReceiptDraftField(),
    val paymentHint: ReceiptDraftField<ReceiptPaymentHint> = ReceiptDraftField(),
    val currency: Currency? = null,
    val lineItems: List<ExtractedReceiptLineItem> = emptyList(),
    val overallConfidence: Float = 0f,
) {
    /**
     * `true` when the draft has the minimum fields needed to create a
     * transaction (a merchant and a total).
     */
    val isUsable: Boolean
        get() = merchant.value != null && total.value != null

    /** Fields the user should review before confirming, by stable key. */
    val fieldsNeedingReview: List<String>
        get() = buildList {
            if (merchant.needsReview) add(FIELD_MERCHANT)
            if (date.needsReview) add(FIELD_DATE)
            if (total.needsReview) add(FIELD_TOTAL)
            if (tax.needsReview) add(FIELD_TAX)
            if (paymentHint.needsReview) add(FIELD_PAYMENT)
        }

    companion object {
        const val FIELD_MERCHANT = "merchant"
        const val FIELD_DATE = "date"
        const val FIELD_TOTAL = "total"
        const val FIELD_TAX = "tax"
        const val FIELD_PAYMENT = "payment"
    }
}
