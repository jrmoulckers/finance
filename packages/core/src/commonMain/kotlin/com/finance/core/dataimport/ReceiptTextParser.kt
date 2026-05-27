// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.datetime.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Standard receipt OCR output shared by every platform adapter.
 *
 * Platform OCR stays on device and provides raw recognised text to
 * [parseReceiptText]. The parser normalises merchant, date, total, and line
 * items without network access.
 */
@Serializable
data class ExtractedReceiptText(
    val merchant: String? = null,
    val date: LocalDate? = null,
    val total: Cents? = null,
    val currency: Currency? = null,
    @SerialName("line_items") val lineItems: List<ExtractedReceiptLineItem> = emptyList(),
    @SerialName("raw_text") val rawText: String,
    val confidence: Double,
) {
    /** Whether the extraction can pre-populate the quick-entry sheet. */
    val isUsable: Boolean get() = merchant != null && total != null
}

/** A parsed receipt line item with an optional rule-based category proposal. */
@Serializable
data class ExtractedReceiptLineItem(
    val description: String,
    val total: Cents,
    val quantity: Double? = null,
    @SerialName("suggested_category") val suggestedCategory: String? = null,
    @SerialName("suggested_category_id") val suggestedCategoryId: String? = null,
    @SerialName("category_accepted") val categoryAccepted: Boolean = false,
)

/** Rule-based receipt OCR parser reused by native platform adapters. */
object ReceiptTextParser {
    private val totalLabel = Regex("""(?i)\b(total|amount\s+due|balance\s+due|grand\s+total)\b""")
    private val subtotalOrTax = Regex("""(?i)\b(sub\s*-?\s*total|tax|tip|change|cash|card)\b""")
    private val amountAtEnd = Regex("""(?<!\d)([$€£¥]?\s*-?\d{1,4}(?:,\d{3})*\.\d{2})\s*$""")
    private val datePatterns = listOf(
        Regex("""\b(\d{4})-(\d{1,2})-(\d{1,2})\b"""),
        Regex("""\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b"""),
    )

    /**
     * Parses OCR text into the shared receipt contract.
     *
     * @param rawText OCR text produced on device.
     * @param ocrConfidence Optional OCR engine confidence in `[0.0, 1.0]` or
     *   `[0.0, 100.0]`; omitted values are estimated from parsed fields.
     * @param appCategories Optional existing app categories used to map
     *   rule-based category names to category IDs for split suggestions.
     */
    fun parseReceiptText(
        rawText: String,
        ocrConfidence: Double? = null,
        appCategories: List<CategoryMapper.AppCategory> = emptyList(),
    ): ExtractedReceiptText {
        val lines = normaliseLines(rawText)
        val merchant = extractMerchant(lines)
        val date = extractDate(rawText)
        val currency = extractCurrency(rawText)
        val total = extractTotal(lines)
        val lineItems = extractLineItems(lines, appCategories, total)
        val confidence = normaliseConfidence(ocrConfidence) ?: estimateConfidence(
            merchant = merchant,
            date = date,
            total = total,
            lineItems = lineItems,
        )

        return ExtractedReceiptText(
            merchant = merchant,
            date = date,
            total = total,
            currency = currency,
            lineItems = lineItems,
            rawText = rawText,
            confidence = confidence,
        )
    }

    private fun normaliseLines(rawText: String): List<String> = rawText
        .lineSequence()
        .map { it.trim().replace(Regex("""\s+"""), " ") }
        .filter { it.isNotBlank() }
        .toList()

    private fun extractMerchant(lines: List<String>): String? = lines
        .firstOrNull { line ->
            !totalLabel.containsMatchIn(line) &&
                !subtotalOrTax.containsMatchIn(line) &&
                parseAmount(line) == null &&
                extractDate(line) == null
        }
        ?.take(MAX_MERCHANT_LENGTH)

    private fun extractTotal(lines: List<String>): Cents? {
        val labelled = lines.asReversed().firstNotNullOfOrNull { line ->
            if (totalLabel.containsMatchIn(line)) parseAmount(line) else null
        }
        if (labelled != null) return labelled

        return lines.mapNotNull(::parseAmount).maxByOrNull { it.amount }
    }

