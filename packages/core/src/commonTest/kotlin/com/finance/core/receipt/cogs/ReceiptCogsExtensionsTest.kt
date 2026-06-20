// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.receipt.cogs

import com.finance.core.dataimport.ExtractedReceiptLineItem
import com.finance.core.dataimport.parseReceiptText
import com.finance.models.types.Cents
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ReceiptCogsExtensionsTest {
    private val json = Json { encodeDefaults = true }

    @Test
    fun confidenceScoringAddsDeterministicFlagsAndBands() {
        val receipt = parseReceiptText(COGS_RECEIPT_TEXT, ocrConfidence = 0.93)
        val analysis = receipt.analyzeCogsReceipt(attachments = listOf(attachment()))

        assertEquals(100, analysis.confidence.score)
        assertEquals(ReceiptConfidenceBand.HIGH, analysis.confidence.band)
        assertTrue(ReceiptConfidenceFlag.TAX_DETECTED in analysis.confidence.flags)
        assertTrue(ReceiptConfidenceFlag.PAYMENT_DETECTED in analysis.confidence.flags)
        assertTrue(ReceiptConfidenceFlag.ATTACHMENT_PRESENT in analysis.confidence.flags)
        assertFalse(ReceiptConfidenceFlag.AMBIGUOUS_CATEGORY in analysis.confidence.flags)
    }

    @Test
    fun categorySuggestionUsesCogsKeywordsFromLineItems() {
        val suggestion = ReceiptCogsExtensions.suggestCategory(
            listOf(
                item("Raw cocoa beans", 2_500),
                item("Compostable packaging boxes", 1_000),
                item("Ingredient sugar", 800),
            ),
        )

        assertEquals(ReceiptCogsCategory.COST_OF_GOODS_SOLD, suggestion.category)
        assertEquals("cogs", suggestion.categoryId)
        assertEquals(4_300, suggestion.matchedAmountCents)
        assertEquals(90, suggestion.confidence)
    }

    @Test
    fun categorySuggestionUsesSuppliesWhenOperationalConsumablesWin() {
        val suggestion = ReceiptCogsExtensions.suggestCategory(
            listOf(
                item("Printer paper", 1_200),
                item("Cleaning gloves", 900),
                item("Packing tape", 500),
            ),
        )

        assertEquals(ReceiptCogsCategory.SUPPLIES, suggestion.category)
        assertEquals("supplies", suggestion.categoryId)
        assertEquals(2_600, suggestion.matchedAmountCents)
        assertEquals(90, suggestion.confidence)
    }

    @Test
    fun categorySuggestionUsesInventoryWhenResaleGoodsWin() {
        val suggestion = ReceiptCogsExtensions.suggestCategory(
            listOf(
                item("Resale candle units", 4_000),
                item("Retail goods carton", 3_500),
                item("Office pens", 400),
            ),
        )

        assertEquals(ReceiptCogsCategory.INVENTORY, suggestion.category)
        assertEquals("inventory", suggestion.categoryId)
        assertEquals(7_500, suggestion.matchedAmountCents)
        assertEquals(90, suggestion.confidence)
    }

    @Test
    fun categorySuggestionReturnsUnknownForAmbiguousTies() {
        val suggestion = ReceiptCogsExtensions.suggestCategory(
            listOf(
                item("Printer paper", 1_000),
                item("Resale product units", 1_000),
            ),
        )

        assertEquals(ReceiptCogsCategory.UNKNOWN, suggestion.category)
        assertNull(suggestion.categoryId)
        assertEquals(40, suggestion.confidence)
        assertTrue(suggestion.reason.contains("tied"))
    }

    @Test
    fun ambiguousLineDoesNotVoteForCategory() {
        val suggestions = ReceiptCogsExtensions.suggestLineItemCategories(
            listOf(item("Inventory storage boxes", 1_200)),
        )

        assertEquals(1, suggestions.size)
        assertEquals(ReceiptCogsCategory.UNKNOWN, suggestions.single().category)
        assertEquals(40, suggestions.single().confidence)
        assertTrue("inventory" in suggestions.single().matchedKeywords)
        assertTrue("boxes" in suggestions.single().matchedKeywords)
    }

    @Test
    fun attachmentMetadataIsPlatformNeutralAndValidated() {
        val metadata = ReceiptAttachmentMetadata(
            filename = "receipt-2584.jpg",
            mimeType = "image/jpeg",
            sizeBytes = 42_000,
            checksum = "sha256:abc123",
        )

        assertEquals("receipt-2584.jpg", metadata.filename)
        assertEquals("image/jpeg", metadata.mimeType)
        assertEquals(42_000, metadata.sizeBytes)
        assertEquals("sha256:abc123", metadata.checksum)
    }

    @Test
    fun draftOutputUsesIntegerCentsTaxPaymentAndAttachmentHints() {
        val receipt = parseReceiptText(COGS_RECEIPT_TEXT)
        val draft = assertNotNull(
            receipt.toCogsTransactionDraft(
                attachments = listOf(attachment()),
                categoryIds = ReceiptCogsCategoryIds(costOfGoodsSold = "cat-cogs"),
            ),
        )

        assertEquals("Cost of Goods Sold", draft.category)
        assertEquals("cat-cogs", draft.categoryId)
        assertEquals(4_860, draft.amountCents)
        assertEquals(360, draft.taxCents)
        assertEquals(ReceiptPaymentMethod.CARD, draft.paymentMethod)
        assertEquals("Bakery Wholesale", draft.merchant)
        assertEquals("receipt.jpg", draft.attachments.single().filename)
    }

    @Test
    fun taxAndPaymentHintsParseAmountsAndLastFour() {
        val taxHints = ReceiptCogsExtensions.extractTaxHints(COGS_RECEIPT_TEXT)
        val paymentHints = ReceiptCogsExtensions.extractPaymentHints(COGS_RECEIPT_TEXT)

        assertEquals(1, taxHints.size)
        assertEquals(ReceiptTaxKind.SALES_TAX, taxHints.single().kind)
        assertEquals(360, taxHints.single().amountCents)
        assertEquals(1, paymentHints.size)
        assertEquals(ReceiptPaymentMethod.CARD, paymentHints.single().method)
        assertEquals(4_860, paymentHints.single().amountCents)
        assertEquals("4242", paymentHints.single().lastFour)
    }

    @Test
    fun serializationRoundTripsContracts() {
        val receipt = parseReceiptText(COGS_RECEIPT_TEXT)
        val analysis = receipt.analyzeCogsReceipt(attachments = listOf(attachment()))
        val draft = assertNotNull(analysis.draft)
        val encodedAnalysis = json.encodeToString(analysis)
        val encodedDraft = json.encodeToString(draft)
        val encodedAttachment = json.encodeToString(attachment())
        val encodedSuggestion = json.encodeToString(analysis.categorySuggestion)

        assertEquals(analysis, json.decodeFromString<ReceiptCogsAnalysis>(encodedAnalysis))
        assertEquals(draft, json.decodeFromString<ReceiptTransactionDraft>(encodedDraft))
        assertEquals(attachment(), json.decodeFromString<ReceiptAttachmentMetadata>(encodedAttachment))
        assertEquals(
            analysis.categorySuggestion,
            json.decodeFromString<ReceiptCategorySuggestion>(encodedSuggestion),
        )
    }

    @Test
    fun emptyReceiptIsUnusableAndDoesNotCreateDraft() {
        val receipt = parseReceiptText("")
        val analysis = receipt.analyzeCogsReceipt()

        assertNull(analysis.draft)
        assertEquals(ReceiptCogsCategory.UNKNOWN, analysis.categorySuggestion.category)
        assertEquals(0, analysis.confidence.score)
        assertEquals(ReceiptConfidenceBand.UNUSABLE, analysis.confidence.band)
        assertTrue(ReceiptConfidenceFlag.EMPTY_RECEIPT in analysis.confidence.flags)
        assertTrue(ReceiptConfidenceFlag.MISSING_TOTAL in analysis.confidence.flags)
    }

    private fun item(description: String, cents: Long): ExtractedReceiptLineItem = ExtractedReceiptLineItem(
        description = description,
        total = Cents(cents),
    )

    private fun attachment(): ReceiptAttachmentMetadata = ReceiptAttachmentMetadata(
        filename = "receipt.jpg",
        mimeType = "image/jpeg",
        sizeBytes = 18_432,
        checksum = "sha256:2584",
    )

    private companion object {
        private const val COGS_RECEIPT_TEXT = """Bakery Wholesale
2026-05-26
Raw cocoa beans 25.00
Packaging boxes 20.00
Sales Tax 3.60
Visa ****4242 48.60
Total $48.60"""
    }
}
