// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.expensesplit

import kotlin.math.roundToInt

const val BUSINESS_EXPENSE_TAG = "business-expense"

object BusinessExpenseFields {
    const val CATEGORY = "businessExpenseCategory"
    const val BUSINESS_USE_PERCENT = "businessExpensePercent"
    const val DEDUCTIBLE_PERCENT = "businessExpenseDeductionPercent"
    const val NOTE = "businessExpenseNote"
    const val SOURCE = "businessExpenseSource"
    const val TAGGED_AT = "businessExpenseTaggedAt"
}

/** KMP port of apps/web/src/lib/mileage/expenseRules.ts business expense rules. */
object BusinessExpenseRules {
    private val rules = linkedMapOf(
        ExpenseCategory.TRAVEL to ExpenseCategoryRule(
            label = "Travel",
            deductiblePercent = 100,
            keywords = listOf("travel", "hotel", "airfare", "flight", "parking", "toll", "uber", "lyft"),
            description = "Business trips, lodging, parking, tolls, and other travel costs.",
        ),
        ExpenseCategory.MEALS to ExpenseCategoryRule(
            label = "Meals (50%)",
            deductiblePercent = 50,
            keywords = listOf("meal", "restaurant", "coffee", "lunch", "dinner", "catering", "cafe"),
            description = "Business meals are typically only 50% deductible.",
        ),
        ExpenseCategory.EQUIPMENT to ExpenseCategoryRule(
            label = "Equipment",
            deductiblePercent = 100,
            keywords = listOf("equipment", "computer", "laptop", "monitor", "printer", "office depot"),
            description = "Work equipment, devices, and office hardware.",
        ),
        ExpenseCategory.HOME_OFFICE to ExpenseCategoryRule(
            label = "Home Office",
            deductiblePercent = 100,
            keywords = listOf("home office", "internet", "utilities", "rent", "desk", "chair"),
            description = "Dedicated workspace expenses and home office overhead.",
        ),
        ExpenseCategory.PROFESSIONAL_SERVICES to ExpenseCategoryRule(
            label = "Professional Services",
            deductiblePercent = 100,
            keywords = listOf("accounting", "bookkeeping", "legal", "consulting", "payroll", "tax prep"),
            description = "Professional fees for legal, accounting, and other services.",
        ),
        ExpenseCategory.SUBSCRIPTIONS to ExpenseCategoryRule(
            label = "Subscriptions",
            deductiblePercent = 100,
            keywords = listOf("subscription", "saas", "software", "adobe", "github", "notion", "zoom"),
            description = "Recurring software and business service subscriptions.",
        ),
    )

    fun getExpenseCategoryLabel(category: ExpenseCategory): String = ruleFor(category).label

    fun getDeductiblePercentForCategory(category: ExpenseCategory): Int = ruleFor(category).deductiblePercent

    fun getExpenseCategoryOptions(): List<ExpenseCategoryOption> = rules.map { (category, rule) ->
        ExpenseCategoryOption(
            value = category,
            label = rule.label,
            deductiblePercent = rule.deductiblePercent,
            description = rule.description,
        )
    }

    fun inferExpenseCategory(
        payee: String?,
        note: String? = null,
        tags: List<String> = emptyList(),
        categoryName: String? = null,
    ): ExpenseCategory? {
        val normalizedText = listOf(payee, note, categoryName, tags.joinToString(" "))
            .filterNot { it.isNullOrBlank() }
            .joinToString(" ")
            .lowercase()

        if (normalizedText.isEmpty()) return null

        var bestMatch: Pair<ExpenseCategory, Int>? = null
        for ((category, rule) in rules) {
            val score = rule.keywords.count { keyword -> normalizedText.contains(keyword) }
            if (score > 0 && (bestMatch == null || score > bestMatch.second)) {
                bestMatch = category to score
            }
        }
        return bestMatch?.first
    }

