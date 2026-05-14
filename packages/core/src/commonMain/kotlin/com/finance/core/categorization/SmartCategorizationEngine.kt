// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.categorization

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.serialization.Serializable

/**
 * AI-powered transaction categorization engine that combines multiple
 * strategies: keyword matching, payee frequency analysis, amount-range
 * heuristics, and user-correction learning.
 *
 * All logic is pure commonMain — no platform dependencies.
 * Monetary values stay as [Cents] (Long-backed) throughout.
 */
class SmartCategorizationEngine {

    private val keywordRules = mutableListOf<KeywordRule>()
    private val payeeHistory = mutableMapOf<String, MutableMap<SyncId, Int>>()
    private val amountRangeRules = mutableListOf<AmountRangeRule>()
    private val userCorrections = mutableMapOf<String, SyncId>()

    // ── Rule management ──────────────────────────────────────────────

    /**
     * Register a keyword-based categorization rule.
     * Keywords are matched case-insensitively against the payee string.
     */
    fun addKeywordRule(rule: KeywordRule) {
        keywordRules.add(rule)
        keywordRules.sortByDescending { it.weight }
    }

    /**
     * Register an amount-range rule that categorizes transactions
     * whose absolute amount falls within the given [Cents] bounds.
     */
    fun addAmountRangeRule(rule: AmountRangeRule) {
        amountRangeRules.add(rule)
    }

    // ── Learning ─────────────────────────────────────────────────────

    /**
     * Record a user correction: the user assigned [categoryId] to a
     * transaction with the given [payee]. User corrections have the
     * highest confidence and override all other strategies.
     */
    fun recordCorrection(payee: String, categoryId: SyncId) {
        if (payee.isBlank()) return
        userCorrections[payee.lowercase()] = categoryId
    }

    /**
     * Learn from a batch of historical transactions to build
     * payee → category frequency tables.
     *
     * Only non-deleted expense/income transactions with a non-null
     * [Transaction.categoryId] and non-null [Transaction.payee] are used.
     */
    fun learnFromTransactions(transactions: List<Transaction>) {
        transactions
            .filter {
                it.deletedAt == null &&
                    it.categoryId != null &&
                    !it.payee.isNullOrBlank() &&
                    it.type != TransactionType.TRANSFER
            }
            .forEach { txn ->
                val key = txn.payee!!.lowercase()
                val categoryMap = payeeHistory.getOrPut(key) { mutableMapOf() }
                categoryMap[txn.categoryId!!] = (categoryMap[txn.categoryId] ?: 0) + 1
            }
    }

    // ── Suggestion ───────────────────────────────────────────────────

    /**
     * Suggest the best category for a transaction based on all available signals.
     *
     * Strategy priority (highest to lowest):
     * 1. User corrections (explicit override)
     * 2. Payee frequency (most-used category for this exact payee)
     * 3. Keyword rules (weighted keyword matching)
     * 4. Amount range rules (amount-based heuristic)
     *
     * Returns a [CategorizationSuggestion] with the category and confidence,
     * or `null` if no strategy matches.
     */
    @Suppress("ReturnCount")
    fun suggest(payee: String?, amount: Cents? = null): CategorizationSuggestion? {
        // 1. User corrections — highest confidence
        if (!payee.isNullOrBlank()) {
            userCorrections[payee.lowercase()]?.let { categoryId ->
                return CategorizationSuggestion(
                    categoryId = categoryId,
                    confidence = Confidence.HIGH,
                    strategy = CategorizationStrategy.USER_CORRECTION,
                )
            }
        }

        // 2. Payee frequency analysis
        if (!payee.isNullOrBlank()) {
            payeeHistory[payee.lowercase()]?.let { categoryMap ->
                if (categoryMap.isNotEmpty()) {
                    val totalOccurrences = categoryMap.values.sum()
                    val (topCategory, topCount) = categoryMap.maxByOrNull { it.value }!!
                    val ratio = topCount.toDouble() / totalOccurrences

                    val confidence = when {
                        ratio >= 0.8 && totalOccurrences >= 3 -> Confidence.HIGH
                        ratio >= 0.5 && totalOccurrences >= 2 -> Confidence.MEDIUM
                        else -> Confidence.LOW
                    }

                    return CategorizationSuggestion(
                        categoryId = topCategory,
                        confidence = confidence,
                        strategy = CategorizationStrategy.PAYEE_FREQUENCY,
                    )
                }
            }
        }

        // 3. Keyword rules
        if (!payee.isNullOrBlank()) {
            val payeeLower = payee.lowercase()
            val matchedRules = keywordRules.filter { rule ->
                rule.keywords.any { keyword -> payeeLower.contains(keyword.lowercase()) }
            }
            if (matchedRules.isNotEmpty()) {
                val bestRule = matchedRules.first() // already sorted by weight
                val confidence = when {
                    bestRule.weight >= 80 -> Confidence.HIGH
                    bestRule.weight >= 50 -> Confidence.MEDIUM
                    else -> Confidence.LOW
                }
                return CategorizationSuggestion(
                    categoryId = bestRule.categoryId,
                    confidence = confidence,
                    strategy = CategorizationStrategy.KEYWORD_MATCH,
                )
            }
        }

        // 4. Amount range rules
        if (amount != null) {
            val absAmount = amount.abs()
            val matchedRange = amountRangeRules.firstOrNull { rule ->
                absAmount.amount >= rule.minCents.amount &&
                    absAmount.amount <= rule.maxCents.amount
            }
            if (matchedRange != null) {
                return CategorizationSuggestion(
                    categoryId = matchedRange.categoryId,
                    confidence = Confidence.LOW,
                    strategy = CategorizationStrategy.AMOUNT_RANGE,
                )
            }
        }

        return null
    }

