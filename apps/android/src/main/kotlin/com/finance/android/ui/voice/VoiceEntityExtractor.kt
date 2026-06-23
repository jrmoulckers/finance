// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.voice

/**
 * Raw entities extracted from a spoken utterance, before field resolution (#2383).
 *
 * This is the decoupling seam between *how* entities are detected (rules today,
 * ML Kit entity extraction later) and *how* they are mapped to a transaction
 * draft by [LocalUtteranceParser]. Swapping the extractor never changes the
 * review/confirmation flow.
 *
 * @property amountsMinor Distinct monetary amounts found, in minor units (cents).
 * @property currencyCode Spoken currency (ISO-4217) or null when unspecified.
 * @property merchantCandidates Distinct merchant/payee spans, in spoken order.
 * @property accountCandidates Distinct account spans (e.g. "checking", "visa").
 * @property categoryHints Inferred category names, most specific first.
 * @property isIncome True when the phrasing implies incoming money.
 * @property note Free-form memo span, or null.
 */
data class VoiceEntities(
    val amountsMinor: List<Long> = emptyList(),
    val currencyCode: String? = null,
    val merchantCandidates: List<String> = emptyList(),
    val accountCandidates: List<String> = emptyList(),
    val categoryHints: List<String> = emptyList(),
    val isIncome: Boolean = false,
    val note: String? = null,
)

/**
 * Extracts candidate entities from a raw speech transcript (#2383).
 *
 * Implementations MUST be deterministic and run fully on-device so drafting
 * works offline. The default [RuleBasedVoiceEntityExtractor] uses regex and
 * keyword matching; an ML Kit entity-extraction implementation can be dropped
 * in behind this same interface without touching the parser or UI.
 */
fun interface VoiceEntityExtractor {
    /**
     * @param utterance Raw transcript. Never logged — treat as financial content.
     * @return Candidate entities for [LocalUtteranceParser] to resolve.
     */
    fun extract(utterance: String): VoiceEntities
}

/**
 * Deterministic, fully-offline rule-based entity extractor (#2383).
 *
 * Supported phrasings:
 * - Amount: "$4.50", "4.50", "4 dollars 50 cents", "12 bucks", "twenty dollars".
 * - Merchant: "at <name>", "from <name>", "to <name>".
 * - Account: "with/using/on/from my <account>" against a known account vocabulary.
 * - Category: keyword inference (e.g. "coffee" → Dining, "uber" → Transport).
 * - Note: "note <text>", "memo <text>".
 * - Direction: income keywords ("received", "salary", "refund") imply INCOME.
 *
 * ## Security
 * Never logs the transcript, amounts, or any extracted span.
 */
class RuleBasedVoiceEntityExtractor : VoiceEntityExtractor {

    override fun extract(utterance: String): VoiceEntities {
        if (utterance.isBlank()) return VoiceEntities()

        val normalized = utterance.trim()
        val lower = normalized.lowercase()

        val amounts = extractAmounts(lower)
        val merchants = extractMerchants(normalized)
        val accounts = extractAccounts(lower)
        val categories = inferCategories(lower)
        val income = INCOME_KEYWORDS.any { lower.contains(it) }
        val note = extractNote(normalized)

        return VoiceEntities(
            amountsMinor = amounts,
            currencyCode = detectCurrency(lower),
            merchantCandidates = merchants,
            accountCandidates = accounts,
            categoryHints = categories,
            isIncome = income,
            note = note,
        )
    }

    // ── Amounts ──────────────────────────────────────────────────────────

