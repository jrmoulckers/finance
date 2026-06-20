// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.receipt.cogs

import com.finance.core.dataimport.ExtractedReceiptLineItem
import com.finance.core.dataimport.ExtractedReceiptText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.roundToInt

/** Confidence bucket for receipt-derived drafts and category suggestions. */
@Serializable
enum class ReceiptConfidenceBand {
    HIGH,
    MEDIUM,
    LOW,
    UNUSABLE,
}

/** Deterministic diagnostics explaining why a receipt draft confidence moved. */
@Serializable
enum class ReceiptConfidenceFlag {
    EMPTY_RECEIPT,
    MISSING_TOTAL,
    MISSING_MERCHANT,
    NO_LINE_ITEMS,
    LOW_OCR_CONFIDENCE,
    AMBIGUOUS_CATEGORY,
    TAX_DETECTED,
    PAYMENT_DETECTED,
    ATTACHMENT_PRESENT,
}

/** Score plus flags used by platforms to decide when to auto-fill vs. review. */
@Serializable
data class ReceiptConfidence(
    val score: Int,
    val band: ReceiptConfidenceBand,
    val flags: Set<ReceiptConfidenceFlag> = emptySet(),
) {
    init {
        require(score in SCORE_RANGE) { "score must be between 0 and 100" }
    }

    companion object {
        private val SCORE_RANGE = 0..100

        fun bandFor(score: Int): ReceiptConfidenceBand = when {
            score >= 85 -> ReceiptConfidenceBand.HIGH
            score >= 60 -> ReceiptConfidenceBand.MEDIUM
            score >= 30 -> ReceiptConfidenceBand.LOW
            else -> ReceiptConfidenceBand.UNUSABLE
        }
    }
}

/** Tax line detected from receipt OCR text. Amounts are integer cents. */
@Serializable
data class ReceiptTaxHint(
    val label: String,
    @SerialName("amount_cents") val amountCents: Long? = null,
    val kind: ReceiptTaxKind = ReceiptTaxKind.TAX,
) {
    init {
        require(label.isNotBlank()) { "label cannot be blank" }
    }
}

@Serializable
enum class ReceiptTaxKind {
    TAX,
    SALES_TAX,
    VAT,
    GST,
    HST,
    PST,
}

/** Payment method hint detected from receipt OCR text. Amounts are integer cents. */
@Serializable
data class ReceiptPaymentHint(
    val label: String,
    val method: ReceiptPaymentMethod = ReceiptPaymentMethod.UNKNOWN,
    @SerialName("amount_cents") val amountCents: Long? = null,
    @SerialName("last_four") val lastFour: String? = null,
) {
    init {
        require(label.isNotBlank()) { "label cannot be blank" }
        require(lastFour == null || lastFour.length == LAST_FOUR_LENGTH) {
            "lastFour must contain exactly four digits"
        }
        require(lastFour == null || lastFour.all { it.isDigit() }) {
            "lastFour must contain only digits"
        }
    }

    private companion object {
        const val LAST_FOUR_LENGTH = 4
    }
}

@Serializable
enum class ReceiptPaymentMethod {
    CASH,
    CARD,
    CREDIT_CARD,
    DEBIT_CARD,
    MOBILE_WALLET,
    GIFT_CARD,
    CHECK,
    UNKNOWN,
}

/** Platform-neutral receipt file metadata; bytes and checksums are supplied by adapters. */
@Serializable
data class ReceiptAttachmentMetadata(
    val filename: String,
    @SerialName("mime_type") val mimeType: String,
    @SerialName("size_bytes") val sizeBytes: Long,
    val checksum: String? = null,
) {
    init {
        require(filename.isNotBlank()) { "filename cannot be blank" }
        require(mimeType.isNotBlank()) { "mimeType cannot be blank" }
        require(sizeBytes >= 0L) { "sizeBytes must be non-negative" }
        require(checksum == null || checksum.isNotBlank()) { "checksum cannot be blank" }
    }
}

/** Business purchase categories inferred from receipt line items. */
@Serializable
enum class ReceiptCogsCategory(val displayName: String) {
    @SerialName("cost_of_goods_sold")
    COST_OF_GOODS_SOLD("Cost of Goods Sold"),
    INVENTORY("Inventory"),
    SUPPLIES("Supplies"),
    UNKNOWN("Unknown"),
}

