// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.expensesplit

import kotlinx.datetime.LocalDate

/**
 * Pure KMP port of the web expense-separation engine.
 *
 * Amounts are integer cents. Split business cents use banker's rounding for web parity.
 * The personal side is then calculated as `total - business`, so split portions always
 * sum back exactly to the original total; any rounding remainder cent is assigned to personal.
 */
object ExpenseSplitEngine {

    fun businessPortion(
        amountCents: Long,
        expenseType: ExpenseType,
        splitRatio: SplitRatio? = null,
    ): Long = when (expenseType) {
        ExpenseType.PERSONAL -> 0L
        ExpenseType.BUSINESS -> amountCents
        ExpenseType.SPLIT -> {
            val ratio = requireValidSplitRatio(splitRatio)
            roundedPercent(amountCents, ratio.businessPercent)
        }
    }

    fun personalPortion(
        amountCents: Long,
        expenseType: ExpenseType,
        splitRatio: SplitRatio? = null,
    ): Long = splitAmounts(amountCents, expenseType, splitRatio).personalCents

    fun splitAmounts(
        totalCents: Long,
        expenseType: ExpenseType,
        splitRatio: SplitRatio? = null,
    ): SplitAmounts = when (expenseType) {
        ExpenseType.BUSINESS -> SplitAmounts(
            totalCents = totalCents,
            businessCents = totalCents,
            personalCents = 0L,
            remainderAssignedTo = RemainderTarget.NONE,
        )

        ExpenseType.PERSONAL -> SplitAmounts(
            totalCents = totalCents,
            businessCents = 0L,
            personalCents = totalCents,
            remainderAssignedTo = RemainderTarget.NONE,
        )

        ExpenseType.SPLIT -> {
            val ratio = requireValidSplitRatio(splitRatio)
            val business = roundedPercent(totalCents, ratio.businessPercent)
            val directPersonal = roundedPercent(totalCents, ratio.personalPercent)
            val personal = totalCents - business
            SplitAmounts(
                totalCents = totalCents,
                businessCents = business,
                personalCents = personal,
                remainderAssignedTo = if (business + directPersonal == totalCents) {
                    RemainderTarget.NONE
                } else {
                    RemainderTarget.PERSONAL
                },
            )
        }
    }

    fun classifyTransaction(
        transaction: ExpenseSplitTransaction,
        expenseType: ExpenseType,
        splitRatio: SplitRatio? = null,
        isDeductible: Boolean = false,
        deductionCategory: String? = null,
    ): ClassifiedExpense {
        if (expenseType == ExpenseType.SPLIT) {
            requireValidSplitRatio(splitRatio)
        }

        return ClassifiedExpense(
            transaction = transaction,
            expenseType = expenseType,
            splitRatio = if (expenseType == ExpenseType.SPLIT) splitRatio else null,
            isDeductible = isDeductible && expenseType != ExpenseType.PERSONAL,
            deductionCategory = deductionCategory?.takeIf { it.isNotBlank() },
        )
    }

    fun businessExpenses(classified: List<ClassifiedExpense>): List<ClassifiedExpense> =
        classified.filter { it.expenseType != ExpenseType.PERSONAL }

    fun personalExpenses(classified: List<ClassifiedExpense>): List<ClassifiedExpense> =
        classified.filter { it.expenseType == ExpenseType.PERSONAL }

    fun taxDeductibleExpenses(classified: List<ClassifiedExpense>): List<ClassifiedExpense> =
        classified.filter { it.isDeductible && it.expenseType != ExpenseType.PERSONAL }

    fun filterByDateRange(
        classified: List<ClassifiedExpense>,
        periodStart: LocalDate,
        periodEnd: LocalDate,
    ): List<ClassifiedExpense> {
        require(periodStart <= periodEnd) { "periodStart must be <= periodEnd" }
        return classified.filter { it.transaction.date in periodStart..periodEnd }
    }

    fun generateBusinessExpenseReport(
        classified: List<ClassifiedExpense>,
        periodStart: LocalDate,
        periodEnd: LocalDate,
    ): BusinessExpenseReport {
        require(periodStart <= periodEnd) { "periodStart must be <= periodEnd" }
        val inRange = classified.filter {
            it.transaction.date in periodStart..periodEnd && it.expenseType != ExpenseType.PERSONAL
        }

        var totalBusinessCents = 0L
        var totalDeductibleCents = 0L
        var totalSplitBusinessPortionCents = 0L
        val categoryBreakdown = mutableMapOf<String, Long>()

        for (item in inRange) {
            val business = businessPortion(
                amountCents = item.transaction.amountCents,
                expenseType = item.expenseType,
                splitRatio = item.splitRatio,
            )
            totalBusinessCents += business
            if (item.isDeductible) {
                totalDeductibleCents += business
            }
            if (item.expenseType == ExpenseType.SPLIT) {
                totalSplitBusinessPortionCents += business
            }
            categoryBreakdown[item.transaction.category] =
                (categoryBreakdown[item.transaction.category] ?: 0L) + business
        }

        return BusinessExpenseReport(
            periodStart = periodStart,
            periodEnd = periodEnd,
            totalBusinessCents = totalBusinessCents,
            totalDeductibleCents = totalDeductibleCents,
            totalSplitBusinessPortionCents = totalSplitBusinessPortionCents,
            transactions = inRange,
            categoryBreakdown = categoryBreakdown,
        )
    }

