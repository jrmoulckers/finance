// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.schedulec

import com.finance.models.types.Cents
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ScheduleCDeductionPresetTaxonomyTest {
    private val json = Json { encodeDefaults = true }

    @Test
    fun taxonomyContainsOnePresetForEveryScheduleCCategory() {
        val presets = ScheduleCDeductionPresetTaxonomy.presets
        val categories = ScheduleCExpenseCategory.values().toSet()

        assertEquals(categories, presets.map { it.category }.toSet())
        assertEquals(categories.size, presets.size)
        assertEquals(presets.size, presets.map { it.id }.toSet().size)
        assertTrue(presets.all { ScheduleCDeductionPresetTaxonomy.validatePreset(it).isEmpty() })
    }

    @Test
    fun taxonomyIncludesExpectedCoreGigAndScheduleCEntries() {
        assertPreset(
            id = "schedule-c-car-and-truck",
            category = ScheduleCExpenseCategory.CAR_AND_TRUCK,
            irsLine = "Line 9",
            defaultBusinessUsePercent = 90,
        )
        assertPreset(
            id = "schedule-c-supplies",
            category = ScheduleCExpenseCategory.SUPPLIES,
            irsLine = "Line 22",
            defaultBusinessUsePercent = 100,
        )
        assertPreset(
            id = "schedule-c-advertising",
            category = ScheduleCExpenseCategory.ADVERTISING,
            irsLine = "Line 8",
            defaultBusinessUsePercent = 100,
        )
        assertPreset(
            id = "schedule-c-contract-labor",
            category = ScheduleCExpenseCategory.CONTRACT_LABOR,
            irsLine = "Line 11",
            defaultBusinessUsePercent = 100,
        )
        assertPreset(
            id = "schedule-c-home-office",
            category = ScheduleCExpenseCategory.HOME_OFFICE,
            irsLine = "Line 30",
            defaultBusinessUsePercent = 25,
        )
    }

    @Test
    fun defaultBusinessUsePercentagesAreValidAndDocumentMixedUseDefaults() {
        val presets = ScheduleCDeductionPresetTaxonomy.presets

        assertTrue(presets.all { it.defaultBusinessUsePercent in 0..100 })
        assertEquals(50, requirePreset("schedule-c-meals").defaultBusinessUsePercent)
        assertEquals(25, requirePreset("schedule-c-home-office").defaultBusinessUsePercent)
        assertEquals(90, requirePreset("schedule-c-car-and-truck").defaultBusinessUsePercent)
        assertEquals(100, requirePreset("schedule-c-utilities").defaultBusinessUsePercent)
        assertNotNull(requirePreset("schedule-c-home-office").notes)
    }

    @Test
    fun validatePresetReportsRequiredFieldsAndPercentBounds() {
        val invalid = ScheduleCDeductionPreset(
            id = " ",
            category = ScheduleCExpenseCategory.OTHER_EXPENSES,
            displayName = "",
            irsLine = "",
            description = " ",
            defaultBusinessUsePercent = 101,
            examples = listOf("valid", " "),
        )

        val issues = ScheduleCDeductionPresetTaxonomy.validatePreset(invalid)
        val fields = issues.map { it.field }.toSet()

        assertTrue("id" in fields)
        assertTrue("displayName" in fields)
        assertTrue("irsLine" in fields)
        assertTrue("description" in fields)
        assertTrue("defaultBusinessUsePercent" in fields)
        assertTrue("examples[1]" in fields)
        assertFalse("category" in fields)
    }

    @Test
    fun validatePresetRequiresAtLeastOneExample() {
        val invalid = requirePreset("schedule-c-supplies").copy(examples = emptyList())

        assertEquals(
            listOf(ScheduleCValidationIssue("examples", "At least one example is required.")),
            ScheduleCDeductionPresetTaxonomy.validatePreset(invalid),
        )
    }

    @Test
    fun validateDraftRequestAllowsZeroAndOneHundredPercentBoundaries() {
        assertTrue(
            ScheduleCDeductionPresetTaxonomy.validateDraftRequest(
                ScheduleCDraftRequest(Cents(100), businessUsePercentOverride = 0),
            ).isEmpty(),
        )
        assertTrue(
            ScheduleCDeductionPresetTaxonomy.validateDraftRequest(
                ScheduleCDraftRequest(Cents(100), businessUsePercentOverride = 100),
            ).isEmpty(),
        )
    }

    @Test
    fun validateDraftRequestRejectsNonPositiveAmountAndOutOfRangePercent() {
        val zeroAmountIssues = ScheduleCDeductionPresetTaxonomy.validateDraftRequest(ScheduleCDraftRequest(Cents.ZERO))
        val negativePercentIssues = ScheduleCDeductionPresetTaxonomy.validateDraftRequest(
            ScheduleCDraftRequest(Cents(100), businessUsePercentOverride = -1),
        )
        val highPercentIssues = ScheduleCDeductionPresetTaxonomy.validateDraftRequest(
            ScheduleCDraftRequest(Cents(100), businessUsePercentOverride = 101),
        )

        assertEquals("amountCents", zeroAmountIssues.single().field)
        assertEquals("businessUsePercentOverride", negativePercentIssues.single().field)
        assertEquals("businessUsePercentOverride", highPercentIssues.single().field)
    }

    @Test
    fun createDraftUsesPresetMetadataAndDefaultBusinessUsePercent() {
        val draft = ScheduleCDeductionPresetTaxonomy.createDraft(
            presetId = "schedule-c-supplies",
            request = ScheduleCDraftRequest(amountCents = Cents(12_345), memo = "  thermal labels  "),
        )

        assertEquals("schedule-c-supplies", draft.presetId)
        assertEquals(ScheduleCExpenseCategory.SUPPLIES, draft.category)
        assertEquals("Supplies", draft.categoryDisplayName)
        assertEquals("Line 22", draft.irsLine)
        assertEquals(Cents(12_345), draft.amountCents)
        assertTrue(draft.deductible)
        assertEquals(100, draft.businessUsePercent)
        assertEquals(Cents(12_345), draft.deductibleAmountCents)
        assertEquals("thermal labels", draft.memo)
        assertTrue(ScheduleCDeductionPresetTaxonomy.validateDraft(draft).isEmpty())
    }

    @Test
    fun createDraftAppliesBusinessUseOverrideToDeductibleAmount() {
        val draft = ScheduleCDeductionPresetTaxonomy.createDraft(
            presetId = "schedule-c-car-and-truck",
            request = ScheduleCDraftRequest(amountCents = Cents(10_000), businessUsePercentOverride = 80),
        )

        assertEquals(80, draft.businessUsePercent)
        assertEquals(Cents(8_000), draft.deductibleAmountCents)
    }

    @Test
    fun createDraftSupportsNonDeductibleOverride() {
        val draft = ScheduleCDeductionPresetTaxonomy.createDraft(
            presetId = "schedule-c-meals",
            request = ScheduleCDraftRequest(amountCents = Cents(2_500), deductibleOverride = false),
        )

        assertFalse(draft.deductible)
        assertEquals(50, draft.businessUsePercent)
        assertEquals(Cents.ZERO, draft.deductibleAmountCents)
        assertTrue(ScheduleCDeductionPresetTaxonomy.validateDraft(draft).isEmpty())
    }

    @Test
    fun createDraftRejectsUnknownPresetAndInvalidRequest() {
        assertFailsWith<IllegalArgumentException> {
            ScheduleCDeductionPresetTaxonomy.createDraft(
                presetId = "missing",
                request = ScheduleCDraftRequest(amountCents = Cents(100)),
            )
        }

        val failure = assertFailsWith<IllegalArgumentException> {
            ScheduleCDeductionPresetTaxonomy.createDraft(
                presetId = "schedule-c-supplies",
                request = ScheduleCDraftRequest(amountCents = Cents(-1), businessUsePercentOverride = 150),
            )
        }
        assertTrue(failure.message.orEmpty().contains("amountCents"))
        assertTrue(failure.message.orEmpty().contains("businessUsePercentOverride"))
    }

    @Test
    fun validateDraftReportsRequiredFieldsAndInvalidDeductibleState() {
        val invalid = ScheduleCTransactionDraft(
            presetId = "",
            category = ScheduleCExpenseCategory.OTHER_EXPENSES,
            categoryDisplayName = " ",
            irsLine = "",
            amountCents = Cents(0),
            deductible = false,
            businessUsePercent = -1,
            deductibleAmountCents = Cents(10),
        )

        val fields = ScheduleCDeductionPresetTaxonomy.validateDraft(invalid).map { it.field }.toSet()

        assertTrue("presetId" in fields)
        assertTrue("categoryDisplayName" in fields)
        assertTrue("irsLine" in fields)
        assertTrue("amountCents" in fields)
        assertTrue("businessUsePercent" in fields)
        assertTrue("deductibleAmountCents" in fields)
    }

    @Test
    fun scheduleCModelsSerializeRoundTripAsPlatformNeutralJson() {
        val preset = requirePreset("schedule-c-home-office")
        val request = ScheduleCDraftRequest(
            amountCents = Cents(20_000),
            businessUsePercentOverride = 30,
            memo = "April home office allocation",
        )
        val draft = ScheduleCDeductionPresetTaxonomy.createDraft(preset.id, request)
        val issue = ScheduleCValidationIssue("businessUsePercent", "Business-use percent must be in 0..100.")

        assertEquals(preset, json.decodeFromString<ScheduleCDeductionPreset>(json.encodeToString(preset)))
        assertEquals(request, json.decodeFromString<ScheduleCDraftRequest>(json.encodeToString(request)))
        assertEquals(draft, json.decodeFromString<ScheduleCTransactionDraft>(json.encodeToString(draft)))
        assertEquals(issue, json.decodeFromString<ScheduleCValidationIssue>(json.encodeToString(issue)))

        val encoded = json.encodeToString(draft)
        assertTrue(encoded.contains("\"category\":\"home_office\""))
        assertTrue(encoded.contains("\"amountCents\":20000"))
        assertTrue(encoded.contains("\"businessUsePercent\":30"))
        assertTrue(encoded.contains("\"deductibleAmountCents\":6000"))
    }

    private fun assertPreset(
        id: String,
        category: ScheduleCExpenseCategory,
        irsLine: String,
        defaultBusinessUsePercent: Int,
    ) {
        val preset = requirePreset(id)
        assertEquals(category, preset.category)
        assertEquals(irsLine, preset.irsLine)
        assertEquals(defaultBusinessUsePercent, preset.defaultBusinessUsePercent)
        assertTrue(preset.displayName.isNotBlank())
        assertTrue(preset.description.isNotBlank())
        assertTrue(preset.examples.isNotEmpty())
    }

    private fun requirePreset(id: String): ScheduleCDeductionPreset =
        requireNotNull(ScheduleCDeductionPresetTaxonomy.findPreset(id))
}
