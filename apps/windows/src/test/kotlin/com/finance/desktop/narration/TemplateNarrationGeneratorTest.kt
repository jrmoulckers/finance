// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.narration

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Golden tests for the deterministic [TemplateNarrationGenerator].
 *
 * The fixture snapshot and the expected concise/detailed narrations are the
 * worked example from `docs/windows/ml-narration-pipeline-design.md` §9, stored
 * as JSON under `src/test/resources/narration-fixtures`. Equality is asserted
 * against the decoded data classes (not raw JSON text) so whitespace and field
 * order are irrelevant — only the narration content is pinned. Everything runs
 * with no model present.
 */
class TemplateNarrationGeneratorTest {

    private val json = Json { ignoreUnknownKeys = true }
    private val generator = TemplateNarrationGenerator()

    private fun loadResource(path: String): String =
        requireNotNull(javaClass.getResourceAsStream(path)) { "missing test resource: $path" }
            .bufferedReader()
            .use { it.readText() }

    private fun loadSnapshot(): FinancialStateSnapshot =
        json.decodeFromString(
            FinancialStateSnapshot.serializer(),
            loadResource("/narration-fixtures/snapshots/02-bill-due-soon.json"),
        )

    private fun loadGolden(path: String): Narration =
        json.decodeFromString(Narration.serializer(), loadResource(path))

    @Test
    fun `concise narration matches the golden fixture`() {
        val snapshot = loadSnapshot()
        val expected = loadGolden("/narration-fixtures/golden/02-bill-due-soon.concise.json")

        val actual = generator.generate(snapshot, NarrationMode.CONCISE)

        assertEquals(expected, actual)
    }

    @Test
    fun `detailed narration matches the golden fixture`() {
        val snapshot = loadSnapshot()
        val expected = loadGolden("/narration-fixtures/golden/02-bill-due-soon.detailed.json")

        val actual = generator.generate(snapshot, NarrationMode.DETAILED)

        assertEquals(expected, actual)
    }

    @Test
    fun `time-relevant bill leads the headline, not the low-confidence trend`() {
        val narration = generator.generate(loadSnapshot(), NarrationMode.CONCISE)

        assertEquals("summary", narration.headline.id)
        assertEquals(SegmentKind.SUMMARY, narration.headline.kind)
        assertTrue(narration.headline.text.startsWith("Your Electric bill"))
    }

    @Test
    fun `concise mode keeps at most two segments and omits the goal and uncertainty`() {
        val narration = generator.generate(loadSnapshot(), NarrationMode.CONCISE)

        assertEquals(listOf("budget.dining", "trend"), narration.segments.map { it.id })
    }

    @Test
    fun `detailed mode appends an explicit uncertainty segment for the low-confidence trend`() {
        val narration = generator.generate(loadSnapshot(), NarrationMode.DETAILED)

        assertEquals(
            listOf("budget.dining", "trend", "goal.emergency.fund", "uncertainty"),
            narration.segments.map { it.id },
        )
        val uncertainty = narration.segments.last()
        assertEquals(SegmentKind.UNCERTAINTY, uncertainty.kind)
        assertEquals(ConfidenceLevel.LOW, uncertainty.confidence.level)
    }

    @Test
    fun `narration tone never uses banned, alarmist vocabulary`() {
        for (mode in NarrationMode.entries) {
            val narration = generator.generate(loadSnapshot(), mode)
            val combined = narration.plainText() + " " + narration.screenReaderText()
            val banned = NarrationText.firstBannedTerm(combined)
            assertNull(banned, "mode $mode leaked banned term: $banned")
            assertTrue(narration.plainText().contains("fully used"))
        }
    }

    @Test
    fun `every segment carries non-empty screen reader text and source references`() {
        val narration = generator.generate(loadSnapshot(), NarrationMode.DETAILED)
        val all = listOf(narration.headline) + narration.segments

        for (segment in all) {
            assertTrue(segment.a11y.screenReaderText.isNotBlank(), "blank SR text for ${segment.id}")
            assertTrue(segment.sourceRefs.isNotEmpty(), "missing sourceRefs for ${segment.id}")
        }
    }

    @Test
    fun `accessibility metadata is never assertive and the headline is the only heading`() {
        val narration = generator.generate(loadSnapshot(), NarrationMode.DETAILED)
        val all = listOf(narration.headline) + narration.segments

        assertTrue(all.none { it.a11y.ariaLive == AriaLive.ASSERTIVE })

        val headings = all.filter { it.a11y.headingLevel != null }
        assertEquals(1, headings.size)
        assertEquals(narration.headline.id, headings.single().id)
        assertEquals(2, narration.headline.a11y.headingLevel)
        assertEquals(A11yRole.STATUS, narration.headline.a11y.role)
    }

    @Test
    fun `provenance marks the output as a deterministic template with no model`() {
        val narration = generator.generate(loadSnapshot(), NarrationMode.CONCISE)

        assertEquals(GeneratorKind.TEMPLATE, narration.provenance.generator)
        assertTrue(narration.provenance.deterministic)
        assertNull(narration.provenance.modelId)
        assertNull(narration.provenance.modelVersion)
        assertNull(narration.provenance.runtime)
    }

    @Test
    fun `net-worth headline is used when no bills are pending`() {
        val snapshot = loadSnapshot().copy(upcomingBills = emptyList())

        val narration = generator.generate(snapshot, NarrationMode.CONCISE)

        assertNotNull(narration.headline)
        assertTrue(narration.headline.text.startsWith("Your net worth is"))
        assertEquals(listOf("netWorth", "cashOnHand"), narration.headline.sourceRefs)
    }
}
