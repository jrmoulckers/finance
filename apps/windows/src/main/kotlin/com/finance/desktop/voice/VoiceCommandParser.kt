// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.voice

import com.finance.models.types.Cents
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime

/**
 * Result of parsing a voice command into a structured transaction.
 *
 * All fields are nullable — the parser extracts what it can and leaves
 * unrecognised components as `null` for the UI to prompt the user.
 */
data class ParsedTransaction(
    val amount: Cents? = null,
    val description: String? = null,
    val category: String? = null,
    val date: LocalDate? = null,
    val isExpense: Boolean = true,
    val rawInput: String = "",
    val confidence: Float = 0f,
)

/**
 * Parses natural-language voice commands into structured [ParsedTransaction] data.
 *
 * Supports several spoken formats:
 *
 * | Spoken command                         | Parsed result                              |
 * |----------------------------------------|--------------------------------------------|
 * | "spent 42 dollars on groceries"        | amount=4200, category=Groceries, expense   |
 * | "paid 20 for lunch yesterday"          | amount=2000, desc=lunch, date=yesterday    |
 * | "add 100 to savings"                   | amount=10000, category=Savings, income     |
 * | "received 500 from payroll"            | amount=50000, desc=payroll, income         |
 * | "bought coffee for 5.50"               | amount=550, desc=coffee, expense           |
 *
 * The parser is intentionally lenient — it extracts what it can and returns
 * partial results with a confidence score. The UI layer handles confirmation
 * and correction of ambiguous fields.
 *
 * ## Thread Safety
 *
 * All methods are pure functions with no shared mutable state.
 */
class VoiceCommandParser {

    companion object {
        /** Words that indicate an expense transaction. */
        private val EXPENSE_KEYWORDS = setOf(
            "spent", "paid", "bought", "purchased", "charged", "cost",
        )

        /** Words that indicate an income/credit transaction. */
        private val INCOME_KEYWORDS = setOf(
            "received", "earned", "got", "deposited", "added", "add",
        )

        /** Well-known category aliases mapped to canonical names. */
        private val CATEGORY_MAP = mapOf(
            "groceries" to "Groceries",
            "grocery" to "Groceries",
            "food" to "Food & Dining",
            "dining" to "Food & Dining",
            "restaurant" to "Food & Dining",
            "restaurants" to "Food & Dining",
            "lunch" to "Food & Dining",
            "dinner" to "Food & Dining",
            "breakfast" to "Food & Dining",
            "coffee" to "Food & Dining",
            "gas" to "Transportation",
            "fuel" to "Transportation",
            "transport" to "Transportation",
            "transportation" to "Transportation",
            "uber" to "Transportation",
            "lyft" to "Transportation",
            "rent" to "Housing",
            "housing" to "Housing",
            "mortgage" to "Housing",
            "utilities" to "Utilities",
            "electric" to "Utilities",
            "water" to "Utilities",
            "internet" to "Utilities",
            "phone" to "Utilities",
            "entertainment" to "Entertainment",
            "movie" to "Entertainment",
            "movies" to "Entertainment",
            "netflix" to "Entertainment",
            "spotify" to "Entertainment",
            "shopping" to "Shopping",
            "clothes" to "Shopping",
            "clothing" to "Shopping",
            "health" to "Healthcare",
            "doctor" to "Healthcare",
            "medical" to "Healthcare",
            "pharmacy" to "Healthcare",
            "savings" to "Savings",
            "investment" to "Investments",
            "investments" to "Investments",
        )

        /** Date words mapped to relative offsets from today. */
        private val DATE_KEYWORDS = mapOf(
            "today" to 0,
            "yesterday" to -1,
            "last night" to -1,
        )

        /**
         * Regex to match dollar amounts:
         * - "42" or "42.50" or "$42" or "$42.50"
         * - "42 dollars" or "42 bucks"
         */
        private val AMOUNT_PATTERN = Regex(
            """\$?(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks?)?""",
            RegexOption.IGNORE_CASE,
        )

        /**
         * Regex for "for ..." pattern to extract description.
         * E.g., "paid 20 for lunch" → description = "lunch"
         */
        private val FOR_PATTERN = Regex(
            """\bfor\s+(.+?)(?:\s+(?:yesterday|today|last\s+night))?$""",
            RegexOption.IGNORE_CASE,
        )

        /**
         * Regex for "on ..." pattern to extract category.
         * E.g., "spent 42 on groceries" → category = "Groceries"
         */
        private val ON_PATTERN = Regex(
            """\bon\s+(\w+)""",
            RegexOption.IGNORE_CASE,
        )

        /**
         * Regex for "from ..." pattern to extract description.
         * E.g., "received 500 from payroll" → description = "payroll"
         */
        private val FROM_PATTERN = Regex(
            """\bfrom\s+(.+?)(?:\s+(?:yesterday|today|last\s+night))?$""",
            RegexOption.IGNORE_CASE,
        )

        /**
         * Regex for "to ..." pattern to extract category.
         * E.g., "add 100 to savings" → category = "Savings"
         */
        private val TO_PATTERN = Regex(
            """\bto\s+(\w+)""",
            RegexOption.IGNORE_CASE,
        )
    }