/** Optional app category IDs used by transaction drafts. */
@Serializable
data class ReceiptCogsCategoryIds(
    @SerialName("cost_of_goods_sold") val costOfGoodsSold: String? = "cogs",
    val inventory: String? = "inventory",
    val supplies: String? = "supplies",
) {
    fun idFor(category: ReceiptCogsCategory): String? = when (category) {
        ReceiptCogsCategory.COST_OF_GOODS_SOLD -> costOfGoodsSold
        ReceiptCogsCategory.INVENTORY -> inventory
        ReceiptCogsCategory.SUPPLIES -> supplies
        ReceiptCogsCategory.UNKNOWN -> null
    }
}

/** Per-line category diagnostic retained for user review and split suggestions. */
@Serializable
data class ReceiptLineItemCategorySuggestion(
    val description: String,
    @SerialName("amount_cents") val amountCents: Long,
    val category: ReceiptCogsCategory,
    @SerialName("matched_keywords") val matchedKeywords: List<String> = emptyList(),
    val confidence: Int,
) {
    init {
        require(description.isNotBlank()) { "description cannot be blank" }
        require(amountCents >= 0L) { "amountCents must be non-negative" }
        require(confidence in SCORE_RANGE) { "confidence must be between 0 and 100" }
    }

    private companion object {
        val SCORE_RANGE = 0..100
    }
}

/** Overall deterministic category suggestion from receipt line items. */
@Serializable
data class ReceiptCategorySuggestion(
    val category: ReceiptCogsCategory,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("matched_amount_cents") val matchedAmountCents: Long = 0L,
    @SerialName("total_line_item_cents") val totalLineItemCents: Long = 0L,
    @SerialName("line_item_count") val lineItemCount: Int = 0,
    @SerialName("matched_line_item_count") val matchedLineItemCount: Int = 0,
    val confidence: Int,
    val reason: String,
) {
    init {
        require(matchedAmountCents >= 0L) { "matchedAmountCents must be non-negative" }
        require(totalLineItemCents >= 0L) { "totalLineItemCents must be non-negative" }
        require(lineItemCount >= 0) { "lineItemCount must be non-negative" }
        require(matchedLineItemCount >= 0) { "matchedLineItemCount must be non-negative" }
        require(confidence in SCORE_RANGE) { "confidence must be between 0 and 100" }
        require(reason.isNotBlank()) { "reason cannot be blank" }
    }

    private companion object {
        val SCORE_RANGE = 0..100
    }
}

/** Transaction draft emitted from a receipt parse. Amounts are integer cents. */
@Serializable
data class ReceiptTransactionDraft(
    val category: String?,
    @SerialName("category_id") val categoryId: String? = null,
    @SerialName("amount_cents") val amountCents: Long,
    val confidence: ReceiptConfidence,
    val merchant: String? = null,
    @SerialName("tax_cents") val taxCents: Long? = null,
    @SerialName("payment_method") val paymentMethod: ReceiptPaymentMethod? = null,
    val attachments: List<ReceiptAttachmentMetadata> = emptyList(),
) {
    init {
        require(amountCents >= 0L) { "amountCents must be non-negative" }
        require(taxCents == null || taxCents >= 0L) { "taxCents must be non-negative" }
    }
}

/** Full additive COGS/attachment analysis layered on the existing parser output. */
@Serializable
data class ReceiptCogsAnalysis(
    val draft: ReceiptTransactionDraft? = null,
    @SerialName("category_suggestion") val categorySuggestion: ReceiptCategorySuggestion,
    @SerialName("line_item_suggestions") val lineItemSuggestions: List<ReceiptLineItemCategorySuggestion>,
    @SerialName("tax_hints") val taxHints: List<ReceiptTaxHint> = emptyList(),
    @SerialName("payment_hints") val paymentHints: List<ReceiptPaymentHint> = emptyList(),
    val confidence: ReceiptConfidence,
    val attachments: List<ReceiptAttachmentMetadata> = emptyList(),
)

