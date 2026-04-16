// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.dataimport

import com.finance.models.*

/**
 * Container for all financial data parsed from an import file.
 *
 * Mirrors [com.finance.core.export.ExportData] structurally so that
 * export → import round-trips are straightforward.
 *
 * All entities in this container have been validated for structural
 * correctness (required fields present, types parsed) but have **not**
 * been checked for referential integrity (e.g., whether an accountId
 * on a transaction references an account that exists). Referential
 * validation is the caller's responsibility before persistence.
 */
data class ImportData(
    /** Parsed account records. */
    val accounts: List<Account>,
    /** Parsed transaction records. */
    val transactions: List<Transaction>,
    /** Parsed category records. */
    val categories: List<Category>,
    /** Parsed budget records. */
    val budgets: List<Budget>,
    /** Parsed goal records. */
    val goals: List<Goal>,
) {
    /** `true` when every entity list is empty — nothing was imported. */
    val isEmpty: Boolean
        get() = accounts.isEmpty() &&
            transactions.isEmpty() &&
            categories.isEmpty() &&
            budgets.isEmpty() &&
            goals.isEmpty()

    /** Total number of records across all entity types. */
    val totalRecords: Int
        get() = accounts.size + transactions.size + categories.size +
            budgets.size + goals.size
}