    fun parseBusinessExpenseMetadata(transaction: BusinessExpenseTransactionInput): BusinessExpenseMetadata? {
        val customFields = transaction.customFields.orEmpty()
        val storedCategory = parseExpenseCategory(customFields[BusinessExpenseFields.CATEGORY])
        val category = storedCategory ?: inferExpenseCategory(
            payee = transaction.payee,
            note = transaction.note,
            tags = transaction.tags,
            categoryName = transaction.categoryName,
        )
        val hasBusinessFlag = transaction.tags.contains(BUSINESS_EXPENSE_TAG) ||
            customFields.containsKey(BusinessExpenseFields.CATEGORY)

        if (!hasBusinessFlag || category == null) return null

        val deductiblePercent = parsePercent(customFields[BusinessExpenseFields.DEDUCTIBLE_PERCENT])
            ?: getDeductiblePercentForCategory(category)

        return BusinessExpenseMetadata(
            category = category,
            businessUsePercent = parsePercent(customFields[BusinessExpenseFields.BUSINESS_USE_PERCENT]) ?: 100,
            deductiblePercent = deductiblePercent,
            note = customFields[BusinessExpenseFields.NOTE].orEmpty(),
            source = parseSource(customFields[BusinessExpenseFields.SOURCE]) ?: BusinessExpenseSource.MANUAL,
            taggedAt = customFields[BusinessExpenseFields.TAGGED_AT].orEmpty(),
        )
    }

    fun getBusinessExpenseDefaults(transaction: BusinessExpenseTransactionInput): BusinessExpenseMetadata {
        parseBusinessExpenseMetadata(transaction)?.let { return it }
        val inferredCategory = inferExpenseCategory(
            payee = transaction.payee,
            note = transaction.note,
            tags = transaction.tags,
            categoryName = transaction.categoryName,
        ) ?: ExpenseCategory.TRAVEL
        return BusinessExpenseMetadata(
            category = inferredCategory,
            businessUsePercent = 100,
            deductiblePercent = getDeductiblePercentForCategory(inferredCategory),
            note = "",
            source = BusinessExpenseSource.RULE,
            taggedAt = "",
        )
    }

    fun classifyBusinessExpense(transaction: BusinessExpenseTransactionInput): BusinessExpenseClassification? {
        if (transaction.type != TransactionKind.EXPENSE) return null
        val metadata = parseBusinessExpenseMetadata(transaction) ?: return null
        val amountCents = absoluteValue(transaction.amountCents)
        val deductibleAmountCents = roundHalfUp(
            amountCents * metadata.businessUsePercent.toLong() * metadata.deductiblePercent.toLong(),
            10_000L,
        )

        return BusinessExpenseClassification(
            transactionId = transaction.id,
            date = transaction.date,
            payee = transaction.payee?.trim()?.takeIf { it.isNotEmpty() }
                ?: transaction.note?.trim()?.takeIf { it.isNotEmpty() }
                ?: "Business expense",
            amountCents = amountCents,
            deductibleAmountCents = deductibleAmountCents,
            categoryLabel = getExpenseCategoryLabel(metadata.category),
            category = metadata.category,
            businessUsePercent = metadata.businessUsePercent,
            deductiblePercent = metadata.deductiblePercent,
            note = metadata.note,
            source = metadata.source,
            taggedAt = metadata.taggedAt,
        )
    }

    fun isBusinessExpenseTransaction(transaction: BusinessExpenseTransactionInput): Boolean =
        parseBusinessExpenseMetadata(transaction) != null

    private fun ruleFor(category: ExpenseCategory): ExpenseCategoryRule =
        rules.getValue(category)

    private fun parsePercent(raw: String?): Int? {
        if (raw.isNullOrBlank()) return null
        val parsed = raw.toDoubleOrNull() ?: return null
        return if (parsed.isFinite()) normalizePercent(parsed) else null
    }

    private fun normalizePercent(value: Double): Int = value.roundToInt().coerceIn(0, 100)

    private fun parseExpenseCategory(raw: String?): ExpenseCategory? = when (raw) {
        "travel" -> ExpenseCategory.TRAVEL
        "meals" -> ExpenseCategory.MEALS
        "equipment" -> ExpenseCategory.EQUIPMENT
        "home-office" -> ExpenseCategory.HOME_OFFICE
        "professional-services" -> ExpenseCategory.PROFESSIONAL_SERVICES
        "subscriptions" -> ExpenseCategory.SUBSCRIPTIONS
        else -> null
    }

    private fun parseSource(raw: String?): BusinessExpenseSource? = when (raw) {
        "manual" -> BusinessExpenseSource.MANUAL
        "rule" -> BusinessExpenseSource.RULE
        else -> null
    }

    private fun roundHalfUp(numerator: Long, denominator: Long): Long =
        (numerator + denominator / 2L) / denominator

    private fun absoluteValue(value: Long): Long = if (value < 0L) -value else value
}

data class ExpenseCategoryRule(
    val label: String,
    val deductiblePercent: Int,
    val keywords: List<String>,
    val description: String,
)

data class ExpenseCategoryOption(
    val value: ExpenseCategory,
    val label: String,
    val deductiblePercent: Int,
    val description: String,
)
