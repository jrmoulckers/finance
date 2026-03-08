// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.analytics

import com.finance.models.types.Cents
import kotlinx.datetime.Month

/**
 * Income vs. expense comparison for a single calendar month.
 *
 * All monetary fields are in [Cents] (Long-backed) — never floating point.
 * [net] is always `income - expense`.
 */
data class MonthlyComparison(
    val year: Int,
    val month: Month,
    val income: Cents,
    val expense: Cents,
    val net: Cents,
) {
    init {
        require(income.amount >= 0) { "Income cannot be negative" }
        require(expense.amount >= 0) { "Expense cannot be negative" }
    }
}
