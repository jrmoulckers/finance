// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.Transaction
import com.finance.models.TransactionStatus
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate

/**
 * A recurring rule paired with its transaction template.
 *
 * @property rule The scheduling definition (frequency, interval, bounds).
 * @property template A prototype [Transaction] from which concrete entries are stamped.
 * @property maxOccurrences Optional cap on total generated occurrences. `null` means unlimited.
 */
data class RuleWithTemplate(
    val rule: RecurrenceRule,
    val template: Transaction,
    val maxOccurrences: Int? = null,
)

/**
 * Result of running the recurring-transaction pipeline for a single rule.
 *
 * @property ruleId The [RecurrenceRule.id] that was processed.
 * @property generated Newly created [Transaction]s for this execution run.
 * @property skipped Number of occurrences skipped because they were already generated (idempotency).
 */
data class PipelineResult(
    val ruleId: SyncId,
    val generated: List<Transaction>,
    val skipped: Int,
)

/**
 * End-to-end pipeline that converts recurring rules into concrete ledger transactions.
 *
 * Key behaviours:
 * - **Idempotent**: uses deterministic IDs (`rec-{ruleId}-{date}`) so re-running for the
 *   same date window never duplicates entries.
 * - **Month-end safe**: a rule on Jan 31 produces Feb 28/29 via day-clamping in
 *   [RecurringTransactionEngine].
 * - **Occurrence-limited**: when [RuleWithTemplate.maxOccurrences] is set, generation
 *   stops after that many total occurrences (including previously generated ones).
 * - **End-date aware**: respects [RecurrenceRule.endDate]; no transactions after that date.
 *
 * All functions are pure, deterministic, and side-effect-free.
 */
object RecurringTransactionPipeline {

    /**
     * Generate pending transactions for all [rules] up to [targetDate].
     *
     * For each rule the pipeline:
     * 1. Computes every occurrence from the rule's start date through [targetDate].
     * 2. Filters out occurrences whose deterministic ID already appears in [existingTransactionIds].
     * 3. Caps output at [RuleWithTemplate.maxOccurrences] if set (counting existing + new).
     * 4. Stamps each remaining occurrence as a [TransactionStatus.PENDING] transaction.
     *
     * @param rules The set of recurring rules with their templates.
     * @param targetDate Generate occurrences up to and including this date.
     * @param existingTransactionIds IDs of transactions already persisted (for deduplication).
     * @return A [PipelineResult] per rule, in the same order as [rules].
     */
    fun generatePendingTransactions(
        rules: List<RuleWithTemplate>,
        targetDate: LocalDate,
        existingTransactionIds: Set<String> = emptySet(),
    ): List<PipelineResult> {
        return rules.map { (rule, template, maxOccurrences) ->
            processRule(rule, template, targetDate, existingTransactionIds, maxOccurrences)
        }
    }

    /**
     * Generate pending transactions for a single rule.
     *
     * Convenience overload when processing rules one at a time.
     *
     * @param ruleWithTemplate The rule and its template.
     * @param targetDate Generate occurrences up to and including this date.
     * @param existingTransactionIds IDs of transactions already persisted.
     * @return A single [PipelineResult].
     */
    fun generateForRule(
        ruleWithTemplate: RuleWithTemplate,
        targetDate: LocalDate,
        existingTransactionIds: Set<String> = emptySet(),
    ): PipelineResult {
        return processRule(
            ruleWithTemplate.rule,
            ruleWithTemplate.template,
            targetDate,
            existingTransactionIds,
            ruleWithTemplate.maxOccurrences,
        )
    }

    // ── Internal ─────────────────────────────────────────────────────

    private fun processRule(
        rule: RecurrenceRule,
        template: Transaction,
        targetDate: LocalDate,
        existingIds: Set<String>,
        maxOccurrences: Int?,
    ): PipelineResult {
        // Rule hasn't started yet — nothing to generate.
        if (rule.startDate > targetDate) {
            return PipelineResult(ruleId = rule.id, generated = emptyList(), skipped = 0)
        }

        val allDates = RecurringTransactionEngine.generateUpcoming(
            rule = rule,
            from = rule.startDate,
            to = targetDate,
        )

        // Apply occurrence limit: cap to maxOccurrences total (existing + new).
        val cappedDates = if (maxOccurrences != null && maxOccurrences > 0) {
            allDates.take(maxOccurrences)
        } else {
            allDates
        }

        var skipped = 0
        val generated = mutableListOf<Transaction>()

        for (date in cappedDates) {
            val deterministicId = "rec-${rule.id.value}-$date"
            if (deterministicId in existingIds) {
                skipped++
                continue
            }
            generated.add(
                RecurringTransactionEngine.createFromRecurring(
                    template = template,
                    rule = rule,
                    date = date,
                ),
            )
        }

        return PipelineResult(
            ruleId = rule.id,
            generated = generated,
            skipped = skipped,
        )
    }
}
