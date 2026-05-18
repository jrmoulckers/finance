// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.CategoryRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.flow.*
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
 * UI state for the transactions screen.
 */
data class TransactionsUiState(
    val isLoading: Boolean = true,
    val transactions: List<Transaction> = emptyList(),
    val filter: TransactionFilter = TransactionFilter(),
    val totalCount: Int = 0,
)

/**
 * ViewModel for the Transactions screen.
 *
 * Loads transactions from the shared KMP repository and applies full-text
 * search across all meaningful fields: payee, category name, tags, account
 * name, status, formatted amount, and date string.
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

    /** Update the search query and reload filtered results. */
    fun updateSearch(query: String) {
        _uiState.value = _uiState.value.copy(
            filter = _uiState.value.filter.copy(searchQuery = query),
        )
        loadTransactions()
    }

    /** Set or clear the transaction type filter. */
    fun setTypeFilter(type: TransactionType?) {
        _uiState.value = _uiState.value.copy(
            filter = _uiState.value.filter.copy(type = type),
        )
        loadTransactions()
    }

    /** Reset all filters to defaults. */
    fun clearFilters() {
        _uiState.value = _uiState.value.copy(filter = TransactionFilter())
        loadTransactions()
    }

    /** Delete a transaction by ID. */
    fun deleteTransaction(id: SyncId) {
        viewModelScope.launch {
            transactionRepository.delete(id)
            loadTransactions()
        }
    }

    @Suppress("CyclomaticComplexity") // Multi-field search predicate
    private fun loadTransactions() {
        viewModelScope.launch {
            val all = transactionRepository.observeAll(hid).first()

            // Pre-fetch lookup maps for category and account names
            val categories = categoryRepository.observeAll(hid).first()
            val categoryNameMap = categories.associate { it.id to it.name }

            val accounts = accountRepository.observeAll(hid).first()
            val accountNameMap = accounts.associate { it.id to it.name }

            val filter = _uiState.value.filter
            var filtered = all

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

            if (filter.type != null) {
                filtered = filtered.filter { it.type == filter.type }
            }

            val sorted = filtered.sortedByDescending { it.date }
            _uiState.value = TransactionsUiState(
                isLoading = false,
                transactions = sorted,
                filter = filter,
                totalCount = sorted.size,
            )
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
