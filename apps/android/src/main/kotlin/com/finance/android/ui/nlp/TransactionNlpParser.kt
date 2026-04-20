// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.nlp

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime

/**
 * Result of parsing a natural language transaction input (#237).
 *
 * Contains all extracted fields that can be pre-populated into the
 * transaction creation form.
 *
 * @property amount The extracted dollar amount, or null if not found.
 * @property payee The extracted payee/merchant name, or null.
 * @property category The inferred transaction category, or null.
 * @property date The extracted or inferred date, or null.
 * @property type Whether the transaction is an expense or income.
 * @property notes Any remaining text not parsed into other fields.
 * @property confidence Overall confidence in the parse (0.0 to 1.0).
 * @property rawInput The original input text.
 */
data class ParsedTransaction(
    val amount: Double? = null,
    val payee: String? = null,
    val category: String? = null,
    val date: LocalDate? = null,
    val type: TransactionNlpType = TransactionNlpType.EXPENSE,
    val notes: String? = null,
    val confidence: Float = 0f,
    val rawInput: String = "",
)

/**
 * Transaction type inferred from NLP parsing.
 */
enum class TransactionNlpType {
    EXPENSE,
    INCOME,
}

/**
 * Rule-based natural language parser for transaction input (#237).
 *
 * Parses free-form text like "Coffee at Starbucks $4.50 yesterday" into
 * structured [ParsedTransaction] data. Uses regex patterns and keyword
 * matching — no ML model required.
 *
 * ## Supported patterns
 * - Amount: "$12.50", "12.50", "$1,234"
 * - Payee: "at <payee>", "from <payee>", "to <payee>"
 * - Date: "today", "yesterday", "last Monday", "MM/DD", "YYYY-MM-DD"
 * - Category keywords: "coffee" → Dining, "uber" → Transport, etc.
 * - Type: "earned", "received", "salary" → INCOME; everything else → EXPENSE
 *
 * ## Security
 * NEVER logs the raw input or parsed amounts (financial data).
 */
object TransactionNlpParser {

    private val AMOUNT_PATTERN = Regex("""\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)""")
    private val PAYEE_PATTERN = Regex("""(?:at|from|to|@)\s+([A-Za-z][A-Za-z0-9\s'&.-]{0,40})""", RegexOption.IGNORE_CASE)
    private val DATE_ISO_PATTERN = Regex("""\d{4}-\d{2}-\d{2}""")
    private val DATE_SLASH_PATTERN = Regex("""(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?""")

    private val INCOME_KEYWORDS = setOf(
        "earned", "received", "salary", "paycheck", "income", "refund",
        "reimbursement", "bonus", "dividend", "interest earned",
    )

    private val CATEGORY_KEYWORDS = mapOf(
        "coffee" to "Dining",
        "starbucks" to "Dining",
        "lunch" to "Dining",
        "dinner" to "Dining",
        "restaurant" to "Dining",
        "breakfast" to "Dining",
        "food" to "Groceries",
        "grocery" to "Groceries",
        "groceries" to "Groceries",
        "supermarket" to "Groceries",
        "walmart" to "Groceries",
        "target" to "Shopping",
        "amazon" to "Shopping",
        "shopping" to "Shopping",
        "clothes" to "Shopping",
        "uber" to "Transport",
        "lyft" to "Transport",
        "gas" to "Transport",
        "fuel" to "Transport",
        "parking" to "Transport",
        "bus" to "Transport",
        "subway" to "Transport",
        "train" to "Transport",
        "rent" to "Housing",
        "mortgage" to "Housing",
        "electric" to "Utilities",
        "electricity" to "Utilities",
        "water" to "Utilities",
        "internet" to "Utilities",
        "phone" to "Utilities",
        "netflix" to "Entertainment",
        "spotify" to "Entertainment",
        "movie" to "Entertainment",
        "gym" to "Health",
        "pharmacy" to "Health",
        "doctor" to "Health",
        "medical" to "Health",
        "insurance" to "Insurance",
    )

    private val DAY_KEYWORDS = mapOf(
        "today" to 0,
        "yesterday" to 1,
    )

