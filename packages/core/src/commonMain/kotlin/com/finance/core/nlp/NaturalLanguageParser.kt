// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.nlp

import com.finance.models.TransactionType
import com.finance.models.types.Cents
import kotlinx.datetime.*
import kotlinx.serialization.Serializable

/**
 * Natural Language Transaction Parser.
 * Parses "Coffee at Starbucks $4.50 yesterday" into structured TransactionInput.
 * Rule-based, pure commonMain, no ML dependencies.
 */
object NaturalLanguageParser {

    private val amountPatterns = listOf(
        Regex("""[${'$'}€£¥]\s?([\d,]+\.?\d{0,2})"""),
        Regex("""([\d,]+\.?\d{0,2})\s?(?:dollars?|usd|eur|gbp)""", RegexOption.IGNORE_CASE),
        Regex("""([\d,]+\.\d{2})"""),
    )

    private val relativeDateKeywords = mapOf("today" to 0, "yesterday" to -1, "day before yesterday" to -2)

    private val dayOfWeekNames = mapOf(
        "monday" to DayOfWeek.MONDAY, "tuesday" to DayOfWeek.TUESDAY, "wednesday" to DayOfWeek.WEDNESDAY,
        "thursday" to DayOfWeek.THURSDAY, "friday" to DayOfWeek.FRIDAY, "saturday" to DayOfWeek.SATURDAY, "sunday" to DayOfWeek.SUNDAY,
    )

    private val monthNames = mapOf(
        "january" to 1, "jan" to 1, "february" to 2, "feb" to 2, "march" to 3, "mar" to 3,
        "april" to 4, "apr" to 4, "may" to 5, "june" to 6, "jun" to 6, "july" to 7, "jul" to 7,
        "august" to 8, "aug" to 8, "september" to 9, "sep" to 9, "sept" to 9,
        "october" to 10, "oct" to 10, "november" to 11, "nov" to 11, "december" to 12, "dec" to 12,
    )

    private val merchantPrepositions = listOf("at", "from", "to", "for")

    private val categoryKeywords: Map<String, String> = mapOf(
        "coffee" to "Food & Drink", "starbucks" to "Food & Drink", "lunch" to "Food & Drink",
        "dinner" to "Food & Drink", "breakfast" to "Food & Drink", "restaurant" to "Food & Drink",
        "grocery" to "Groceries", "groceries" to "Groceries", "supermarket" to "Groceries",
        "uber" to "Transport", "lyft" to "Transport", "taxi" to "Transport", "gas" to "Transport",
        "fuel" to "Transport", "parking" to "Transport", "bus" to "Transport", "train" to "Transport",
        "netflix" to "Entertainment", "spotify" to "Entertainment", "movie" to "Entertainment",
        "rent" to "Housing", "mortgage" to "Housing",
        "electric" to "Utilities", "internet" to "Utilities", "phone" to "Utilities",
        "amazon" to "Shopping", "target" to "Shopping",
        "doctor" to "Health", "pharmacy" to "Health", "gym" to "Health",
        "salary" to "Income", "paycheck" to "Income", "freelance" to "Income", "bonus" to "Income", "refund" to "Income",
    )

    private val incomeKeywords = setOf("income", "salary", "paycheck", "received", "earned", "refund", "bonus", "freelance", "deposit")
    private val expenseKeywords = setOf("spent", "paid", "bought", "purchased", "charged", "cost")

    fun parse(input: String, referenceDate: LocalDate = currentDate()): ParseResult {
        if (input.isBlank()) return ParseResult.Failure("Input is empty")
        val normalised = input.trim()
        val amountResult = extractAmount(normalised) ?: return ParseResult.Failure("Could not extract an amount from: $input")
        val dateResult = extractDate(normalised, referenceDate)
        val merchant = extractMerchant(normalised)
        val categoryHint = inferCategory(normalised)
        val type = inferType(normalised)
        val confidence = computeConfidence(true, dateResult != null, merchant != null, categoryHint != null)
        return ParseResult.Success(TransactionInput(amountResult, dateResult ?: referenceDate, merchant, categoryHint, type, input, confidence))
    }