    private fun extractAmounts(lower: String): List<Long> {
        val results = LinkedHashSet<Long>()
        var working = lower

        // "4 dollars 50 cents" / "4 dollars and 50 cents" — consume the whole span
        // first so the inner numbers aren't re-counted by the patterns below.
        DOLLARS_CENTS_PATTERN.findAll(lower).forEach { m ->
            val dollars = m.groupValues[1].toLongOrNull() ?: return@forEach
            val cents = m.groupValues[2].toLongOrNull() ?: 0L
            results.add(dollars * 100 + cents.coerceIn(0, 99))
        }
        working = DOLLARS_CENTS_PATTERN.replace(working, " ")

        // Currency-signalled amounts: "$4.50", "$1,234", "12 dollars", "12 bucks".
        SIGNALLED_AMOUNT_PATTERN.findAll(working).forEach { m ->
            val raw = (m.groupValues[1].ifBlank { m.groupValues[2] }).replace(",", "")
            toMinorUnits(raw)?.let { results.add(it) }
        }

        // Bare decimals are unambiguous money even without a currency word: "4.50".
        DECIMAL_AMOUNT_PATTERN.findAll(working).forEach { m ->
            toMinorUnits(m.groupValues[1])?.let { results.add(it) }
        }

        // Spelled-out small amounts: "twenty dollars", "five bucks".
        WORD_AMOUNT_PATTERN.findAll(working).forEach { m ->
            NUMBER_WORDS[m.groupValues[1]]?.let { results.add(it * 100) }
        }

        return results.toList()
    }

    private fun toMinorUnits(raw: String): Long? {
        if (raw.isBlank()) return null
        val parts = raw.split(".")
        val whole = parts[0].toLongOrNull() ?: return null
        val fraction = if (parts.size > 1) {
            parts[1].padEnd(2, '0').take(2).toLongOrNull() ?: 0L
        } else {
            0L
        }
        return whole * 100 + fraction
    }

    private fun detectCurrency(lower: String): String? = when {
        lower.contains("dollar") || lower.contains("buck") || lower.contains("$") -> "USD"
        lower.contains("euro") || lower.contains("€") -> "EUR"
        lower.contains("pound") || lower.contains("£") -> "GBP"
        else -> null
    }

    // ── Merchants ────────────────────────────────────────────────────────

    private fun extractMerchants(input: String): List<String> {
        val results = LinkedHashSet<String>()
        MERCHANT_PATTERN.findAll(input).forEach { m ->
            val cleaned = cleanSpan(m.groupValues[2])
            if (cleaned.isNotBlank()) results.add(cleaned)
        }
        return results.toList()
    }

    private fun cleanSpan(span: String): String {
        val words = span.trim().split(WHITESPACE)
        val afterLeading = words.dropWhile { normalizeWord(it) in LEADING_STOP_WORDS }
        val kept = afterLeading.takeWhile { isMerchantToken(normalizeWord(it)) }
        return kept.joinToString(" ").trim().trimEnd('.', ',')
    }

    private fun isMerchantToken(normalized: String): Boolean {
        if (normalized.isEmpty()) return false
        if (normalized in TRAILING_STOP_WORDS) return false
        if (normalized in CURRENCY_WORDS) return false
        if (normalized in NUMBER_WORDS) return false
        return !NUMERIC_TOKEN.matches(normalized)
    }

    private fun normalizeWord(word: String): String = word.lowercase().trim('.', ',')

    // ── Accounts ─────────────────────────────────────────────────────────

    private fun extractAccounts(lower: String): List<String> {
        val results = LinkedHashSet<String>()
        ACCOUNT_KEYWORDS.forEach { keyword ->
            if (Regex("""\b${Regex.escape(keyword)}\b""").containsMatchIn(lower)) {
                results.add(keyword.replaceFirstChar { it.uppercase() })
            }
        }
        return results.toList()
    }

    // ── Categories ───────────────────────────────────────────────────────

    private fun inferCategories(lower: String): List<String> {
        val results = LinkedHashSet<String>()
        CATEGORY_KEYWORDS.forEach { (keyword, category) ->
            if (lower.contains(keyword)) results.add(category)
        }
        return results.toList()
    }

    // ── Note ─────────────────────────────────────────────────────────────

    private fun extractNote(input: String): String? {
        val match = NOTE_PATTERN.find(input) ?: return null
        val note = match.groupValues[1].trim().trimEnd('.', ',')
        return note.ifBlank { null }
    }

