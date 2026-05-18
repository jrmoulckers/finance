// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.components.filter.AdvancedFilter
import com.finance.desktop.components.filter.SortConfig
import com.finance.desktop.components.filter.SortDirection
import com.finance.desktop.components.filter.SortField
import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.CategoryRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Filter state for the transactions list.
 *
 * @param searchQuery Free-text query matched against payee, category, tags, account, status, amount, and date.
 * @param type Optional transaction type filter (expense, income, transfer).
 */
data class TransactionFilter(
    val searchQuery: String = "",
    val type: TransactionType? = null,
)

/**
 * UI state for the Transactions screen.
 *
 * Holds both the legacy simple filter (for backward compat) and the new advanced filter/sort.
 */
data class TransactionsUiState(
    val isLoading: Boolean = true,
    val transactions: List<Transaction> = emptyList(),
    val filter: TransactionFilter = TransactionFilter(),
    val advancedFilter: AdvancedFilter = AdvancedFilter(),
    val sortConfig: SortConfig = SortConfig(),
    val totalCount: Int = 0,
    val availableCategories: List<String> = emptyList(),
    val availableAccounts: List<String> = emptyList(),
    val availableTags: List<String> = emptyList(),
)

/**
 * ViewModel for the Transactions screen with advanced filter/sort support.
 *
 * Loads transactions from the shared KMP repository and applies full-text
 * search across all meaningful fields: payee, category name, tags, account
 * name, status, formatted amount, and date string.
 *
 * Manages the full advanced filter state including date range, categories,
 * accounts, amount range, type, status, and tags. Sort can be applied by
 * date, amount, payee, or category with ascending/descending direction.
 */