/** Additive COGS, tax/payment, confidence, draft, and attachment helpers. */
object ReceiptCogsExtensions {
    /**
     * Deterministic category rules:
     * 1. Classify each line by keyword families for COGS, inventory, supplies.
     * 2. A line matching multiple families is ambiguous and does not vote.
     * 3. The winning category is the highest matched amount, then line count.
     * 4. Exact ties stay UNKNOWN so platforms ask for user review.
     */
    fun suggestCategory(
        lineItems: List<ExtractedReceiptLineItem>,
        categoryIds: ReceiptCogsCategoryIds = ReceiptCogsCategoryIds(),
    ): ReceiptCategorySuggestion {
        val lineSuggestions = suggestLineItemCategories(lineItems)
        val usable = lineSuggestions.filter { it.category != ReceiptCogsCategory.UNKNOWN }
        val totalLineItemCents = lineSuggestions.sumOf { it.amountCents }

        if (lineSuggestions.isEmpty()) {
            return ReceiptCategorySuggestion(
                category = ReceiptCogsCategory.UNKNOWN,
                confidence = 0,
                reason = "No receipt line items were available for COGS classification.",
            )
        }

        if (usable.isEmpty()) {
            return ReceiptCategorySuggestion(
                category = ReceiptCogsCategory.UNKNOWN,
                totalLineItemCents = totalLineItemCents,
                lineItemCount = lineSuggestions.size,
                confidence = 20,
                reason = "No line item matched the documented COGS, inventory, or supplies keywords.",
            )
        }

        val ranked = usable
            .groupBy { it.category }
            .map { (category, matches) ->
                CategoryVote(
                    category = category,
                    amountCents = matches.sumOf { it.amountCents },
                    count = matches.size,
                )
            }
            .sortedWith(
                compareByDescending<CategoryVote> { it.amountCents }
                    .thenByDescending { it.count }
                    .thenBy { it.category.ordinal },
            )

        val winner = ranked.first()
        val tied = ranked.drop(1).any {
            it.amountCents == winner.amountCents && it.count == winner.count
        }
        if (tied) {
            return ReceiptCategorySuggestion(
                category = ReceiptCogsCategory.UNKNOWN,
                matchedAmountCents = winner.amountCents,
                totalLineItemCents = totalLineItemCents,
                lineItemCount = lineSuggestions.size,
                matchedLineItemCount = usable.size,
                confidence = 40,
                reason = "Multiple categories tied by amount and line count; user review is required.",
            )
        }

        val recognisedAmountCents = usable.sumOf { it.amountCents }
        val winnerShare = if (recognisedAmountCents == 0L) {
            0.0
        } else {
            winner.amountCents.toDouble() / recognisedAmountCents.toDouble()
        }
        val confidence = when {
            winnerShare >= 0.90 && usable.size == lineSuggestions.size -> 90
            winnerShare >= 0.70 -> 80
            winnerShare > 0.50 -> 65
            else -> 55
        }

        return ReceiptCategorySuggestion(
            category = winner.category,
            categoryId = categoryIds.idFor(winner.category),
            matchedAmountCents = winner.amountCents,
            totalLineItemCents = totalLineItemCents,
            lineItemCount = lineSuggestions.size,
            matchedLineItemCount = usable.size,
            confidence = confidence,
            reason = "${winner.category.displayName} won by matched line-item amount, then count.",
        )
    }

    fun suggestLineItemCategories(
        lineItems: List<ExtractedReceiptLineItem>,
    ): List<ReceiptLineItemCategorySuggestion> = lineItems
        .filter { it.description.isNotBlank() && it.total.amount >= 0L }
        .map { item -> classifyLineItem(item.description, item.total.amount) }

    fun analyzeReceipt(
        receipt: ExtractedReceiptText,
        attachments: List<ReceiptAttachmentMetadata> = emptyList(),
        categoryIds: ReceiptCogsCategoryIds = ReceiptCogsCategoryIds(),
    ): ReceiptCogsAnalysis {
        val lineSuggestions = suggestLineItemCategories(receipt.lineItems)
        val categorySuggestion = suggestCategory(receipt.lineItems, categoryIds)
        val taxHints = extractTaxHints(receipt.rawText)
        val paymentHints = extractPaymentHints(receipt.rawText)
        val confidence = scoreConfidence(
            receipt = receipt,
            categorySuggestion = categorySuggestion,
            taxHints = taxHints,
            paymentHints = paymentHints,
            attachments = attachments,
        )
        val draft = buildTransactionDraft(
            receipt = receipt,
            categorySuggestion = categorySuggestion,
            taxHints = taxHints,
            paymentHints = paymentHints,
            confidence = confidence,
            attachments = attachments,
        )

        return ReceiptCogsAnalysis(
            draft = draft,
            categorySuggestion = categorySuggestion,
            lineItemSuggestions = lineSuggestions,
            taxHints = taxHints,
            paymentHints = paymentHints,
            confidence = confidence,
            attachments = attachments,
        )
    }

