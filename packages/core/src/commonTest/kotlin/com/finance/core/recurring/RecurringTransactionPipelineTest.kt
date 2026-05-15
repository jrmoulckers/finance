// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.core.TestFixtures
import com.finance.models.TransactionStatus
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.LocalDate
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RecurringTransactionPipelineTest {

    @BeforeTest
    fun setup() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Basic generation — all frequencies
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun daily_generatesTransactionsUpToTarget() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 3),
        )

        assertEquals(1, results.size)
        assertEquals(3, results[0].generated.size)
        assertEquals(LocalDate(2024, 7, 1), results[0].generated[0].date)
        assertEquals(LocalDate(2024, 7, 2), results[0].generated[1].date)
        assertEquals(LocalDate(2024, 7, 3), results[0].generated[2].date)
    }

    @Test
    fun weekly_generatesCorrectDates() {
        val rule = createRule(
            frequency = RecurrenceFrequency.WEEKLY,
            startDate = LocalDate(2024, 7, 1), // Monday
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 22),
        )

        assertEquals(4, results[0].generated.size)
        assertEquals(LocalDate(2024, 7, 1), results[0].generated[0].date)
        assertEquals(LocalDate(2024, 7, 8), results[0].generated[1].date)
        assertEquals(LocalDate(2024, 7, 15), results[0].generated[2].date)
        assertEquals(LocalDate(2024, 7, 22), results[0].generated[3].date)
    }

    @Test
    fun biweekly_generatesCorrectDates() {
        val rule = createRule(
            frequency = RecurrenceFrequency.BIWEEKLY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 8, 1),
        )

        // July 1, July 15, July 29
        assertEquals(3, results[0].generated.size)
        assertEquals(LocalDate(2024, 7, 1), results[0].generated[0].date)
        assertEquals(LocalDate(2024, 7, 15), results[0].generated[1].date)
        assertEquals(LocalDate(2024, 7, 29), results[0].generated[2].date)
    }

    @Test
    fun monthly_generatesCorrectDates() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 15),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 4, 15),
        )

        assertEquals(4, results[0].generated.size)
        assertEquals(LocalDate(2024, 1, 15), results[0].generated[0].date)
        assertEquals(LocalDate(2024, 2, 15), results[0].generated[1].date)
        assertEquals(LocalDate(2024, 3, 15), results[0].generated[2].date)
        assertEquals(LocalDate(2024, 4, 15), results[0].generated[3].date)
    }

    @Test
    fun yearly_generatesCorrectDates() {
        val rule = createRule(
            frequency = RecurrenceFrequency.YEARLY,
            startDate = LocalDate(2022, 6, 15),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 12, 31),
        )

        assertEquals(3, results[0].generated.size)
        assertEquals(LocalDate(2022, 6, 15), results[0].generated[0].date)
        assertEquals(LocalDate(2023, 6, 15), results[0].generated[1].date)
        assertEquals(LocalDate(2024, 6, 15), results[0].generated[2].date)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Month-end handling
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun monthly_jan31_clampsToFeb29InLeapYear() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 31),
            dayOfMonth = 31,
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 3, 31),
        )

        assertEquals(3, results[0].generated.size)
        assertEquals(LocalDate(2024, 1, 31), results[0].generated[0].date)
        // Feb 2024 is a leap year, so 29 days
        assertEquals(LocalDate(2024, 2, 29), results[0].generated[1].date)
        assertEquals(LocalDate(2024, 3, 31), results[0].generated[2].date)
    }

    @Test
    fun monthly_jan31_clampsToFeb28InNonLeapYear() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2023, 1, 31),
            dayOfMonth = 31,
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2023, 3, 31),
        )

        assertEquals(3, results[0].generated.size)
        assertEquals(LocalDate(2023, 1, 31), results[0].generated[0].date)
        assertEquals(LocalDate(2023, 2, 28), results[0].generated[1].date)
        assertEquals(LocalDate(2023, 3, 31), results[0].generated[2].date)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Idempotency — skip already-generated transactions
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun idempotent_skipsAlreadyGeneratedTransactions() {
        val ruleId = SyncId("rule-1")
        val rule = createRule(
            id = ruleId,
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        // Simulate that July 1 and 2 were already generated.
        val existingIds = setOf(
            "rec-rule-1-2024-07-01",
            "rec-rule-1-2024-07-02",
        )

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 4),
            existingTransactionIds = existingIds,
        )

        assertEquals(2, results[0].generated.size, "Only July 3 and 4 should be new")
        assertEquals(2, results[0].skipped, "July 1 and 2 should be skipped")
        assertEquals(LocalDate(2024, 7, 3), results[0].generated[0].date)
        assertEquals(LocalDate(2024, 7, 4), results[0].generated[1].date)
    }

    @Test
    fun idempotent_allAlreadyGenerated_returnsEmpty() {
        val ruleId = SyncId("rule-1")
        val rule = createRule(
            id = ruleId,
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        val existingIds = setOf(
            "rec-rule-1-2024-07-01",
            "rec-rule-1-2024-07-02",
            "rec-rule-1-2024-07-03",
        )

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 3),
            existingTransactionIds = existingIds,
        )

        assertTrue(results[0].generated.isEmpty())
        assertEquals(3, results[0].skipped)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Transaction linking
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun generatedTransactions_areLinkedToRule() {
        val ruleId = SyncId("rule-42")
        val rule = createRule(
            id = ruleId,
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 1),
        )

        val generated = results[0].generated[0]
        assertEquals(ruleId, generated.recurringRuleId, "Must link to originating rule")
        assertTrue(generated.isRecurring, "Must be marked as recurring")
        assertEquals(TransactionStatus.PENDING, generated.status, "Must start as PENDING")
    }

    @Test
    fun generatedTransactions_haveDeterministicIds() {
        val ruleId = SyncId("rule-42")
        val rule = createRule(
            id = ruleId,
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 2),
        )

        assertEquals(SyncId("rec-rule-42-2024-07-01"), results[0].generated[0].id)
        assertEquals(SyncId("rec-rule-42-2024-07-02"), results[0].generated[1].id)
    }

    // ═══════════════════════════════════════════════════════════════════
    // End date and occurrence limits
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun endDate_stopsGenerationAtEndDate() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
            endDate = LocalDate(2024, 7, 3),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 10), // well past end date
        )

        assertEquals(3, results[0].generated.size)
        assertEquals(LocalDate(2024, 7, 3), results[0].generated.last().date)
    }

    @Test
    fun maxOccurrences_capsGeneration() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template, maxOccurrences = 3)),
            targetDate = LocalDate(2024, 7, 10),
        )

        assertEquals(3, results[0].generated.size, "Should cap at 3 occurrences")
        assertEquals(LocalDate(2024, 7, 3), results[0].generated.last().date)
    }

    @Test
    fun maxOccurrences_countsPreviouslyGenerated() {
        val ruleId = SyncId("rule-1")
        val rule = createRule(
            id = ruleId,
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template = createTemplate()

        // 2 already exist, max is 5, so only 3 more should be generated
        val existingIds = setOf(
            "rec-rule-1-2024-07-01",
            "rec-rule-1-2024-07-02",
        )

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template, maxOccurrences = 5)),
            targetDate = LocalDate(2024, 7, 10),
            existingTransactionIds = existingIds,
        )

        // Total cap = 5 dates (July 1-5), 2 skipped, 3 new
        assertEquals(3, results[0].generated.size)
        assertEquals(2, results[0].skipped)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Rule start in the future
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun ruleNotYetStarted_generatesNothing() {
        val rule = createRule(
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 8, 1),
        )
        val template = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(RuleWithTemplate(rule, template)),
            targetDate = LocalDate(2024, 7, 15),
        )

        assertTrue(results[0].generated.isEmpty())
        assertEquals(0, results[0].skipped)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Multiple rules
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun multipleRules_processedIndependently() {
        val rule1Id = SyncId("rule-a")
        val rule2Id = SyncId("rule-b")
        val rule1 = createRule(
            id = rule1Id,
            frequency = RecurrenceFrequency.DAILY,
            startDate = LocalDate(2024, 7, 1),
        )
        val rule2 = createRule(
            id = rule2Id,
            frequency = RecurrenceFrequency.WEEKLY,
            startDate = LocalDate(2024, 7, 1),
        )
        val template1 = createTemplate()
        val template2 = createTemplate()

        val results = RecurringTransactionPipeline.generatePendingTransactions(
            rules = listOf(
                RuleWithTemplate(rule1, template1),
                RuleWithTemplate(rule2, template2),
            ),
            targetDate = LocalDate(2024, 7, 14),
        )

        assertEquals(2, results.size)
        assertEquals(14, results[0].generated.size, "Daily: 14 days")
        assertEquals(2, results[1].generated.size, "Weekly: July 1 and July 8")
        assertEquals(rule1Id, results[0].ruleId)
        assertEquals(rule2Id, results[1].ruleId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // generateForRule convenience
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun generateForRule_singleRuleConvenience() {
        val rule = createRule(
            frequency = RecurrenceFrequency.MONTHLY,
            startDate = LocalDate(2024, 1, 1),
        )
        val template = createTemplate()

        val result = RecurringTransactionPipeline.generateForRule(
            ruleWithTemplate = RuleWithTemplate(rule, template),
            targetDate = LocalDate(2024, 3, 1),
        )

        assertEquals(3, result.generated.size)
        assertEquals(rule.id, result.ruleId)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun createRule(
        id: SyncId = TestFixtures.nextId(),
        frequency: RecurrenceFrequency = RecurrenceFrequency.MONTHLY,
        interval: Int = 1,
        startDate: LocalDate = LocalDate(2024, 1, 1),
        endDate: LocalDate? = null,
        dayOfMonth: Int? = null,
        dayOfWeek: DayOfWeek? = null,
    ): RecurrenceRule = RecurrenceRule(
        id = id,
        frequency = frequency,
        interval = interval,
        startDate = startDate,
        endDate = endDate,
        dayOfMonth = dayOfMonth,
        dayOfWeek = dayOfWeek,
    )

    private fun createTemplate(): com.finance.models.Transaction {
        return TestFixtures.createTransaction(
            type = TransactionType.EXPENSE,
            amount = Cents(5000),
            payee = "Test Merchant",
        )
    }
}
