// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.nlp

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [TransactionNlpParser] (#237).
 *
 * Validates natural language parsing across amount extraction, payee
 * detection, date inference, category matching, and type classification.
 */
class TransactionNlpParserTest {

    private val today = Clock.System.now()
        .toLocalDateTime(TimeZone.currentSystemDefault()).date

    // ── Amount extraction ────────────────────────────────────────────

    @Test
    fun `extracts dollar amount with dollar sign`() {
        val result = TransactionNlpParser.parse("Coffee $4.50")
        assertEquals(4.50, result.amount)
    }

    @Test
    fun `extracts dollar amount without dollar sign`() {
        val result = TransactionNlpParser.parse("Lunch 12.00")
        assertEquals(12.0, result.amount)
    }

    @Test
    fun `extracts amount with comma separators`() {
        val result = TransactionNlpParser.parse("Received salary $3,500")
        assertEquals(3500.0, result.amount)
    }

    @Test
    fun `extracts whole number amount`() {
        val result = TransactionNlpParser.parse("Uber $15")
        assertEquals(15.0, result.amount)
    }

    @Test
    fun `returns null amount for no numbers`() {
        val result = TransactionNlpParser.parse("coffee at starbucks")
        assertNull(result.amount)
    }

    // ── Payee extraction ────────────────────────────────────────────

    @Test
    fun `extracts payee after 'at' keyword`() {
        val result = TransactionNlpParser.parse("Coffee at Starbucks $4.50")
        assertEquals("Starbucks", result.payee)
    }

    @Test
    fun `extracts payee after 'from' keyword`() {
        val result = TransactionNlpParser.parse("Received from John $50")
        assertEquals("John", result.payee)
    }

    @Test
    fun `extracts multi-word payee`() {
        val result = TransactionNlpParser.parse("Lunch at Olive Garden $25")
        assertEquals("Olive Garden", result.payee)
    }

    @Test
    fun `returns null payee when no keyword present`() {
        val result = TransactionNlpParser.parse("Coffee $4.50")
        assertNull(result.payee)
    }

    // ── Date extraction ─────────────────────────────────────────────

    @Test
    fun `extracts today`() {
        val result = TransactionNlpParser.parse("Coffee $4 today")
        assertEquals(today, result.date)
    }

    @Test
    fun `extracts yesterday`() {
        val result = TransactionNlpParser.parse("Lunch $12 yesterday")
        val expected = today.minus(1, DateTimeUnit.DAY)
        assertEquals(expected, result.date)
    }

    @Test
    fun `extracts ISO date`() {
        val result = TransactionNlpParser.parse("Payment $100 2025-03-15")
        assertEquals(LocalDate(2025, 3, 15), result.date)
    }

    @Test
    fun `extracts slash date MM DD`() {
        val result = TransactionNlpParser.parse("Coffee $4 3/15")
        assertNotNull(result.date)
        assertEquals(3, result.date!!.monthNumber)
        assertEquals(15, result.date!!.dayOfMonth)
    }

    @Test
    fun `returns null date when none specified`() {
        val result = TransactionNlpParser.parse("Coffee $4.50")
        assertNull(result.date)
    }

    // ── Category inference ──────────────────────────────────────────

    @Test
    fun `infers Dining category from coffee keyword`() {
        val result = TransactionNlpParser.parse("Coffee at Starbucks $4")
        assertEquals("Dining", result.category)
    }

    @Test
    fun `infers Groceries category from grocery keyword`() {
        val result = TransactionNlpParser.parse("Groceries at Walmart $85")
        assertEquals("Groceries", result.category)
    }

    @Test
    fun `infers Transport category from uber keyword`() {
        val result = TransactionNlpParser.parse("Uber ride $15")
        assertEquals("Transport", result.category)
    }

    @Test
    fun `infers Entertainment from netflix keyword`() {
        val result = TransactionNlpParser.parse("Netflix subscription $15")
        assertEquals("Entertainment", result.category)
    }

    @Test
    fun `returns null category when no keywords match`() {
        val result = TransactionNlpParser.parse("Random payment $50")
        assertNull(result.category)
    }

    // ── Type inference ──────────────────────────────────────────────

    @Test
    fun `defaults to expense type`() {
        val result = TransactionNlpParser.parse("Coffee $4.50")
        assertEquals(TransactionNlpType.EXPENSE, result.type)
    }

    @Test
    fun `detects income from earned keyword`() {
        val result = TransactionNlpParser.parse("Earned $500 freelancing")
        assertEquals(TransactionNlpType.INCOME, result.type)
    }

    @Test
    fun `detects income from salary keyword`() {
        val result = TransactionNlpParser.parse("Received salary $3500")
        assertEquals(TransactionNlpType.INCOME, result.type)
    }

    @Test
    fun `detects income from refund keyword`() {
        val result = TransactionNlpParser.parse("Refund from Amazon $25")
        assertEquals(TransactionNlpType.INCOME, result.type)
    }

    // ── Confidence scoring ──────────────────────────────────────────

    @Test
    fun `high confidence when amount and payee both extracted`() {
        val result = TransactionNlpParser.parse("Coffee at Starbucks $4.50 today")
        assertTrue(result.confidence >= 0.7f, "Expected high confidence, got ${result.confidence}")
    }

    @Test
    fun `low confidence for vague input`() {
        val result = TransactionNlpParser.parse("something")
        assertTrue(result.confidence < 0.4f, "Expected low confidence, got ${result.confidence}")
    }

    @Test
    fun `zero confidence for empty input`() {
        val result = TransactionNlpParser.parse("")
        assertEquals(0f, result.confidence)
    }

    // ── Edge cases ──────────────────────────────────────────────────

    @Test
    fun `handles blank input gracefully`() {
        val result = TransactionNlpParser.parse("   ")
        assertEquals(0f, result.confidence)
    }

    @Test
    fun `preserves raw input`() {
        val input = "Coffee at Starbucks $4.50"
        val result = TransactionNlpParser.parse(input)
        assertEquals(input, result.rawInput)
    }

    @Test
    fun `complex input parses multiple fields`() {
        val result = TransactionNlpParser.parse("Lunch at Chipotle $12.50 yesterday")
        assertEquals(12.50, result.amount)
        assertEquals("Chipotle", result.payee)
        assertEquals("Dining", result.category)
        assertNotNull(result.date)
        assertEquals(TransactionNlpType.EXPENSE, result.type)
    }
}