    internal fun extractAmount(input: String): Cents? {
        for (pattern in amountPatterns) {
            val match = pattern.find(input) ?: continue
            val amountStr = match.groupValues[1].ifEmpty { match.groupValues[0] }.replace(",", "").replace(Regex("[${'$'}€£¥]"), "").trim()
            val amount = amountStr.toDoubleOrNull() ?: continue
            if (amount <= 0.0) continue
            return Cents.fromDollars(amount)
        }
        return null
    }

    internal fun extractDate(input: String, referenceDate: LocalDate): LocalDate? {
        val lower = input.lowercase()
        for ((keyword, offset) in relativeDateKeywords) { if (lower.contains(keyword)) return referenceDate.plus(offset, DateTimeUnit.DAY) }
        val lastDayMatch = Regex("""last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)""").find(lower)
        if (lastDayMatch != null) { val targetDay = dayOfWeekNames[lastDayMatch.groupValues[1]]!!; return findLastDayOfWeek(referenceDate, targetDay) }
        val isoMatch = Regex("""(\d{4})-(\d{2})-(\d{2})""").find(input)
        if (isoMatch != null) { return try { LocalDate(isoMatch.groupValues[1].toInt(), isoMatch.groupValues[2].toInt(), isoMatch.groupValues[3].toInt()) } catch (_: Exception) { null } }
        for ((monthName, monthNum) in monthNames) {
            val monthDayMatch = Regex("""$monthName\s+(\d{1,2})""", RegexOption.IGNORE_CASE).find(input)
            if (monthDayMatch != null) { val day = monthDayMatch.groupValues[1].toIntOrNull() ?: continue; return try { LocalDate(referenceDate.year, monthNum, day) } catch (_: Exception) { null } }
        }
        return null
    }

    internal fun extractMerchant(input: String): String? {
        for (prep in merchantPrepositions) {
            val pattern = Regex("""\b$prep\s+([A-Za-z][A-Za-z0-9\s'&-]{0,30})""", RegexOption.IGNORE_CASE)
            val match = pattern.find(input) ?: continue
            val merchant = match.groupValues[1].trim()
            if (merchant.lowercase() in setOf("today", "yesterday", "the", "a", "an")) continue
            val cleaned = merchant.replace(Regex("""\s*\${'$'}[\d,.]+.*"""), "").replace(Regex("""\s+(today|yesterday|last\s+\w+).*""", RegexOption.IGNORE_CASE), "").trim()
            if (cleaned.isNotBlank()) return cleaned
        }
        return null
    }

    internal fun inferCategory(input: String): String? {
        val lower = input.lowercase()
        for ((keyword, category) in categoryKeywords) { if (lower.contains(keyword)) return category }
        return null
    }

    internal fun inferType(input: String): TransactionType {
        val lower = input.lowercase()
        if (incomeKeywords.any { lower.contains(it) }) return TransactionType.INCOME
        if (expenseKeywords.any { lower.contains(it) }) return TransactionType.EXPENSE
        return TransactionType.EXPENSE
    }

    private fun findLastDayOfWeek(referenceDate: LocalDate, targetDay: DayOfWeek): LocalDate {
        var date = referenceDate.minus(1, DateTimeUnit.DAY)
        while (date.dayOfWeek != targetDay) { date = date.minus(1, DateTimeUnit.DAY) }
        return date
    }

    private fun computeConfidence(hasAmount: Boolean, hasDate: Boolean, hasMerchant: Boolean, hasCategory: Boolean): ParseConfidence {
        val score = listOf(hasAmount, hasDate, hasMerchant, hasCategory).count { it }
        return when { score >= 4 -> ParseConfidence.HIGH; score >= 3 -> ParseConfidence.MEDIUM; score >= 2 -> ParseConfidence.LOW; else -> ParseConfidence.VERY_LOW }
    }

    internal fun currentDate(): LocalDate = Clock.System.now().toLocalDateTime(TimeZone.UTC).date
}

@Serializable
data class TransactionInput(val amount: Cents, val date: LocalDate, val payee: String? = null, val categoryHint: String? = null, val type: TransactionType = TransactionType.EXPENSE, val rawInput: String, val confidence: ParseConfidence)
@Serializable enum class ParseConfidence { HIGH, MEDIUM, LOW, VERY_LOW }
sealed class ParseResult { data class Success(val transaction: TransactionInput) : ParseResult(); data class Failure(val reason: String) : ParseResult() }