class TransactionsViewModel(
    private val transactionRepository: TransactionRepository,
    private val categoryRepository: CategoryRepository,
    private val accountRepository: AccountRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(TransactionsUiState())
    val uiState: StateFlow<TransactionsUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        loadTransactions()
    }

    /** Updates the search query and reloads filtered data. */
    fun updateSearch(query: String) {
        val current = _uiState.value
        _uiState.value = current.copy(
            filter = current.filter.copy(searchQuery = query),
            advancedFilter = current.advancedFilter.copy(searchQuery = query),
        )
        loadTransactions()
    }

    /** Sets the transaction type filter. */
    fun setTypeFilter(type: TransactionType?) {
        val current = _uiState.value
        _uiState.value = current.copy(
            filter = current.filter.copy(type = type),
            advancedFilter = current.advancedFilter.copy(type = type),
        )
        loadTransactions()
    }

    /** Updates the full advanced filter. */
    fun updateAdvancedFilter(filter: AdvancedFilter) {
        val current = _uiState.value
        _uiState.value = current.copy(
            advancedFilter = filter,
            filter = TransactionFilter(
                searchQuery = filter.searchQuery,
                type = filter.type,
            ),
        )
        loadTransactions()
    }

    /** Updates the sort configuration. */
    fun updateSort(sortConfig: SortConfig) {
        _uiState.value = _uiState.value.copy(sortConfig = sortConfig)
        loadTransactions()
    }

    /** Clears all filters and resets to defaults. */
    fun clearFilters() {
        _uiState.value = _uiState.value.copy(
            filter = TransactionFilter(),
            advancedFilter = AdvancedFilter(),
        )
        loadTransactions()
    }

    /** Adds a tag to the filter. */
    fun addTagFilter(tag: String) {
        val current = _uiState.value.advancedFilter
        updateAdvancedFilter(current.copy(tags = current.tags + tag))
    }

    /** Removes a tag from the filter. */
    fun removeTagFilter(tag: String) {
        val current = _uiState.value.advancedFilter
        updateAdvancedFilter(current.copy(tags = current.tags - tag))
    }

    /** Delete a transaction by ID. */
    fun deleteTransaction(id: SyncId) {
        viewModelScope.launch {
            transactionRepository.delete(id)
            loadTransactions()
        }
    }

    /**
     * Loads transactions from the repository, applies all advanced filters,
     * and sorts the result according to the current sort configuration.
     */
    @Suppress("CyclomaticComplexity") // Multi-field search predicate
    private fun loadTransactions() {
        viewModelScope.launch {
            val all = transactionRepository.observeAll(hid).first()
            val filter = _uiState.value.advancedFilter
            val sortConfig = _uiState.value.sortConfig

            // Pre-fetch lookup maps for category and account names
            val categories = categoryRepository.observeAll(hid).first()
            val categoryNameMap = categories.associate { it.id to it.name }

            val accounts = accountRepository.observeAll(hid).first()
            val accountNameMap = accounts.associate { it.id to it.name }

            // Apply filters
            var filtered = all

            // Text search (full-text across multiple fields)
            if (filter.searchQuery.isNotBlank()) {
                val q = filter.searchQuery.lowercase()
                filtered = filtered.filter { txn ->
                    // Payee match
                    txn.payee?.lowercase()?.contains(q) == true ||
                        // Category name match
                        (txn.categoryId != null &&
                            categoryNameMap[txn.categoryId]?.lowercase()?.contains(q) == true) ||
                        // Account name match
                        accountNameMap[txn.accountId]?.lowercase()?.contains(q) == true ||
                        // Tags match (join list and search)
                        txn.tags.joinToString(" ").lowercase().contains(q) ||
                        // Status match
                        txn.status.name.lowercase().contains(q) ||
                        // Amount match (numeric query matches amount value)
                        matchesAmount(q, txn) ||
                        // Date match (ISO string contains query)
                        txn.date.toString().contains(q) ||
                        // Note match
                        txn.note?.lowercase()?.contains(q) == true
                }
            }

            // Type filter
            if (filter.type != null) {
                filtered = filtered.filter { it.type == filter.type }
            }

            // Date range filter
            if (filter.dateStart != null) {
                filtered = filtered.filter { it.date >= filter.dateStart }
            }
            if (filter.dateEnd != null) {
                filtered = filtered.filter { it.date <= filter.dateEnd }
            }

            // Amount range filter
            if (filter.amountMin != null) {
                filtered = filtered.filter {
                    it.amount.amount.toDouble() >= filter.amountMin
                }
            }
            if (filter.amountMax != null) {
                filtered = filtered.filter {
                    it.amount.amount.toDouble() <= filter.amountMax
                }
            }

            // Tags filter
            if (filter.tags.isNotEmpty()) {
                filtered = filtered.filter { txn ->
                    txn.tags.any { it in filter.tags }
                }
            }

            // Apply sorting
            val sorted = applySorting(filtered, sortConfig)

            // Extract available metadata for filter options (use category/account names)
            val allCategories = categories.map { it.name }.distinct().sorted()
            val allAccountNames = accounts.map { it.name }.distinct().sorted()
            val allTags = all.flatMap { it.tags }.distinct().sorted()

            _uiState.value = _uiState.value.copy(
                isLoading = false,
                transactions = sorted,
                totalCount = sorted.size,
                availableCategories = allCategories,
                availableAccounts = allAccountNames,
                availableTags = allTags,
            )
        }
    }

    /**
     * Applies the current sort configuration to a list of transactions.
     */
    private fun applySorting(
        transactions: List<Transaction>,
        sortConfig: SortConfig,
    ): List<Transaction> {
        val comparator = compareBy<Transaction> { txn ->
            when (sortConfig.field) {
                SortField.DATE -> txn.date.toString()
                SortField.AMOUNT -> txn.amount.amount.toString().padStart(20)
                SortField.PAYEE -> (txn.payee ?: "").lowercase()
                SortField.CATEGORY -> (txn.categoryId?.value ?: "").lowercase()
            }
        }

        return if (sortConfig.direction == SortDirection.DESCENDING) {
            transactions.sortedWith(comparator.reversed())
        } else {
            transactions.sortedWith(comparator)
        }
    }

    /**
     * Checks if a query matches the transaction amount.
     * Supports matching raw cents value or formatted dollar amount.
     */
    private fun matchesAmount(query: String, txn: Transaction): Boolean {
        val cents = txn.amount.amount
        // Match raw cents string
        if (cents.toString().contains(query)) return true
        // Match formatted dollar value (e.g., "12.34")
        val dollars = cents.toDouble() / 100.0
        val formatted = "%.2f".format(dollars)
        if (formatted.contains(query)) return true
        return false
    }
}

