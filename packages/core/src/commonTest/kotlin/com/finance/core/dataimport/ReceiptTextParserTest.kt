// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ReceiptTextParserTest {
    @Test
    fun `parses merchant date total and itemized lines`() {
        val receipt = parseReceiptText(SIMPLE_RECEIPT_TEXT)

        assertEquals("Simple Market", receipt.merchant)
        assertEquals(LocalDate(2026, 5, 26), receipt.date)
        assertEquals(Cents(1608), receipt.total)
        assertEquals("USD", receipt.currency?.code)
        assertEquals(SIMPLE_RECEIPT_TEXT, receipt.rawText)
        assertTrue(receipt.confidence >= 90.0)

        assertEquals(3, receipt.lineItems.size)
        assertEquals("Organic Apples", receipt.lineItems[0].description)
        assertEquals(Cents(399), receipt.lineItems[0].total)
        assertEquals("Groceries", receipt.lineItems[0].suggestedCategory)
    }

    @Test
    fun `maps line item category suggestions to app category ids`() {
        val receipt = parseReceiptText(
            rawText = SIMPLE_RECEIPT_TEXT,
            appCategories = listOf(
                CategoryMapper.AppCategory(id = "cat-grocery", name = "Groceries"),
                CategoryMapper.AppCategory(id = "cat-dining", name = "Restaurants"),
            ),
        )

        val apples = assertNotNull(receipt.lineItems.firstOrNull { it.description == "Organic Apples" })
        assertEquals("cat-grocery", apples.suggestedCategoryId)
    }

    @Test
    fun `normalises OCR confidence from zero to one range`() {
        val receipt = parseReceiptText(SIMPLE_RECEIPT_TEXT, ocrConfidence = 0.82)

        assertEquals(82.0, receipt.confidence)
    }

    private companion object {
        private const val SIMPLE_RECEIPT_TEXT = """Simple Market
2026-05-26
Organic Apples 3.99
Whole Milk 4.49
Sourdough Bread 5.25
Subtotal 13.73
Tax 2.35
Total $16.08"""
    }
}
