package com.finance.android.ui.components.search

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate

// ---------------------------------------------------------------------------
// Filter data types
// ---------------------------------------------------------------------------

/** Preset date ranges plus a custom option. */
enum class DateRangePreset { TODAY, THIS_WEEK, THIS_MONTH, CUSTOM }

/**
 * Represents a date-range filter. When [preset] is [DateRangePreset.CUSTOM],
 * [customStart] and [customEnd] define the bounds.
 */
data class DateRangeFilter(
    val preset: DateRangePreset,
    val customStart: LocalDate? = null,
    val customEnd: LocalDate? = null,
)

/**
 * Multi-select category filter.
 *
 * @property selectedCategoryIds Set of [SyncId] values for selected categories.
 */
data class CategoryFilter(
    val selectedCategoryIds: Set<SyncId>,
)

/**
 * Amount range filter with optional min/max bounds (in [Cents]).
 */
data class AmountRangeFilter(
    val min: Cents? = null,
    val max: Cents? = null,
) {
    init {
        if (min != null && max != null) {
            require(min.amount <= max.amount) {
                "AmountRangeFilter min (${min.amount}) must be <= max (${max.amount})"
            }
        }
    }
}

/**
 * Transaction type filter — expense, income, or transfer.
 */
data class TransactionTypeFilter(
    val selectedTypes: Set<TransactionType>,
)

/**
 * Account filter — select one or more accounts.
 */
data class AccountFilter(
    val selectedAccountIds: Set<SyncId>,
)

// ---------------------------------------------------------------------------
// Aggregate filter state
// ---------------------------------------------------------------------------

/**
 * Immutable snapshot of every active filter. Passed into [matches] to evaluate
 * whether a [Transaction] satisfies all active constraints.
 */
data class SearchFilterData(
    val query: String = "",
    val dateRange: DateRangeFilter? = null,
    val category: CategoryFilter? = null,
    val amountRange: AmountRangeFilter? = null,
    val transactionType: TransactionTypeFilter? = null,
    val account: AccountFilter? = null,
) {

    /** Number of individual filter categories that are active. */
    val activeFilterCount: Int
        get() = listOfNotNull(dateRange, category, amountRange, transactionType, account).size

    /** `true` when at least one filter is applied (query counts). */
    val hasActiveFilters: Boolean
        get() = query.isNotBlank() || activeFilterCount > 0

    // -- predicate -----------------------------------------------------------

    /**
     * Returns `true` when [transaction] satisfies **all** active filters.
     *
     * @param today Supplier for the current date; injected so the function
     *              remains deterministic in tests.
     */
    fun matches(
        transaction: Transaction,
        today: LocalDate,
    ): Boolean {
        // Text query – searches payee, note, and tags
        if (query.isNotBlank()) {
            val q = query.lowercase()
            val matchesText = listOfNotNull(
                transaction.payee,
                transaction.note,
            ).any { it.lowercase().contains(q) } ||
                transaction.tags.any { it.lowercase().contains(q) }
            if (!matchesText) return false
        }

        // Date range
        dateRange?.let { dr ->
            if (!matchesDateRange(transaction.date, dr, today)) return false
        }

        // Category
        category?.let { cf ->
            val catId = transaction.categoryId ?: return false
            if (catId !in cf.selectedCategoryIds) return false
        }

        // Amount range
        amountRange?.let { ar ->
            val absAmount = transaction.amount.abs()
            ar.min?.let { if (absAmount < it) return false }
            ar.max?.let { if (absAmount > it) return false }
        }

        // Transaction type
        transactionType?.let { ttf ->
            if (transaction.type !in ttf.selectedTypes) return false
        }

        // Account
        account?.let { af ->
            if (transaction.accountId !in af.selectedAccountIds) return false
        }

        return true
    }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Pure helper – does not read the clock, so it stays testable.
 */
private fun matchesDateRange(
    date: LocalDate,
    filter: DateRangeFilter,
    today: LocalDate,
): Boolean = when (filter.preset) {
    DateRangePreset.TODAY -> date == today
    DateRangePreset.THIS_WEEK -> {
        // ISO week: Monday = 1 … Sunday = 7
        val daysSinceMonday = today.dayOfWeek.ordinal // Monday = 0
        val weekStart = LocalDate.fromEpochDays(today.toEpochDays() - daysSinceMonday)
        val weekEnd = LocalDate.fromEpochDays(weekStart.toEpochDays() + 6)
        date in weekStart..weekEnd
    }
    DateRangePreset.THIS_MONTH -> {
        date.year == today.year && date.monthNumber == today.monthNumber
    }
    DateRangePreset.CUSTOM -> {
        val afterStart = filter.customStart?.let { date >= it } ?: true
        val beforeEnd = filter.customEnd?.let { date <= it } ?: true
        afterStart && beforeEnd
    }
}

// ---------------------------------------------------------------------------
// Composable state holder
// ---------------------------------------------------------------------------

/**
 * Mutable state holder for search + filters. Compose will recompose
 * whenever any property changes.
 */
@Stable
class SearchFilterState {
    var query by mutableStateOf("")
    var dateRange: DateRangeFilter? by mutableStateOf(null)
    var category: CategoryFilter? by mutableStateOf(null)
    var amountRange: AmountRangeFilter? by mutableStateOf(null)
    var transactionType: TransactionTypeFilter? by mutableStateOf(null)
    var account: AccountFilter? by mutableStateOf(null)

    /** Snapshot the current mutable state into an immutable [SearchFilterData]. */
    fun toFilterData(): SearchFilterData = SearchFilterData(
        query = query,
        dateRange = dateRange,
        category = category,
        amountRange = amountRange,
        transactionType = transactionType,
        account = account,
    )

    /** Number of active filter categories (excludes text query). */
    val activeFilterCount: Int
        get() = listOfNotNull(dateRange, category, amountRange, transactionType, account).size

    /** `true` when any filter or query is active. */
    val hasActiveFilters: Boolean
        get() = query.isNotBlank() || activeFilterCount > 0

    /** Reset every filter back to its default. */
    fun clearAll() {
        query = ""
        dateRange = null
        category = null
        amountRange = null
        transactionType = null
        account = null
    }
}

/**
 * Remember a [SearchFilterState] scoped to the current composition.
 */
@Composable
fun rememberSearchFilterState(): SearchFilterState = remember { SearchFilterState() }
