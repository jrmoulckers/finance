// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.education

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests for the financial education tooltip system (#378).
 *
 * Validates that every [FinancialConcept] has complete content,
 * descriptions are non-empty, and the content registry is consistent.
 */
class FinancialConceptContentTest {

    @Test
    fun `every concept has content`() {
        FinancialConcept.entries.forEach { concept ->
            val info = FinancialConceptContent.infoFor(concept)
            assertNotNull(info, "Missing content for $concept")
        }
    }

    @Test
    fun `all titles are non-empty`() {
        FinancialConceptContent.all().forEach { (concept, info) ->
            assertTrue(info.title.isNotBlank(), "Empty title for $concept")
        }
    }

    @Test
    fun `all short descriptions are non-empty`() {
        FinancialConceptContent.all().forEach { (concept, info) ->
            assertTrue(info.shortDescription.isNotBlank(), "Empty shortDescription for $concept")
        }
    }

    @Test
    fun `all learn more texts are non-empty`() {
        FinancialConceptContent.all().forEach { (concept, info) ->
            assertTrue(info.learnMoreText.isNotBlank(), "Empty learnMoreText for $concept")
        }
    }

    @Test
    fun `concept count matches enum entries`() {
        assertEquals(
            FinancialConcept.entries.size,
            FinancialConceptContent.all().size,
            "Content map size should match enum entry count",
        )
    }

    @Test
    fun `all titles are unique`() {
        val titles = FinancialConceptContent.all().values.map { it.title }
        assertEquals(titles.size, titles.toSet().size, "Duplicate titles found")
    }

    @Test
    fun `net worth concept has correct title`() {
        val info = FinancialConceptContent.infoFor(FinancialConcept.NET_WORTH)
        assertEquals("Net Worth", info.title)
    }

    @Test
    fun `budget concept has correct title`() {
        val info = FinancialConceptContent.infoFor(FinancialConcept.BUDGET)
        assertEquals("Budget", info.title)
    }

    @Test
    fun `short descriptions do not exceed 100 words`() {
        FinancialConceptContent.all().forEach { (concept, info) ->
            val wordCount = info.shortDescription.split("\\s+".toRegex()).size
            assertTrue(
                wordCount <= 100,
                "Short description for $concept has $wordCount words (max 100)",
            )
        }
    }

    @Test
    fun `learn more texts are longer than short descriptions`() {
        FinancialConceptContent.all().forEach { (concept, info) ->
            assertTrue(
                info.learnMoreText.length >= info.shortDescription.length,
                "Learn more text for $concept should be at least as long as short description",
            )
        }
    }

    @Test
    fun `compound interest concept mentions growth`() {
        val info = FinancialConceptContent.infoFor(FinancialConcept.COMPOUND_INTEREST)
        assertTrue(
            info.shortDescription.contains("grows", ignoreCase = true) ||
                info.learnMoreText.contains("growth", ignoreCase = true) ||
                info.shortDescription.contains("faster", ignoreCase = true),
            "Compound interest should mention growth",
        )
    }

    @Test
    fun `emergency fund concept mentions months`() {
        val info = FinancialConceptContent.infoFor(FinancialConcept.EMERGENCY_FUND)
        assertTrue(
            info.learnMoreText.contains("months", ignoreCase = true),
            "Emergency fund should mention months of expenses",
        )
    }
}
