// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [LocalUtteranceParser] and [RuleBasedVoiceEntityExtractor] (#2383).
 *
 * Covers amount extraction across phrasings, merchant/category/account/note
 * capture, income detection, missing-field reporting, and ambiguity handling.
 * Deterministic and fully offline — no Android framework required.
 */
class LocalUtteranceParserTest {

    private val parser = LocalUtteranceParser()

    // ── Amount phrasings ─────────────────────────────────────────────────

    @Test
    fun `parses dollar sign amount`() {
        val result = parser.parse("Coffee at Starbucks \$4.50")
        assertEquals(450L, result.draft.amountMinor)
        assertEquals("USD", result.draft.currencyCode)
    }

    @Test
    fun `parses spoken dollars word`() {
        val result = parser.parse("Lunch at Chipotle 12 dollars")
        assertEquals(1200L, result.draft.amountMinor)
    }

    @Test
    fun `parses dollars and cents phrasing`() {
        val result = parser.parse("Gas at Chevron 4 dollars and 50 cents")
        assertEquals(450L, result.draft.amountMinor)
    }

    @Test
    fun `parses spelled out amount`() {
        val result = parser.parse("Snack at Deli twenty dollars")
        assertEquals(2000L, result.draft.amountMinor)
    }

    @Test
    fun `parses bare decimal as money`() {
        val result = parser.parse("Coffee at Cafe 3.75")
        assertEquals(375L, result.draft.amountMinor)
    }

    @Test
    fun `dollars and cents is not double counted`() {
        val entities = RuleBasedVoiceEntityExtractor().extract("paid 4 dollars and 50 cents")
        assertEquals(listOf(450L), entities.amountsMinor)
    }

    // ── Merchant ─────────────────────────────────────────────────────────

    @Test
    fun `extracts merchant after at`() {
        val result = parser.parse("Coffee at Starbucks \$4.50")
        assertEquals("Starbucks", result.draft.merchant)
    }

    @Test
    fun `extracts merchant after from dropping article`() {
        val result = parser.parse("Bought lunch at the Deli 8 dollars")
        assertEquals("Deli", result.draft.merchant)
    }

    // ── Category, account, note, direction ───────────────────────────────

    @Test
    fun `infers category from keyword`() {
        val result = parser.parse("Coffee at Starbucks \$4.50")
        assertEquals("Dining", result.draft.category)
    }

    @Test
    fun `extracts account keyword`() {
        val result = parser.parse("Coffee at Starbucks \$4.50 with cash")
        assertEquals("Cash", result.draft.account)
    }

    @Test
    fun `extracts note phrase`() {
        val result = parser.parse("Dinner at Bistro 40 dollars note client meeting")
        assertEquals("client meeting", result.draft.note)
    }

    @Test
    fun `detects income direction`() {
        val result = parser.parse("Received salary at Employer 3000 dollars")
        assertEquals(VoiceDirection.INCOME, result.draft.direction)
    }

    @Test
    fun `defaults to expense direction`() {
        val result = parser.parse("Coffee at Starbucks \$4.50")
        assertEquals(VoiceDirection.EXPENSE, result.draft.direction)
    }

    // ── Missing fields → prompts, never silent defaults ──────────────────

    @Test
    fun `reports missing merchant`() {
        val result = parser.parse("Spent 20 dollars")
        assertTrue(VoiceField.MERCHANT in result.missingFields)
        assertNull(result.draft.merchant)
        assertFalse(result.isReadyForReview)
    }

    @Test
    fun `reports missing amount`() {
        val result = parser.parse("Coffee at Starbucks")
        assertTrue(VoiceField.AMOUNT in result.missingFields)
        assertNull(result.draft.amountMinor)
    }

    @Test
    fun `blank utterance reports both required fields missing`() {
        val result = parser.parse("   ")
        assertTrue(VoiceField.AMOUNT in result.missingFields)
        assertTrue(VoiceField.MERCHANT in result.missingFields)
        assertEquals(0f, result.overallConfidence)
    }

    // ── Ambiguity → never auto-pick ──────────────────────────────────────

    @Test
    fun `ambiguous amount is left unset and reported`() {
        val result = parser.parse("Lunch at Cafe 20 dollars or 30 dollars")
        val ambiguity = result.ambiguities.firstOrNull { it.field == VoiceField.AMOUNT }
        assertTrue(ambiguity != null)
        assertEquals(listOf("2000", "3000"), ambiguity!!.candidates)
        assertNull(result.draft.amountMinor)
    }

    @Test
    fun `ambiguous category is reported but does not block`() {
        val result = parser.parse("Uber to the gym 15 dollars at Stop")
        val ambiguity = result.ambiguities.firstOrNull { it.field == VoiceField.CATEGORY }
        assertTrue(ambiguity != null)
        assertNull(result.draft.category)
        // category is optional, so it is not a missing required field
        assertFalse(VoiceField.CATEGORY in result.missingFields)
    }

    // ── Happy path readiness ─────────────────────────────────────────────

    @Test
    fun `complete utterance is ready for review`() {
        val result = parser.parse("Coffee at Starbucks \$4.50")
        assertTrue(result.isReadyForReview)
        assertTrue(result.missingFields.isEmpty())
        assertTrue(result.ambiguities.isEmpty())
        assertTrue(result.overallConfidence > 0.7f)
    }

    @Test
    fun `fieldsNeedingPrompt combines missing and ambiguous`() {
        val result = parser.parse("Spent 20 dollars or 30 dollars")
        assertTrue(VoiceField.MERCHANT in result.fieldsNeedingPrompt)
        assertTrue(VoiceField.AMOUNT in result.fieldsNeedingPrompt)
    }

    // ── Pluggable extractor seam ─────────────────────────────────────────

    @Test
    fun `custom extractor is used for resolution`() {
        val stub = VoiceEntityExtractor {
            VoiceEntities(amountsMinor = listOf(999L), merchantCandidates = listOf("StubCo"))
        }
        val result = LocalUtteranceParser(stub).parse("anything")
        assertEquals(999L, result.draft.amountMinor)
        assertEquals("StubCo", result.draft.merchant)
    }
}