    /**
     * Suggest categories for multiple transactions at once.
     * Returns a map of transaction ID → suggestion (only for those that matched).
     */
    fun suggestBatch(transactions: List<Transaction>): Map<SyncId, CategorizationSuggestion> {
        return transactions
            .filter { it.categoryId == null && it.deletedAt == null }
            .mapNotNull { txn ->
                suggest(txn.payee, txn.amount)?.let { suggestion ->
                    txn.id to suggestion
                }
            }
            .toMap()
    }

    /**
     * Retrieve analytics about the engine's current state.
     */
    fun getStats(): EngineStats {
        return EngineStats(
            keywordRuleCount = keywordRules.size,
            knownPayeeCount = payeeHistory.size,
            amountRangeRuleCount = amountRangeRules.size,
            userCorrectionCount = userCorrections.size,
        )
    }
}

// ── Data classes ─────────────────────────────────────────────────────

/**
 * A keyword-based categorization rule.
 * If any keyword is found (case-insensitive) in the payee, the
 * transaction is categorized with [categoryId].
 */
@Serializable
data class KeywordRule(
    val keywords: List<String>,
    val categoryId: SyncId,
    /** Weight for priority ordering. Higher weight = higher priority. */
    val weight: Int = 50,
) {
    init {
        require(keywords.isNotEmpty()) { "Keywords list cannot be empty" }
        require(keywords.all { it.isNotBlank() }) { "Keywords cannot be blank" }
        require(weight in 0..100) { "Weight must be between 0 and 100" }
    }
}

/**
 * An amount-range categorization rule.
 * Transactions whose absolute amount falls within [minCents]..[maxCents]
 * are categorized with [categoryId].
 */
@Serializable
data class AmountRangeRule(
    val minCents: Cents,
    val maxCents: Cents,
    val categoryId: SyncId,
) {
    init {
        require(minCents.amount >= 0) { "minCents must be non-negative" }
        require(maxCents.amount >= minCents.amount) { "maxCents must be >= minCents" }
    }
}

/** The strategy that produced a suggestion. */
@Serializable
enum class CategorizationStrategy {
    USER_CORRECTION,
    PAYEE_FREQUENCY,
    KEYWORD_MATCH,
    AMOUNT_RANGE,
}

/** Confidence level of a categorization suggestion. */
@Serializable
enum class Confidence { LOW, MEDIUM, HIGH }

/**
 * A suggested category assignment for a transaction.
 */
@Serializable
data class CategorizationSuggestion(
    val categoryId: SyncId,
    val confidence: Confidence,
    val strategy: CategorizationStrategy,
)

/**
 * Engine diagnostic statistics.
 */
data class EngineStats(
    val keywordRuleCount: Int,
    val knownPayeeCount: Int,
    val amountRangeRuleCount: Int,
    val userCorrectionCount: Int,
)
