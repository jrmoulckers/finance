package com.finance.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.ui.data.SampleData
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.SyncId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime

data class TransactionFilter(
    val searchQuery: String = "",
    val type: TransactionType? = null,
    val categoryId: SyncId? = null,
    val dateFrom: LocalDate? = null,
    val dateTo: LocalDate? = null,
)

data class TransactionDateGroup(
    val date: LocalDate,
    val dateLabel: String,
    val transactions: List<Transaction>,
)

data class TransactionsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val dateGroups: List<TransactionDateGroup> = emptyList(),
    val filter: TransactionFilter = TransactionFilter(),
    val isSearchActive: Boolean = false,
    val isEmpty: Boolean = false,
    val hasMore: Boolean = false,
    val isLoadingMore: Boolean = false,
    val totalCount: Int = 0,
)

/** ViewModel for the Transactions screen (#26). Filtering, search, pagination. */
class TransactionsViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(TransactionsUiState())
    val uiState: StateFlow<TransactionsUiState> = _uiState.asStateFlow()
    private val pageSize = 20
    private var currentPage = 0

    init { loadTransactions() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            delay(600); currentPage = 0; loadData()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    fun updateSearch(query: String) {
        _uiState.update { it.copy(filter = it.filter.copy(searchQuery = query)) }
        currentPage = 0; loadTransactions()
    }

    fun toggleSearch() {
        val active = _uiState.value.isSearchActive
        _uiState.update {
            it.copy(isSearchActive = !active,
                filter = if (active) it.filter.copy(searchQuery = "") else it.filter)
        }
        if (active) { currentPage = 0; loadTransactions() }
    }

    fun setTypeFilter(type: TransactionType?) {
        _uiState.update { it.copy(filter = it.filter.copy(type = type)) }
        currentPage = 0; loadTransactions()
    }

    fun clearFilters() {
        _uiState.update { it.copy(filter = TransactionFilter()) }
        currentPage = 0; loadTransactions()
    }

    fun loadMore() {
        if (_uiState.value.isLoadingMore || !_uiState.value.hasMore) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMore = true) }
            delay(400); currentPage++; loadData(append = true)
            _uiState.update { it.copy(isLoadingMore = false) }
        }
    }

    fun deleteTransaction(id: SyncId) { currentPage = 0; loadTransactions() }

    private fun loadTransactions() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            delay(200); loadData()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    private fun loadData(append: Boolean = false) {
        val filter = _uiState.value.filter
        val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
        var filtered = SampleData.transactions.filter { it.deletedAt == null }
        if (filter.searchQuery.isNotBlank()) {
            val q = filter.searchQuery.lowercase()
            filtered = filtered.filter { txn ->
                (txn.payee?.lowercase()?.contains(q) == true) ||
                    (txn.note?.lowercase()?.contains(q) == true) ||
                    SampleData.categoryMap[txn.categoryId]?.name?.lowercase()?.contains(q) == true
            }
        }
        if (filter.type != null) filtered = filtered.filter { it.type == filter.type }
        if (filter.categoryId != null) filtered = filtered.filter { it.categoryId == filter.categoryId }
        if (filter.dateFrom != null) filtered = filtered.filter { it.date >= filter.dateFrom }
        if (filter.dateTo != null) filtered = filtered.filter { it.date <= filter.dateTo }

        val sorted = filtered.sortedByDescending { it.date }
        val total = sorted.size
        val end = ((currentPage + 1) * pageSize).coerceAtMost(sorted.size)
        val paged = sorted.take(end)
        val groups = paged.groupBy { it.date }.entries.sortedByDescending { it.key }
            .map { (date, txns) ->
                TransactionDateGroup(date, formatDateLabel(date, today),
                    txns.sortedByDescending { it.createdAt })
            }
        _uiState.update {
            it.copy(dateGroups = groups, isEmpty = if (!append) groups.isEmpty() else it.isEmpty,
                hasMore = end < total, totalCount = total)
        }
    }

    companion object {
        fun formatDateLabel(date: LocalDate, today: LocalDate): String {
            val yesterday = today.minus(1, DateTimeUnit.DAY)
            return when (date) {
                today -> "Today"
                yesterday -> "Yesterday"
                else -> {
                    val m = date.month.name.lowercase().replaceFirstChar { it.uppercase() }
                    "${m.take(3)} ${date.dayOfMonth}"
                }
            }
        }
    }
}