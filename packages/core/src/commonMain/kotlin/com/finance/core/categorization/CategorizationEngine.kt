// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.categorization

import com.finance.models.types.SyncId

/**
 * Simple rule-based transaction categorization engine.
 * Suggests categories based on payee name matching.
 */
class CategorizationEngine {
    private val rules = mutableListOf<CategorizationRule>()

    /**
     * Add a categorization rule.
     */
    fun addRule(rule: CategorizationRule) {
        rules.add(rule)
        rules.sortByDescending { it.priority }
    }

    /**
     * Learn from user's past categorizations.
     * Creates rules from payee -> category mappings.
     */
    fun learnFromHistory(payee: String, categoryId: SyncId) {
        // Remove existing rules for same payee (update with latest)
        rules.removeAll { it.pattern.equals(payee, ignoreCase = true) && it.type == RuleType.EXACT }
        addRule(CategorizationRule(
            pattern = payee,
            categoryId = categoryId,
            type = RuleType.EXACT,
            priority = 10,
        ))
    }

    /**
     * Suggest a category for a transaction based on payee.
     * Returns null if no match found.
     */
    fun suggest(payee: String?): SyncId? {
        if (payee.isNullOrBlank()) return null

        return rules.firstOrNull { rule ->
            when (rule.type) {
                RuleType.EXACT -> rule.pattern.equals(payee, ignoreCase = true)
                RuleType.CONTAINS -> payee.contains(rule.pattern, ignoreCase = true)
                RuleType.STARTS_WITH -> payee.startsWith(rule.pattern, ignoreCase = true)
            }
        }?.categoryId
    }
}

data class CategorizationRule(
    val pattern: String,
    val categoryId: SyncId,
    val type: RuleType,
    val priority: Int = 0,
)

enum class RuleType { EXACT, CONTAINS, STARTS_WITH }
