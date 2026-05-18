// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components.filter

import com.finance.models.TransactionType
import kotlinx.datetime.LocalDate

/**
 * Represents a complete set of advanced transaction filters.
 *
 * All filter fields are nullable — null means "no filter applied" for that field.
 * This model is held in the ViewModel and drives both the filter panel UI
 * and the actual data filtering logic.
 */
data class AdvancedFilter(
    val searchQuery: String = "",
    val type: TransactionType? = null,
    val dateStart: LocalDate? = null,
    val dateEnd: LocalDate? = null,
    val categories: Set<String> = emptySet(),
    val accounts: Set<String> = emptySet(),
    val amountMin: Double? = null,
    val amountMax: Double? = null,
    val tags: Set<String> = emptySet(),
    val status: TransactionStatus? = null,
) {
    /** Returns the number of active (non-default) filters. */
    val activeCount: Int
        get() {
            var count = 0
            if (dateStart != null || dateEnd != null) count++
            if (categories.isNotEmpty()) count++
            if (accounts.isNotEmpty()) count++
            if (amountMin != null || amountMax != null) count++
            if (tags.isNotEmpty()) count++
            if (status != null) count++
            if (type != null) count++
            return count
        }
}

/**
 * Transaction status for filtering purposes.
 */
enum class TransactionStatus(val label: String) {
    CLEARED("Cleared"),
    PENDING("Pending"),
    RECONCILED("Reconciled"),
}

/**
 * Sort field options for transactions.
 */
enum class SortField(val label: String) {
    DATE("Date"),
    AMOUNT("Amount"),
    PAYEE("Payee"),
    CATEGORY("Category"),
}

/**
 * Sort direction.
 */
enum class SortDirection {
    ASCENDING,
    DESCENDING,
}

/**
 * Combined sort configuration.
 */
data class SortConfig(
    val field: SortField = SortField.DATE,
    val direction: SortDirection = SortDirection.DESCENDING,
)
