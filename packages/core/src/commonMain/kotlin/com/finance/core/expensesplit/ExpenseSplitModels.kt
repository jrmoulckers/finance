// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.expensesplit

import kotlinx.datetime.LocalDate
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Business/personal classification for an expense. */
@Serializable
enum class ExpenseType {
    @SerialName("business")
    BUSINESS,

    @SerialName("personal")
    PERSONAL,

    @SerialName("split")
    SPLIT,
}

/** Ratio for split expenses. Percentages are whole numbers and must sum to 100 when valid. */
@Serializable
data class SplitRatio(
    val businessPercent: Int,
    val personalPercent: Int,
)

/** Lightweight platform-neutral transaction input for expense split calculations. */
@Serializable
data class ExpenseSplitTransaction(
    val id: String,
    val merchant: String,
    val category: String,
    val amountCents: Long,
    val date: LocalDate,
    val tags: List<String> = emptyList(),
    val note: String = "",
)

/** A transaction tagged with business, personal, or split treatment. */
@Serializable
data class ClassifiedExpense(
    val transaction: ExpenseSplitTransaction,
    val expenseType: ExpenseType,
    val splitRatio: SplitRatio? = null,
    val isDeductible: Boolean = false,
    val deductionCategory: String? = null,
)

/** Exact split of a transaction amount. */
@Serializable
data class SplitAmounts(
    val totalCents: Long,
    val businessCents: Long,
    val personalCents: Long,
    val remainderAssignedTo: RemainderTarget,
)

/** Which side receives any cent needed to make rounded split portions sum exactly to total. */
@Serializable
enum class RemainderTarget {
    NONE,
    BUSINESS,
    PERSONAL,
}

@Serializable
enum class Quarter {
    Q1,
    Q2,
    Q3,
    Q4,
}

/** Business expense report for an inclusive date range. */
@Serializable
data class BusinessExpenseReport(
    val periodStart: LocalDate,
    val periodEnd: LocalDate,
    val totalBusinessCents: Long,
    val totalDeductibleCents: Long,
    val totalSplitBusinessPortionCents: Long,
    val transactions: List<ClassifiedExpense>,
    val categoryBreakdown: Map<String, Long>,
)

/** Business totals for a calendar quarter. */
@Serializable
data class QuarterlyBusinessSummary(
    val quarter: Quarter,
    val year: Int,
    val totalBusinessCents: Long,
    val totalDeductibleCents: Long,
    val categoryBreakdown: Map<String, Long>,
)

@Serializable
enum class AllocationType {
    @SerialName("mileage")
    MILEAGE,

    @SerialName("home-office")
    HOME_OFFICE,
}

/** Mileage or home-office allocation input. */
@Serializable
data class AllocationConfig(
    val type: AllocationType,
    val rateOrPercent: Long,
    val quantity: Long,
)

/** Validation outcome that keeps all errors instead of failing fast. */
@Serializable
data class ExpenseSplitValidationResult(
    val isValid: Boolean,
    val errors: List<String> = emptyList(),
) {
    companion object {
        val Valid = ExpenseSplitValidationResult(isValid = true)
    }
}

@Serializable
enum class TransactionKind {
    EXPENSE,
    INCOME,
    TRANSFER,
}

@Serializable
enum class ExpenseCategory {
    @SerialName("travel")
    TRAVEL,

    @SerialName("meals")
    MEALS,

    @SerialName("equipment")
    EQUIPMENT,

    @SerialName("home-office")
    HOME_OFFICE,

    @SerialName("professional-services")
    PROFESSIONAL_SERVICES,

    @SerialName("subscriptions")
    SUBSCRIPTIONS,
}

@Serializable
enum class BusinessExpenseSource {
    @SerialName("manual")
    MANUAL,

    @SerialName("rule")
    RULE,
}

/** Metadata stored by the web business-expense tagger. */
@Serializable
data class BusinessExpenseMetadata(
    val category: ExpenseCategory,
    val businessUsePercent: Int,
    val deductiblePercent: Int,
    val note: String = "",
    val source: BusinessExpenseSource = BusinessExpenseSource.MANUAL,
    val taggedAt: String = "",
)

/** Transaction shape used by the web business-expense rules. */
@Serializable
data class BusinessExpenseTransactionInput(
    val id: String,
    val date: LocalDate,
    val payee: String? = null,
    val note: String? = null,
    val amountCents: Long,
    val type: TransactionKind,
    val tags: List<String> = emptyList(),
    val customFields: Map<String, String>? = null,
    val categoryName: String? = null,
)

/** Deductible business-expense classification derived from tags/custom fields. */
@Serializable
data class BusinessExpenseClassification(
    val transactionId: String,
    val date: LocalDate,
    val payee: String,
    val amountCents: Long,
    val deductibleAmountCents: Long,
    val deductionType: String = "business-expense",
    val categoryLabel: String,
    val category: ExpenseCategory,
    val businessUsePercent: Int,
    val deductiblePercent: Int,
    val note: String = "",
    val source: BusinessExpenseSource = BusinessExpenseSource.MANUAL,
    val taggedAt: String = "",
)