    private fun extractLineItems(
        lines: List<String>,
        appCategories: List<CategoryMapper.AppCategory>,
        receiptTotal: Cents?,
    ): List<ExtractedReceiptLineItem> = lines.mapNotNull { line ->
        val match = amountAtEnd.find(line) ?: return@mapNotNull null
        if (totalLabel.containsMatchIn(line) || subtotalOrTax.containsMatchIn(line)) return@mapNotNull null

        val description = line.substring(0, match.range.first).trim(' ', '.', '-')
        val amount = parseAmount(match.value) ?: return@mapNotNull null
        if (description.length < MIN_DESCRIPTION_LENGTH || amount == receiptTotal) return@mapNotNull null

        val categoryName = ReceiptCategoryRules.suggestCategoryName(description)
        val categoryMatch = categoryName?.let {
            CategoryMapper.map(listOf(it), appCategories).mappings.firstOrNull()
        }

        ExtractedReceiptLineItem(
            description = description,
            total = amount,
            quantity = extractQuantity(description),
            suggestedCategory = categoryName,
            suggestedCategoryId = categoryMatch?.targetCategoryId,
        )
    }

    private fun extractQuantity(description: String): Double? {
        val match = Regex("""(?i)\b(\d+(?:\.\d+)?)\s*(x|qty|ct)\b""").find(description)
        return match?.groupValues?.getOrNull(1)?.toDoubleOrNull()
    }

    private fun extractDate(text: String): LocalDate? {
        for (pattern in datePatterns) {
            val match = pattern.find(text) ?: continue
            val groups = match.groupValues
            val parts = if (groups[1].length == 4) {
                Triple(groups[1].toInt(), groups[2].toInt(), groups[3].toInt())
            } else {
                val year = groups[3].toInt().let { if (it < 100) 2000 + it else it }
                Triple(year, groups[1].toInt(), groups[2].toInt())
            }
            runCatching { return LocalDate(parts.first, parts.second, parts.third) }
        }
        return null
    }

    private fun extractCurrency(text: String): Currency? = when {
        text.contains("€") -> Currency.EUR
        text.contains("£") -> Currency.GBP
        text.contains("¥") -> Currency.JPY
        text.contains("$", ignoreCase = false) -> Currency.USD
        else -> null
    }

    private fun parseAmount(text: String): Cents? {
        val amountText = amountAtEnd.find(text)?.value ?: text
        val normalised = amountText
            .replace(Regex("""[^\d.,-]"""), "")
            .replace(",", "")
            .trim()
        if (!normalised.contains('.')) return null
        val value = normalised.toDoubleOrNull() ?: return null
        return Cents.fromDollars(value).abs()
    }

    private fun normaliseConfidence(confidence: Double?): Double? = confidence?.let {
        val percent = if (it <= 1.0) it * 100.0 else it
        percent.coerceIn(0.0, 100.0)
    }

    private fun estimateConfidence(
        merchant: String?,
        date: LocalDate?,
        total: Cents?,
        lineItems: List<ExtractedReceiptLineItem>,
    ): Double {
        var score = 0.0
        if (merchant != null) score += 30.0
        if (date != null) score += 20.0
        if (total != null) score += 30.0
        if (lineItems.isNotEmpty()) score += 20.0
        return score
    }

    private const val MAX_MERCHANT_LENGTH = 80
    private const val MIN_DESCRIPTION_LENGTH = 2
}

/** Category rules shared by receipt itemized split UX. */
object ReceiptCategoryRules {
    private val rules = listOf(
        "Groceries" to listOf("apple", "banana", "milk", "bread", "grocery", "produce", "eggs"),
        "Restaurants" to listOf("burger", "coffee", "latte", "pizza", "sandwich", "taco"),
        "Transportation" to listOf("fuel", "gas", "diesel", "parking", "transit"),
        "Household" to listOf("soap", "detergent", "paper", "towel", "cleaner"),
        "Healthcare" to listOf("pharmacy", "medicine", "rx", "vitamin"),
        "Shopping" to listOf("shirt", "book", "toy", "electronics", "home"),
    )

    /** Returns a human category name for a merchant or item description. */
    fun suggestCategoryName(text: String): String? {
        val normalised = text.lowercase()
        return rules.firstOrNull { (_, keywords) ->
            keywords.any { keyword -> normalised.contains(keyword) }
        }?.first
    }
}

/** Parses OCR text into the shared receipt contract. */
fun parseReceiptText(
    rawText: String,
    ocrConfidence: Double? = null,
    appCategories: List<CategoryMapper.AppCategory> = emptyList(),
): ExtractedReceiptText = ReceiptTextParser.parseReceiptText(rawText, ocrConfidence, appCategories)