    private companion object {
        val WHITESPACE = "\\s+".toRegex()

        val DOLLARS_CENTS_PATTERN =
            Regex("""(\d+)\s+dollars?(?:\s+and)?\s+(\d{1,2})\s+cents?""")
        val SIGNALLED_AMOUNT_PATTERN =
            Regex("""(?:[\$€£]\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?))|(?:(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s?(?:dollars?|bucks?|euros?|pounds?))""")
        val DECIMAL_AMOUNT_PATTERN =
            Regex("""(?<![\d.])(\d+\.\d{1,2})(?![\d])""")
        val WORD_AMOUNT_PATTERN =
            Regex("""\b([a-z]+)\b\s+(?:dollars?|bucks?)""")
        val MERCHANT_PATTERN =
            Regex("""(?:^|\s)(at|from|to)\s+([A-Za-z][A-Za-z0-9\s'&.-]{0,40})""", RegexOption.IGNORE_CASE)
        val NOTE_PATTERN =
            Regex("""(?:note|memo)\s+([A-Za-z0-9][A-Za-z0-9\s'&.,-]{0,60})""", RegexOption.IGNORE_CASE)

        val NUMBER_WORDS = mapOf(
            "one" to 1L, "two" to 2L, "three" to 3L, "four" to 4L, "five" to 5L,
            "six" to 6L, "seven" to 7L, "eight" to 8L, "nine" to 9L, "ten" to 10L,
            "eleven" to 11L, "twelve" to 12L, "thirteen" to 13L, "fourteen" to 14L,
            "fifteen" to 15L, "sixteen" to 16L, "seventeen" to 17L, "eighteen" to 18L,
            "nineteen" to 19L, "twenty" to 20L, "thirty" to 30L, "forty" to 40L,
            "fifty" to 50L, "sixty" to 60L, "seventy" to 70L, "eighty" to 80L,
            "ninety" to 90L, "hundred" to 100L,
        )

        val INCOME_KEYWORDS = setOf(
            "received", "salary", "paycheck", "income", "refund",
            "reimbursement", "bonus", "dividend", "got paid", "deposited",
        )

        val ACCOUNT_KEYWORDS = listOf(
            "cash", "checking", "savings", "credit card", "debit card",
            "visa", "mastercard", "amex", "paypal", "venmo",
        )

        val LEADING_STOP_WORDS = setOf("the", "a", "an", "my")

        val NUMERIC_TOKEN = Regex("""[\$€£]?\d[\d,.]*""")

        val CURRENCY_WORDS = setOf(
            "dollar", "dollars", "buck", "bucks", "cent", "cents",
            "euro", "euros", "pound", "pounds",
        )

        val TRAILING_STOP_WORDS = setOf(
            "for", "on", "with", "using", "today", "yesterday", "tomorrow",
            "note", "memo", "and", "in", "from", "at", "to",
        )

        val CATEGORY_KEYWORDS = linkedMapOf(
            "coffee" to "Dining",
            "starbucks" to "Dining",
            "lunch" to "Dining",
            "dinner" to "Dining",
            "breakfast" to "Dining",
            "restaurant" to "Dining",
            "grocery" to "Groceries",
            "groceries" to "Groceries",
            "supermarket" to "Groceries",
            "uber" to "Transport",
            "lyft" to "Transport",
            "gas" to "Transport",
            "fuel" to "Transport",
            "parking" to "Transport",
            "bus" to "Transport",
            "train" to "Transport",
            "rent" to "Housing",
            "mortgage" to "Housing",
            "electric" to "Utilities",
            "water" to "Utilities",
            "internet" to "Utilities",
            "phone" to "Utilities",
            "netflix" to "Entertainment",
            "spotify" to "Entertainment",
            "movie" to "Entertainment",
            "gym" to "Health",
            "pharmacy" to "Health",
            "doctor" to "Health",
            "amazon" to "Shopping",
            "target" to "Shopping",
            "clothes" to "Shopping",
        )
    }
}
