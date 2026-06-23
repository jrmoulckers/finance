// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.receipt

import com.finance.core.dataimport.ExtractedReceiptText
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * JVM unit tests for [ReceiptDraftMapper] (#2388).
 *
 * Validates deterministic on-device parsing into a reviewable draft: merchant,
 * date, total, tax, payment hint, line items, per-field confidence, and the
 * low-confidence review flags. Uses the shared KMP parser end-to-end via raw text.
 */
class ReceiptDraftMapperTest {

    private val sampleReceipt = """
        Whole Foods Market
        123 Market St
        2024-03-15
        Bananas 2.49
        Almond Milk 4.99
        Subtotal 7.48
        Sales Tax 0.60
        Total 8.08
        VISA ************1234
        Thank you
    """.trimIndent()

    // ── End-to-end raw text parsing ──────────────────────────────────

    @Test
    fun `extracts merchant total tax and payment from a typical receipt`() {
        val draft = ReceiptDraftMapper.fromRawText(sampleReceipt)

        assertEquals("Whole Foods Market", draft.merchant.value)
        assertEquals(LocalDate(2024, 3, 15), draft.date.value)
        assertEquals(Cents.fromDollars(8.08), draft.total.value)
        assertEquals(Cents.fromDollars(0.60), draft.tax.value)
        assertEquals(ReceiptPaymentHint.VISA, draft.paymentHint.value)
        assertTrue(draft.isUsable)
    }

    @Test
    fun `parses line items from receipt body`() {
        val draft = ReceiptDraftMapper.fromRawText(sampleReceipt)
        val descriptions = draft.lineItems.map { it.description }
        assertTrue(descriptions.any { it.contains("Bananas") })
        assertTrue(descriptions.any { it.contains("Almond Milk") })
    }

    // ── Tax extraction ───────────────────────────────────────────────

    @Test
    fun `extracts tax from a sales tax line`() {
        val draft = ReceiptDraftMapper.fromRawText("Store\nSales Tax 1.23\nTotal 10.00")
        assertEquals(Cents.fromDollars(1.23), draft.tax.value)
    }

    @Test
    fun `tax is null when no tax line present`() {
        val draft = ReceiptDraftMapper.fromRawText("Store\nTotal 10.00")
        assertNull(draft.tax.value)
        assertTrue(draft.tax.needsReview)
    }

    @Test
    fun `does not treat the grand total as tax`() {
        // The only labelled-tax amount echoes the grand total; it must be ignored.
        val draft = ReceiptDraftMapper.fromRawText("Store\nTax Total 10.00\nTotal 10.00")
        assertNull(draft.tax.value)
    }

    // ── Payment hint extraction ─────────────────────────────────────

    @Test
    fun `detects mastercard over generic card`() {
        val draft = ReceiptDraftMapper.fromRawText("Store\nTotal 5.00\nMasterCard ****1111\nCard present")
        assertEquals(ReceiptPaymentHint.MASTERCARD, draft.paymentHint.value)
    }

    @Test
    fun `detects cash payment`() {
        val draft = ReceiptDraftMapper.fromRawText("Store\nTotal 5.00\nCASH 10.00\nChange Due 5.00")
        assertEquals(ReceiptPaymentHint.CASH, draft.paymentHint.value)
    }

    @Test
    fun `detects amex from american express`() {
        val draft = ReceiptDraftMapper.fromRawText("Store\nTotal 5.00\nAmerican Express")
        assertEquals(ReceiptPaymentHint.AMEX, draft.paymentHint.value)
    }

    @Test
    fun `payment hint is null when no method present`() {
        val draft = ReceiptDraftMapper.fromRawText("Store\nTotal 5.00")
        assertNull(draft.paymentHint.value)
        assertTrue(draft.paymentHint.needsReview)
    }

    // ── Confidence + review flags ───────────────────────────────────

    @Test
    fun `high confidence extracted fields are not flagged for review`() {
        val extracted = ExtractedReceiptText(
            merchant = "Acme",
            date = LocalDate(2024, 1, 2),
            total = Cents.fromDollars(9.99),
            currency = Currency.USD,
            rawText = "Acme\n2024-01-02\nTotal 9.99",
            confidence = 100.0,
        )
        val draft = ReceiptDraftMapper.fromExtracted(extracted)

        assertFalse(draft.merchant.needsReview)
        assertFalse(draft.total.needsReview)
        assertEquals(1.0f, draft.overallConfidence)
    }

    @Test
    fun `low confidence extracted fields are flagged for review`() {
        val extracted = ExtractedReceiptText(
            merchant = "Blurry Store",
            total = Cents.fromDollars(3.00),
            rawText = "Blurry Store\nTotal 3.00",
            confidence = 30.0,
        )
        val draft = ReceiptDraftMapper.fromExtracted(extracted)

        assertTrue(draft.merchant.needsReview)
        assertTrue(draft.total.needsReview)
        assertTrue(draft.fieldsNeedingReview.contains(ReceiptTransactionDraft.FIELD_MERCHANT))
    }

    @Test
    fun `missing fields are flagged and draft is not usable`() {
        val draft = ReceiptDraftMapper.fromRawText("")
        assertNull(draft.merchant.value)
        assertNull(draft.total.value)
        assertFalse(draft.isUsable)
        assertTrue(draft.merchant.needsReview)
    }

    // ── Correction semantics ────────────────────────────────────────

    @Test
    fun `correcting a field trusts the user value`() {
        val draft = ReceiptDraftMapper.fromRawText("Blurry\nTotal 3.00", ocrConfidence = 0.2)
        val corrected = draft.copy(merchant = draft.merchant.corrected("Corner Store"))

        assertEquals("Corner Store", corrected.merchant.value)
        assertEquals(1.0f, corrected.merchant.confidence)
        assertFalse(corrected.merchant.needsReview)
    }

    @Test
    fun `currency is carried through to the draft`() {
        val draft = ReceiptDraftMapper.fromRawText("Shop\nTotal €12.00")
        assertNotNull(draft)
        assertEquals(Currency.EUR, draft.currency)
    }
}
