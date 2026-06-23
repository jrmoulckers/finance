// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.receipt

import com.finance.core.dataimport.ExtractedReceiptText
import com.finance.core.dataimport.parseReceiptText
import com.finance.models.types.Cents

/**
 * Deterministic mapper from on-device OCR output to a reviewable
 * [ReceiptTransactionDraft] (#2388).
 *
 * The heavy lifting (merchant/date/total/line items) is delegated to the shared
 * KMP [parseReceiptText]. This mapper adds Android-side concerns that the shared
 * contract does not expose — **tax** and **payment-method hint** extraction — and
 * computes per-field confidence so the review UI can flag low-confidence fields.
 *
 * Pure and side-effect free: it never touches the camera, ML Kit, the network,
 * or persistence, which keeps it fully unit-testable on the JVM.
 *
 * ## Security
 * Operates only on text already recognised on device. Never logs receipt text,
 * amounts, or merchant names.
 */
object ReceiptDraftMapper {

    /** Default confidence below which a field is flagged for review. */
    const val DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.6f

    private const val PERCENT = 100.0

    // A trailing monetary amount on a line, e.g. "TAX 1.23" or "$1,234.56".
    private val trailingAmount = Regex("""([$€£¥]?\s*-?\d{1,4}(?:,\d{3})*\.\d{2})\s*$""")
    private val taxLabel = Regex("""(?i)\b(sales\s+tax|tax|vat|gst|hst)\b""")

    // Payment hints, most specific first so brand wins over generic "card".
    private val paymentRules: List<Pair<Regex, ReceiptPaymentHint>> = listOf(
        Regex("""(?i)\bvisa\b""") to ReceiptPaymentHint.VISA,
        Regex("""(?i)\bmaster\s*-?\s*card\b""") to ReceiptPaymentHint.MASTERCARD,
        Regex("""(?i)\b(amex|american\s+express)\b""") to ReceiptPaymentHint.AMEX,
        Regex("""(?i)\bdiscover\b""") to ReceiptPaymentHint.DISCOVER,
        Regex("""(?i)\bdebit\b""") to ReceiptPaymentHint.DEBIT,
        Regex("""(?i)\bcredit\b""") to ReceiptPaymentHint.CREDIT,
        Regex("""(?i)\b(cash|change\s+due|tendered)\b""") to ReceiptPaymentHint.CASH,
        Regex("""(?i)\b(card|chip|tap|contactless)\b""") to ReceiptPaymentHint.CARD,
    )

    /**
     * Parses raw OCR [rawText] into a reviewable draft.
     *
     * @param rawText on-device OCR text.
     * @param ocrConfidence optional engine confidence in `[0.0, 1.0]` or
     *   `[0.0, 100.0]`; estimated from parsed fields when omitted.
     * @param threshold confidence below which a field is flagged for review.
     */
    fun fromRawText(
        rawText: String,
        ocrConfidence: Double? = null,
        threshold: Float = DEFAULT_LOW_CONFIDENCE_THRESHOLD,
    ): ReceiptTransactionDraft = fromExtracted(parseReceiptText(rawText, ocrConfidence), threshold)

    /**
     * Maps an already-parsed [ExtractedReceiptText] into a reviewable draft,
     * augmenting it with tax and payment-method hints.
     */
    fun fromExtracted(
        extracted: ExtractedReceiptText,
        threshold: Float = DEFAULT_LOW_CONFIDENCE_THRESHOLD,
    ): ReceiptTransactionDraft {
        val base = (extracted.confidence / PERCENT).toFloat().coerceIn(0f, 1f)
        val tax = extractTax(extracted.rawText, total = extracted.total)
        val payment = extractPaymentHint(extracted.rawText)

        return ReceiptTransactionDraft(
            merchant = field(extracted.merchant, base, threshold),
            date = field(extracted.date, base, threshold),
            total = field(extracted.total, base, threshold),
            // Tax and payment are heuristic add-ons; discount their confidence
            // slightly so partial matches surface for review.
            tax = field(tax, base * HEURISTIC_DISCOUNT, threshold),
            paymentHint = field(
                payment.takeIf { it != ReceiptPaymentHint.UNKNOWN },
                base * HEURISTIC_DISCOUNT,
                threshold,
            ),
            currency = extracted.currency,
            lineItems = extracted.lineItems,
            overallConfidence = base,
        )
    }

    private fun <T> field(value: T?, confidence: Float, threshold: Float): ReceiptDraftField<T> {
        val effective = if (value == null) 0f else confidence
        return ReceiptDraftField(
            value = value,
            confidence = effective,
            needsReview = value == null || effective < threshold,
        )
    }

    /**
     * Extracts a tax amount from a labelled line such as "Sales Tax 1.23".
     * Ignores a tax line that equals the grand [total] (mislabelled OCR).
     */
    private fun extractTax(rawText: String, total: Cents?): Cents? = rawText
        .lineSequence()
        .map { it.trim() }
        .filter { taxLabel.containsMatchIn(it) }
        .mapNotNull { parseTrailingCents(it) }
        .firstOrNull { it != total }

    private fun extractPaymentHint(rawText: String): ReceiptPaymentHint =
        paymentRules.firstOrNull { (pattern, _) -> pattern.containsMatchIn(rawText) }
            ?.second
            ?: ReceiptPaymentHint.UNKNOWN

    private fun parseTrailingCents(line: String): Cents? {
        val raw = trailingAmount.find(line)?.value ?: return null
        val normalised = raw.replace(Regex("""[^\d.-]"""), "").trim()
        val value = if (normalised.contains('.')) normalised.toDoubleOrNull() else null
        return value?.let { Cents.fromDollars(it).abs() }
    }

    private const val HEURISTIC_DISCOUNT = 0.9f
}