    fun buildTransactionDraft(
        receipt: ExtractedReceiptText,
        attachments: List<ReceiptAttachmentMetadata> = emptyList(),
        categoryIds: ReceiptCogsCategoryIds = ReceiptCogsCategoryIds(),
    ): ReceiptTransactionDraft? {
        val categorySuggestion = suggestCategory(receipt.lineItems, categoryIds)
        val taxHints = extractTaxHints(receipt.rawText)
        val paymentHints = extractPaymentHints(receipt.rawText)
        val confidence = scoreConfidence(receipt, categorySuggestion, taxHints, paymentHints, attachments)
        return buildTransactionDraft(
            receipt = receipt,
            categorySuggestion = categorySuggestion,
            taxHints = taxHints,
            paymentHints = paymentHints,
            confidence = confidence,
            attachments = attachments,
        )
    }

    fun extractTaxHints(rawText: String): List<ReceiptTaxHint> = normaliseLines(rawText)
        .filter { taxLineRegex.containsMatchIn(it) }
        .map { line ->
            ReceiptTaxHint(
                label = line,
                amountCents = parseMoneyCents(line),
                kind = taxKindFor(line),
            )
        }

    fun extractPaymentHints(rawText: String): List<ReceiptPaymentHint> = normaliseLines(rawText)
        .filter { paymentLineRegex.containsMatchIn(it) }
        .map { line ->
            ReceiptPaymentHint(
                label = line,
                method = paymentMethodFor(line),
                amountCents = parseMoneyCents(line),
                lastFour = lastFourRegex.find(line)?.groupValues?.getOrNull(1),
            )
        }

    fun scoreConfidence(
        receipt: ExtractedReceiptText,
        categorySuggestion: ReceiptCategorySuggestion,
        taxHints: List<ReceiptTaxHint> = extractTaxHints(receipt.rawText),
        paymentHints: List<ReceiptPaymentHint> = extractPaymentHints(receipt.rawText),
        attachments: List<ReceiptAttachmentMetadata> = emptyList(),
    ): ReceiptConfidence {
        val flags = linkedSetOf<ReceiptConfidenceFlag>()
        if (receipt.rawText.isBlank()) flags += ReceiptConfidenceFlag.EMPTY_RECEIPT
        if (receipt.total == null) flags += ReceiptConfidenceFlag.MISSING_TOTAL
        if (receipt.merchant == null) flags += ReceiptConfidenceFlag.MISSING_MERCHANT
        if (receipt.lineItems.isEmpty()) flags += ReceiptConfidenceFlag.NO_LINE_ITEMS
        if (receipt.confidence < LOW_OCR_CONFIDENCE) flags += ReceiptConfidenceFlag.LOW_OCR_CONFIDENCE
        if (categorySuggestion.category == ReceiptCogsCategory.UNKNOWN || categorySuggestion.confidence < 60) {
            flags += ReceiptConfidenceFlag.AMBIGUOUS_CATEGORY
        }
        if (taxHints.isNotEmpty()) flags += ReceiptConfidenceFlag.TAX_DETECTED
        if (paymentHints.isNotEmpty()) flags += ReceiptConfidenceFlag.PAYMENT_DETECTED
        if (attachments.isNotEmpty()) flags += ReceiptConfidenceFlag.ATTACHMENT_PRESENT

        if (ReceiptConfidenceFlag.EMPTY_RECEIPT in flags) {
            return ReceiptConfidence(0, ReceiptConfidenceBand.UNUSABLE, flags)
        }

        var score = receipt.confidence.roundToInt().coerceIn(0, 100)
        if (ReceiptConfidenceFlag.MISSING_TOTAL in flags) score -= 25
        if (ReceiptConfidenceFlag.MISSING_MERCHANT in flags) score -= 15
        if (ReceiptConfidenceFlag.NO_LINE_ITEMS in flags) score -= 15
        if (ReceiptConfidenceFlag.AMBIGUOUS_CATEGORY in flags) score -= 10
        if (ReceiptConfidenceFlag.TAX_DETECTED in flags) score += 3
        if (ReceiptConfidenceFlag.PAYMENT_DETECTED in flags) score += 3
        if (ReceiptConfidenceFlag.ATTACHMENT_PRESENT in flags) score += 2
        val normalised = score.coerceIn(0, 100)

        return ReceiptConfidence(
            score = normalised,
            band = ReceiptConfidence.bandFor(normalised),
            flags = flags,
        )
    }