    private val WEEKDAY_MAP = mapOf(
        "monday" to 1, "tuesday" to 2, "wednesday" to 3,
        "thursday" to 4, "friday" to 5, "saturday" to 6, "sunday" to 7,
    )

    /**
     * Parses natural language text into a [ParsedTransaction].
     *
     * @param input The raw text input from the user.
     * @return A [ParsedTransaction] with as many fields extracted as possible.
     */
    fun parse(input: String): ParsedTransaction {
        if (input.isBlank()) return ParsedTransaction(rawInput = input)

        val normalized = input.trim()
        val lower = normalized.lowercase()

        val amount = extractAmount(normalized)
        val payee = extractPayee(normalized)
        val date = extractDate(lower)
        val type = inferType(lower)
        val category = inferCategory(lower)

        val confidenceFactors = listOfNotNull(
            if (amount != null) 0.4f else null,
            if (payee != null) 0.25f else null,
            if (date != null) 0.15f else null,
            if (category != null) 0.1f else null,
            if (type == TransactionNlpType.INCOME) 0.1f else 0.0f,
        )
        val confidence = confidenceFactors.sum().coerceIn(0f, 1f)

        return ParsedTransaction(
            amount = amount,
            payee = payee?.trim(),
            category = category,
            date = date,
            type = type,
            confidence = confidence,
            rawInput = normalized,
        )
    }

    private fun extractAmount(input: String): Double? {
        val match = AMOUNT_PATTERN.find(input) ?: return null
        val raw = match.groupValues[1].replace(",", "")
        return raw.toDoubleOrNull()
    }

    private fun extractPayee(input: String): String? {
        val match = PAYEE_PATTERN.find(input) ?: return null
        val payee = match.groupValues[1].trim()
        // Stop at common prepositions/keywords that aren't part of the name
        val stopWords = setOf("for", "on", "today", "yesterday", "last")
        val words = payee.split("\\s+".toRegex())
        val cleaned = words.takeWhile { it.lowercase() !in stopWords }
        return if (cleaned.isNotEmpty()) cleaned.joinToString(" ") else null
    }

    private fun extractDate(lower: String): LocalDate? {
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date

        // Check "today", "yesterday"
        DAY_KEYWORDS.forEach { (keyword, daysAgo) ->
            if (lower.contains(keyword)) {
                return today.minus(daysAgo, DateTimeUnit.DAY)
            }
        }

        // Check "last <weekday>"
        val lastDayMatch = Regex("""last\s+(\w+)""").find(lower)
        if (lastDayMatch != null) {
            val dayName = lastDayMatch.groupValues[1].lowercase()
            WEEKDAY_MAP[dayName]?.let { targetDayOfWeek ->
                val currentDow = today.dayOfWeek.value // 1=Monday
                val daysBack = ((currentDow - targetDayOfWeek + 7) % 7).let {
                    if (it == 0) 7 else it
                }
                return today.minus(daysBack, DateTimeUnit.DAY)
            }
        }

        // Check ISO date
        DATE_ISO_PATTERN.find(lower)?.let { match ->
            return try {
                LocalDate.parse(match.value)
            } catch (_: Exception) {
                null
            }
        }

        // Check MM/DD or MM/DD/YYYY
        DATE_SLASH_PATTERN.find(lower)?.let { match ->
            val month = match.groupValues[1].toIntOrNull() ?: return@let
            val day = match.groupValues[2].toIntOrNull() ?: return@let
            val yearStr = match.groupValues[3]
            val year = if (yearStr.isBlank()) {
                today.year
            } else {
                val y = yearStr.toIntOrNull() ?: return@let
                if (y < 100) 2000 + y else y
            }
            return try {
                LocalDate(year, month, day)
            } catch (_: Exception) {
                null
            }
        }

        return null
    }

    private fun inferType(lower: String): TransactionNlpType {
        return if (INCOME_KEYWORDS.any { lower.contains(it) }) {
            TransactionNlpType.INCOME
        } else {
            TransactionNlpType.EXPENSE
        }
    }

    private fun inferCategory(lower: String): String? {
        val words = lower.split("\\s+".toRegex())
        // Check multi-word matches first, then single words
        for ((keyword, category) in CATEGORY_KEYWORDS) {
            if (lower.contains(keyword)) {
                return category
            }
        }
        return null
    }
}
