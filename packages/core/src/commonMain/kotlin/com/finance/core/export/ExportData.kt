// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.*

/**
 * Container for all financial data to be exported.
 *
 * Callers construct this by querying SQLDelight DAOs for each entity type.
 * All records should already be filtered (`deleted_at IS NULL`) by the queries —
 * the export pipeline does **not** perform soft-delete filtering.
 *
 * Sync-internal fields (`syncVersion`, `isSynced`) are present on the domain
 * models but must be stripped by the [ExportSerializer] implementation during
 * serialization — callers pass the full domain objects unchanged.
 *
 * Usage:
 * ```
 * val data = ExportData(
 *     accounts = accountDao.selectActive(),
 *     transactions = transactionDao.selectAll(),
 *     categories = categoryDao.selectAll(),
 *     budgets = budgetDao.selectActive(),
 *     goals = goalDao.selectActive(),
 * )
 * ```
 */
data class ExportData(
    /** Active (non-deleted) accounts to include in the export. */
    val accounts: List<Account>,
    /** Non-deleted transactions to include in the export. */
    val transactions: List<Transaction>,
    /** Non-deleted categories to include in the export. */
    val categories: List<Category>,
    /** Active (non-deleted) budgets to include in the export. */
    val budgets: List<Budget>,
    /** Active (non-deleted) goals to include in the export. */
    val goals: List<Goal>,
) {
    /** `true` when every entity list is empty — nothing to export. */
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