    private fun buildTransactionDraft(
        receipt: ExtractedReceiptText,
        categorySuggestion: ReceiptCategorySuggestion,
        taxHints: List<ReceiptTaxHint>,
        paymentHints: List<ReceiptPaymentHint>,
        confidence: ReceiptConfidence,
        attachments: List<ReceiptAttachmentMetadata>,
    ): ReceiptTransactionDraft? {
        val amountCents = receipt.total?.amount ?: receipt.lineItems.sumOf { it.total.amount }
        if (amountCents <= 0L) return null

        val category = categorySuggestion.category.takeUnless { it == ReceiptCogsCategory.UNKNOWN }
        return ReceiptTransactionDraft(
            category = category?.displayName,
            categoryId = categorySuggestion.categoryId,
            amountCents = amountCents,
            confidence = confidence,
            merchant = receipt.merchant,
            taxCents = taxHints.mapNotNull { it.amountCents }.takeIf { it.isNotEmpty() }?.sum(),
            paymentMethod = paymentHints.firstOrNull()?.method,
            attachments = attachments,
        )
    }

    private fun classifyLineItem(description: String, amountCents: Long): ReceiptLineItemCategorySuggestion {
        val matches = keywordFamilies.mapValues { (_, keywords) ->
            keywords.filter { keyword -> description.containsKeyword(keyword) }
        }.filterValues { it.isNotEmpty() }

        val category = if (matches.size == 1) matches.keys.first() else ReceiptCogsCategory.UNKNOWN
        val matchedKeywords = matches.values.flatten().distinct().sorted()
        val confidence = when {
            matches.isEmpty() -> 0
            matches.size == 1 && matchedKeywords.size >= 2 -> 90
            matches.size == 1 -> 80
            else -> 40
        }

        return ReceiptLineItemCategorySuggestion(
            description = description,
            amountCents = amountCents,
            category = category,
            matchedKeywords = matchedKeywords,
            confidence = confidence,
        )
    }

    private fun String.containsKeyword(keyword: String): Boolean {
        val pattern = Regex("""(?i)(^|[^a-z0-9])${Regex.escape(keyword)}([^a-z0-9]|$)""")
        return pattern.containsMatchIn(this)
    }

    private fun normaliseLines(rawText: String): List<String> = rawText
        .lineSequence()
        .map { it.trim().replace(Regex("""\s+"""), " ") }
        .filter { it.isNotBlank() }
        .toList()

    private fun parseMoneyCents(text: String): Long? {
        val amountText = amountRegex.findAll(text).lastOrNull()?.value ?: return null
        val normalised = amountText
            .replace(Regex("""[^\d.,-]"""), "")
            .replace(",", "")
            .trim()
        val negative = normalised.startsWith("-")
        val unsigned = normalised.removePrefix("-")
        val parts = unsigned.split('.')
        if (parts.size != 2 || parts[1].length != CENT_DIGITS) return null

        val dollars = parts[0].toLongOrNull() ?: return null
        val cents = parts[1].toLongOrNull() ?: return null
        val amount = dollars * CENTS_PER_DOLLAR + cents
        return if (negative) -amount else amount
    }

    private fun taxKindFor(line: String): ReceiptTaxKind = when {
        line.contains("sales tax", ignoreCase = true) -> ReceiptTaxKind.SALES_TAX
        line.contains("vat", ignoreCase = true) -> ReceiptTaxKind.VAT
        line.contains("gst", ignoreCase = true) -> ReceiptTaxKind.GST
        line.contains("hst", ignoreCase = true) -> ReceiptTaxKind.HST
        line.contains("pst", ignoreCase = true) -> ReceiptTaxKind.PST
        else -> ReceiptTaxKind.TAX
    }