    /**
     * Parses the [input] string into a [ParsedTransaction].
     *
     * The parser attempts to extract:
     * 1. **Transaction type** (expense vs income) from keywords
     * 2. **Amount** from dollar patterns
     * 3. **Category** from known category words
     * 4. **Description** from "for X" or "from X" patterns
     * 5. **Date** from "yesterday", "today", or defaults to today
     *
     * @param input The raw voice-to-text transcription
     * @return A [ParsedTransaction] with extracted fields and a confidence score
     */
    fun parse(input: String): ParsedTransaction {
        if (input.isBlank()) {
            return ParsedTransaction(rawInput = input, confidence = 0f)
        }

        val normalised = input.trim().lowercase()
        val words = normalised.split(Regex("\\s+"))

        // 1. Determine transaction type
        val isExpense = determineTransactionType(words)

        // 2. Extract amount
        val amount = extractAmount(normalised)

        // 3. Extract category
        val category = extractCategory(normalised, words)

        // 4. Extract description
        val description = extractDescription(normalised, category)

        // 5. Extract date
        val date = extractDate(normalised)

        // 6. Calculate confidence
        val confidence = calculateConfidence(amount, description, category, date)

        return ParsedTransaction(
            amount = amount,
            description = description,
            category = category,
            date = date ?: today(),
            isExpense = isExpense,
            rawInput = input,
            confidence = confidence,
        )
    }

    // ── Extraction helpers ──────────────────────────────────────────────────

    private fun determineTransactionType(words: List<String>): Boolean {
        val firstActionWord = words.firstOrNull { word ->
            word in EXPENSE_KEYWORDS || word in INCOME_KEYWORDS
        }
        return firstActionWord == null || firstActionWord in EXPENSE_KEYWORDS
    }

    private fun extractAmount(input: String): Cents? {
        val match = AMOUNT_PATTERN.find(input) ?: return null
        return try {
            val dollars = match.groupValues[1].toDouble()
            Cents.fromDollars(dollars)
        } catch (_: NumberFormatException) {
            null
        }
    }

    @Suppress("ReturnCount") // Pattern matching with multiple exit points
    private fun extractCategory(input: String, words: List<String>): String? {
        // Check "on <category>" pattern first
        ON_PATTERN.find(input)?.let { match ->
            val word = match.groupValues[1].lowercase()
            CATEGORY_MAP[word]?.let { return it }
        }

        // Check "to <category>" pattern
        TO_PATTERN.find(input)?.let { match ->
            val word = match.groupValues[1].lowercase()
            CATEGORY_MAP[word]?.let { return it }
        }

        // Check all words against category map
        for (word in words) {
            val cleaned = word.replace(Regex("[^a-z]"), "")
            CATEGORY_MAP[cleaned]?.let { return it }
        }

        return null
    }

    @Suppress("ReturnCount") // Pattern matching with multiple exit points
    private fun extractDescription(input: String, category: String?): String? {
        // Try "for <description>" pattern
        FOR_PATTERN.find(input)?.let { match ->
            val desc = match.groupValues[1].trim()
            if (desc.isNotBlank() && desc != category?.lowercase()) {
                return desc.replaceFirstChar { it.uppercaseChar() }
            }
        }

        // Try "from <description>" pattern
        FROM_PATTERN.find(input)?.let { match ->
            val desc = match.groupValues[1].trim()
            if (desc.isNotBlank()) {
                return desc.replaceFirstChar { it.uppercaseChar() }
            }
        }

        // Fallback: use category as description if no explicit description
        return category
    }

    private fun extractDate(input: String): LocalDate? {
        for ((keyword, offset) in DATE_KEYWORDS) {
            if (input.contains(keyword)) {
                return if (offset == 0) {
                    today()
                } else {
                    today().minus(-offset, DateTimeUnit.DAY)
                }
            }
        }
        return null // Will default to today
    }

    private fun calculateConfidence(
        amount: Cents?,
        description: String?,
        category: String?,
        date: LocalDate?,
    ): Float {
        var score = 0f
        if (amount != null) score += 0.4f
        if (description != null) score += 0.2f
        if (category != null) score += 0.2f
        if (date != null) score += 0.1f
        // Base confidence for any parseable input
        score += 0.1f
        return score.coerceIn(0f, 1f)
    }

    private fun today(): LocalDate =
        Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
}
