// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class TransactionFilter(val searchQuery: String = "", val type: TransactionType? = null)
data class TransactionsUiState(val isLoading: Boolean = true, val transactions: List<Transaction> = emptyList(), val filter: TransactionFilter = TransactionFilter(), val totalCount: Int = 0)

class TransactionsViewModel(
    private val transactionRepository: TransactionRepository,
) : DesktopViewModel() {
    private val _uiState = MutableStateFlow(TransactionsUiState())
    val uiState: StateFlow<TransactionsUiState> = _uiState.asStateFlow()
    private val hid = SyncId("d1")
    init { loadTransactions() }
    fun updateSearch(query: String) { _uiState.value = _uiState.value.copy(filter = _uiState.value.filter.copy(searchQuery = query)); loadTransactions() }
    fun setTypeFilter(type: TransactionType?) { _uiState.value = _uiState.value.copy(filter = _uiState.value.filter.copy(type = type)); loadTransactions() }
    fun clearFilters() { _uiState.value = _uiState.value.copy(filter = TransactionFilter()); loadTransactions() }
    private fun loadTransactions() {
        viewModelScope.launch {
            val all = transactionRepository.observeAll(hid).first()
            val filter = _uiState.value.filter
            var filtered = all
            if (filter.searchQuery.isNotBlank()) { val q = filter.searchQuery.lowercase(); filtered = filtered.filter { txn -> txn.payee?.lowercase()?.contains(q) == true } }
            if (filter.type != null) { filtered = filtered.filter { it.type == filter.type } }
            val sorted = filtered.sortedByDescending { it.date }
            _uiState.value = TransactionsUiState(isLoading = false, transactions = sorted, filter = filter, totalCount = sorted.size)
        }
    }
}