    private fun paymentMethodFor(line: String): ReceiptPaymentMethod = when {
        line.contains("apple pay", ignoreCase = true) ||
            line.contains("google pay", ignoreCase = true) ||
            line.contains("wallet", ignoreCase = true) -> ReceiptPaymentMethod.MOBILE_WALLET
        line.contains("debit", ignoreCase = true) -> ReceiptPaymentMethod.DEBIT_CARD
        line.contains("credit", ignoreCase = true) -> ReceiptPaymentMethod.CREDIT_CARD
        line.contains("visa", ignoreCase = true) ||
            line.contains("mastercard", ignoreCase = true) ||
            line.contains("amex", ignoreCase = true) ||
            line.contains("card", ignoreCase = true) -> ReceiptPaymentMethod.CARD
        line.contains("cash", ignoreCase = true) -> ReceiptPaymentMethod.CASH
        line.contains("gift", ignoreCase = true) -> ReceiptPaymentMethod.GIFT_CARD
        line.contains("check", ignoreCase = true) || line.contains("cheque", ignoreCase = true) -> ReceiptPaymentMethod.CHECK
        else -> ReceiptPaymentMethod.UNKNOWN
    }

    private data class CategoryVote(
        val category: ReceiptCogsCategory,
        val amountCents: Long,
        val count: Int,
    )

    private val keywordFamilies: Map<ReceiptCogsCategory, List<String>> = mapOf(
        ReceiptCogsCategory.COST_OF_GOODS_SOLD to listOf(
            "ingredient",
            "ingredients",
            "raw material",
            "material",
            "materials",
            "packaging",
            "label",
            "labels",
            "box",
            "boxes",
            "bag",
            "bags",
            "container",
            "containers",
            "flour",
            "sugar",
            "beans",
            "oil",
            "meat",
            "produce",
            "wholesale food",
        ),
        ReceiptCogsCategory.INVENTORY to listOf(
            "inventory",
            "stock",
            "resale",
            "resell",
            "merchandise",
            "sku",
            "product",
            "products",
            "unit",
            "units",
            "carton",
            "case",
            "wholesale goods",
            "retail goods",
        ),
        ReceiptCogsCategory.SUPPLIES to listOf(
            "supply",
            "supplies",
            "office",
            "paper",
            "printer",
            "toner",
            "ink",
            "pen",
            "pens",
            "cleaner",
            "cleaning",
            "soap",
            "gloves",
            "trash",
            "tape",
            "envelope",
            "envelopes",
            "towel",
            "towels",
            "receipt paper",
        ),
    )

    private val amountRegex = Regex("""(?<!\d)[$€£¥]?\s*-?\d{1,6}(?:,\d{3})*\.\d{2}\b""")
    private val taxLineRegex = Regex("""(?i)\b(sales\s+tax|tax|vat|gst|hst|pst)\b""")
    private val paymentLineRegex = Regex(
        """(?i)\b(cash|card|credit|debit|visa|mastercard|amex|apple\s+pay|google\s+pay|wallet|gift|check|cheque)\b""",
    )
    private val lastFourRegex = Regex("""(?:\*{2,}|x{2,}|ending\s+in|last\s+4\D*)(\d{4})\b""", RegexOption.IGNORE_CASE)

    private const val LOW_OCR_CONFIDENCE = 60.0
    private const val CENTS_PER_DOLLAR = 100L
    private const val CENT_DIGITS = 2
}

/** Convenience extension that leaves the existing parser contracts untouched. */
fun ExtractedReceiptText.analyzeCogsReceipt(
    attachments: List<ReceiptAttachmentMetadata> = emptyList(),
    categoryIds: ReceiptCogsCategoryIds = ReceiptCogsCategoryIds(),
): ReceiptCogsAnalysis = ReceiptCogsExtensions.analyzeReceipt(this, attachments, categoryIds)

/** Convenience extension for platforms that only need the transaction draft. */
fun ExtractedReceiptText.toCogsTransactionDraft(
    attachments: List<ReceiptAttachmentMetadata> = emptyList(),
    categoryIds: ReceiptCogsCategoryIds = ReceiptCogsCategoryIds(),
): ReceiptTransactionDraft? = ReceiptCogsExtensions.buildTransactionDraft(this, attachments, categoryIds)
