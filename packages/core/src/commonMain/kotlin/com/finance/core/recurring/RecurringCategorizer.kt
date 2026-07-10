// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.recurring

import com.finance.models.Transaction
import com.finance.models.types.SyncId

/**
 * Pure helpers for seeding the category of generated recurring transactions from historical
 * occurrences (e.g. an auto-detected subscription).
 *
 * [SubscriptionDetector][com.finance.core.subscription.SubscriptionDetector] already infers the most
 * common category for a detected pattern, but generated transactions only copy the template
 * category. This bridge selects the category to stamp on generated transactions by choosing the
 * dominant historical category, so auto-detected rules are pre-categorized.
 *
 * All functions are deterministic and side-effect-free.
 */
object RecurringCategorizer {

    /**
     * Select the dominant `categoryId` across [occurrences].
     *
     * The category assigned to the most occurrences wins. Ties are broken deterministically by the
     * lexicographically smallest [SyncId.value], so the result never depends on input ordering.
     * Occurrences without a category are ignored. Returns `null` when no occurrence carries a
     * category.
     *
     * @param occurrences Historical transactions for a recurring pattern.
     * @return The dominant category, or `null` if none is present.
     */
    fun dominantCategory(occurrences: List<Transaction>): SyncId? {
        val counts = LinkedHashMap<SyncId, Int>()
        for (txn in occurrences) {
            val categoryId = txn.categoryId ?: continue
            counts[categoryId] = (counts[categoryId] ?: 0) + 1
        }
        if (counts.isEmpty()) return null

        val maxCount = counts.values.max()
        return counts.entries
            .filter { it.value == maxCount }
            .minByOrNull { it.key.value }
            ?.key
    }

    /**
     * Determine the category to stamp on a transaction generated for a recurring rule.
     *
     * Prefers the dominant category inferred from [occurrences]; when the history carries no
     * category, falls back to [templateCategory] (the recurring template's own category).
     *
     * @param occurrences Historical transactions for the pattern.
     * @param templateCategory The recurring template's category, used as a fallback.
     * @return The category to apply to generated transactions, or `null` when neither is available.
     */
    fun categoryForGenerated(
        occurrences: List<Transaction>,
        templateCategory: SyncId? = null,
    ): SyncId? = dominantCategory(occurrences) ?: templateCategory

    /**
     * Return a copy of [template] whose `categoryId` is seeded from the dominant category of
     * [occurrences] (falling back to the template's existing category when the history is
     * uncategorized). All other fields — including the fixed integer `Cents` amount — are unchanged.
     *
     * @param template The recurring transaction template.
     * @param occurrences Historical transactions for the pattern.
     * @return A template carrying the resolved category.
     */
    fun applyDominantCategory(
        template: Transaction,
        occurrences: List<Transaction>,
    ): Transaction {
        val resolved = categoryForGenerated(occurrences, template.categoryId)
        return if (resolved == template.categoryId) template else template.copy(categoryId = resolved)
    }
}