    fun quarterlyBusinessSummary(
        classified: List<ClassifiedExpense>,
        year: Int,
    ): List<QuarterlyBusinessSummary> = Quarter.entries.map { quarter ->
        val inQuarter = classified.filter { item ->
            item.transaction.date.year == year &&
                item.transaction.date.monthNumber in quarterStartMonth(quarter)..quarterEndMonth(quarter) &&
                item.expenseType != ExpenseType.PERSONAL
        }

        var totalBusinessCents = 0L
        var totalDeductibleCents = 0L
        val categoryBreakdown = mutableMapOf<String, Long>()

        for (item in inQuarter) {
            val business = businessPortion(item.transaction.amountCents, item.expenseType, item.splitRatio)
            totalBusinessCents += business
            if (item.isDeductible) {
                totalDeductibleCents += business
            }
            categoryBreakdown[item.transaction.category] =
                (categoryBreakdown[item.transaction.category] ?: 0L) + business
        }

        QuarterlyBusinessSummary(
            quarter = quarter,
            year = year,
            totalBusinessCents = totalBusinessCents,
            totalDeductibleCents = totalDeductibleCents,
            categoryBreakdown = categoryBreakdown,
        )
    }

    fun quarterFromDate(date: LocalDate): Quarter = when (date.monthNumber) {
        in 1..3 -> Quarter.Q1
        in 4..6 -> Quarter.Q2
        in 7..9 -> Quarter.Q3
        else -> Quarter.Q4
    }

    fun yearFromDate(date: LocalDate): Int = date.year

    fun calculateAllocation(config: AllocationConfig): Long {
        if (config.quantity <= 0L || config.rateOrPercent <= 0L) return 0L
        return when (config.type) {
            AllocationType.MILEAGE -> bankersRound(config.rateOrPercent * config.quantity, 1L)
            AllocationType.HOME_OFFICE -> bankersRound(config.quantity * config.rateOrPercent, 100L)
        }
    }

    fun validateSplitRatio(splitRatio: SplitRatio?): ExpenseSplitValidationResult {
        val errors = mutableListOf<String>()
        if (splitRatio == null) {
            errors.add("Split ratio is required for split expenses")
        } else {
            if (splitRatio.businessPercent !in 0..100) {
                errors.add("Business percent must be between 0 and 100")
            }
            if (splitRatio.personalPercent !in 0..100) {
                errors.add("Personal percent must be between 0 and 100")
            }
            val sum = splitRatio.businessPercent + splitRatio.personalPercent
            if (sum != 100) {
                errors.add("Split ratio must sum to 100, got $sum")
            }
        }
        return if (errors.isEmpty()) {
            ExpenseSplitValidationResult.Valid
        } else {
            ExpenseSplitValidationResult(isValid = false, errors = errors)
        }
    }

    fun validateClassification(classifiedExpense: ClassifiedExpense): ExpenseSplitValidationResult {
        val errors = mutableListOf<String>()
        if (classifiedExpense.expenseType == ExpenseType.SPLIT) {
            errors.addAll(validateSplitRatio(classifiedExpense.splitRatio).errors)
        } else if (classifiedExpense.splitRatio != null) {
            errors.add("Split ratio is only allowed for split expenses")
        }
        if (classifiedExpense.expenseType == ExpenseType.PERSONAL && classifiedExpense.isDeductible) {
            errors.add("Personal expenses cannot be deductible")
        }
        return if (errors.isEmpty()) {
            ExpenseSplitValidationResult.Valid
        } else {
            ExpenseSplitValidationResult(isValid = false, errors = errors)
        }
    }

    private fun requireValidSplitRatio(splitRatio: SplitRatio?): SplitRatio {
        val validation = validateSplitRatio(splitRatio)
        require(validation.isValid) { validation.errors.joinToString("; ") }
        return splitRatio!!
    }

    private fun roundedPercent(amountCents: Long, percent: Int): Long =
        bankersRound(amountCents * percent.toLong(), 100L)

    private fun bankersRound(numerator: Long, denominator: Long): Long {
        require(denominator > 0L) { "denominator must be > 0" }
        if (numerator == 0L) return 0L

        val sign = if (numerator < 0L) -1L else 1L
        val absoluteNumerator = if (numerator < 0L) -numerator else numerator
        val quotient = absoluteNumerator / denominator
        val remainder = absoluteNumerator % denominator
        val doubledRemainder = remainder * 2L
        val roundedMagnitude = when {
            doubledRemainder < denominator -> quotient
            doubledRemainder > denominator -> quotient + 1L
            quotient % 2L == 0L -> quotient
            else -> quotient + 1L
        }
        return roundedMagnitude * sign
    }

    private fun quarterStartMonth(quarter: Quarter): Int = when (quarter) {
        Quarter.Q1 -> 1
        Quarter.Q2 -> 4
        Quarter.Q3 -> 7
        Quarter.Q4 -> 10
    }

    private fun quarterEndMonth(quarter: Quarter): Int = when (quarter) {
        Quarter.Q1 -> 3
        Quarter.Q2 -> 6
        Quarter.Q3 -> 9
        Quarter.Q4 -> 12
    }
}
