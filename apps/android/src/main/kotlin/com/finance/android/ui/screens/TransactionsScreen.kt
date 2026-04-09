// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.data.SampleData
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.TransactionDateGroup
import org.koin.compose.viewmodel.koinViewModel
import com.finance.android.ui.viewmodel.TransactionFilter
import com.finance.android.ui.viewmodel.TransactionsUiState
import com.finance.android.ui.viewmodel.TransactionsViewModel
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.SyncId

/**
 * Transactions screen (#26) — full transaction list with date grouping,
 * search, filter chips, swipe actions, pull-to-refresh, and pagination.
 * TalkBack: "Transaction: \$50 at Grocery Store, March 6"
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransactionsScreen(
    onTransactionClick: (SyncId) -> Unit = {},
    onEditTransaction: (SyncId) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: TransactionsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isLoading && state.dateGroups.isEmpty()) {
        Box(modifier.fillMaxSize().semantics { contentDescription = "Loading transactions" },
            contentAlignment = Alignment.Center) {
            CircularProgressIndicator(Modifier.semantics { contentDescription = "Loading indicator" })
        }
        return
    }
    TransactionsContent(state, viewModel::refresh, viewModel::updateSearch, viewModel::toggleSearch,
        viewModel::setTypeFilter, viewModel::clearFilters, viewModel::loadMore,
        viewModel::deleteTransaction, onEditTransaction, onTransactionClick, modifier)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TransactionsContent(
    state: TransactionsUiState, onRefresh: () -> Unit, onSearch: (String) -> Unit,
    onToggleSearch: () -> Unit, onTypeFilter: (TransactionType?) -> Unit,
    onClearFilters: () -> Unit, onLoadMore: () -> Unit,
    onDelete: (SyncId) -> Unit, onEdit: (SyncId) -> Unit,
    onTransactionClick: (SyncId) -> Unit, modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    val shouldLoad by remember { derivedStateOf {
        val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()
        last != null && last.index >= listState.layoutInfo.totalItemsCount - 3
    }}
    LaunchedEffect(shouldLoad) { if (shouldLoad && state.hasMore && !state.isLoadingMore) onLoadMore() }

    PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = onRefresh, modifier = modifier.fillMaxSize()) {
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)) {
            item(key = "search") {
                SearchFilterBar(state.isSearchActive, state.filter.searchQuery, state.filter,
                    onSearch, onToggleSearch, onTypeFilter, onClearFilters)
                Spacer(Modifier.height(8.dp))
            }
            if (state.isEmpty) { item(key = "empty") { TxnEmptyState(state.filter != TransactionFilter()) } }
            state.dateGroups.forEach { group ->
                item(key = "hdr-${group.date}") { DateHeader(group.dateLabel) }
                items(group.transactions, key = { it.id.value }) { txn ->
                    SwipeableTxnItem(txn, { onDelete(txn.id) }, { onEdit(txn.id) }, { onTransactionClick(txn.id) })
                    Spacer(Modifier.height(8.dp))
                }
            }
            if (state.isLoadingMore) {
                item(key = "more") { Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(24.dp).semantics { contentDescription = "Loading more" }, strokeWidth = 2.dp)
                }}
            }
            item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
        }
    }
}

@Composable
private fun SearchFilterBar(active: Boolean, query: String, filter: TransactionFilter,
    onSearch: (String) -> Unit, onToggle: () -> Unit, onType: (TransactionType?) -> Unit, onClear: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (active) {
                OutlinedTextField(query, onSearch, Modifier.weight(1f).semantics { contentDescription = "Search transactions" },
                    placeholder = { Text("Search payees, categories...") },
                    leadingIcon = { Icon(Icons.Filled.Search, null) },
                    trailingIcon = { if (query.isNotEmpty()) IconButton({ onSearch("") },
                        Modifier.semantics { contentDescription = "Clear search" }) { Icon(Icons.Filled.Clear, null) } },
                    singleLine = true)
                IconButton(onToggle, Modifier.semantics { contentDescription = "Close search" }) { Icon(Icons.Filled.SearchOff, null) }
            } else {
                IconButton(onToggle, Modifier.semantics { contentDescription = "Open search" }) { Icon(Icons.Filled.Search, null) }
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 4.dp)) {
            item { FilterChip(filter.type == null, { onType(null) }, { Text("All") },
                modifier = Modifier.semantics { contentDescription = "Filter: All" }) }
            item { FilterChip(filter.type == TransactionType.EXPENSE,
                { onType(if (filter.type == TransactionType.EXPENSE) null else TransactionType.EXPENSE) },
                { Text("Expenses") }, leadingIcon = { Icon(Icons.Filled.TrendingDown, null, Modifier.size(16.dp)) },
                modifier = Modifier.semantics { contentDescription = "Filter: Expenses" }) }
            item { FilterChip(filter.type == TransactionType.INCOME,
                { onType(if (filter.type == TransactionType.INCOME) null else TransactionType.INCOME) },
                { Text("Income") }, leadingIcon = { Icon(Icons.Filled.TrendingUp, null, Modifier.size(16.dp)) },
                modifier = Modifier.semantics { contentDescription = "Filter: Income" }) }
            item { FilterChip(filter.type == TransactionType.TRANSFER,
                { onType(if (filter.type == TransactionType.TRANSFER) null else TransactionType.TRANSFER) },
                { Text("Transfers") }, modifier = Modifier.semantics { contentDescription = "Filter: Transfers" }) }
            if (filter != TransactionFilter()) {
                item { FilterChip(false, onClear, { Text("Clear") },
                    leadingIcon = { Icon(Icons.Filled.Clear, null, Modifier.size(16.dp)) },
                    modifier = Modifier.semantics { contentDescription = "Clear all filters" }) }
            }
        }
    }
}

@Composable
private fun DateHeader(label: String) {
    Text(label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).semantics { heading(); contentDescription = "Transactions for $label" })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeableTxnItem(txn: Transaction, onDelete: () -> Unit, onEdit: () -> Unit, onClick: () -> Unit) {
    val dismiss = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
        when (v) { SwipeToDismissBoxValue.StartToEnd -> { onEdit(); false }
            SwipeToDismissBoxValue.EndToStart -> { onDelete(); true }
            else -> false }
    })
    SwipeToDismissBox(state = dismiss, backgroundContent = {
        val dir = dismiss.dismissDirection
        val bg by animateColorAsState(when (dir) {
            SwipeToDismissBoxValue.StartToEnd -> MaterialTheme.colorScheme.primaryContainer
            SwipeToDismissBoxValue.EndToStart -> MaterialTheme.colorScheme.errorContainer
            else -> Color.Transparent }, label = "swipe-bg")
        val icon = when (dir) { SwipeToDismissBoxValue.StartToEnd -> Icons.Filled.Edit
            SwipeToDismissBoxValue.EndToStart -> Icons.Filled.Delete; else -> Icons.Filled.Edit }
        val tint = when (dir) { SwipeToDismissBoxValue.StartToEnd -> MaterialTheme.colorScheme.onPrimaryContainer
            SwipeToDismissBoxValue.EndToStart -> MaterialTheme.colorScheme.onErrorContainer; else -> Color.Transparent }
        val align = if (dir == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd
        Box(Modifier.fillMaxSize().background(bg, MaterialTheme.shapes.medium).padding(horizontal = 20.dp), contentAlignment = align) {
            Icon(icon, when (dir) { SwipeToDismissBoxValue.StartToEnd -> "Edit"; SwipeToDismissBoxValue.EndToStart -> "Delete"; else -> null }, tint = tint)
        }
    }, modifier = Modifier.semantics { contentDescription = buildTxnDesc(txn) }) { TxnListItem(txn, onClick) }
}

@Composable
private fun TxnListItem(txn: Transaction, onClick: () -> Unit) {
    val amt = CurrencyFormatter.format(txn.amount, txn.currency, showSign = true)
    val color = when (txn.type) { TransactionType.EXPENSE -> MaterialTheme.colorScheme.error
        TransactionType.INCOME -> Color(0xFF2E7D32); TransactionType.TRANSFER -> MaterialTheme.colorScheme.tertiary }
    val payee = txn.payee ?: "Unknown"
    val cat = SampleData.categoryMap[txn.categoryId]?.name ?: "Uncategorized"
    val acct = SampleData.accountMap[txn.accountId]?.name ?: "Unknown"
    Card(
        Modifier
            .fillMaxWidth()
            .clickable(onClickLabel = "Open details for $payee", onClick = onClick),
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(when (txn.type) { TransactionType.EXPENSE -> Icons.Filled.TrendingDown
                    TransactionType.INCOME -> Icons.Filled.TrendingUp; TransactionType.TRANSFER -> Icons.Filled.SwapHoriz },
                    null, tint = color, modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(payee, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row { Text(cat, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(" • $acct", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
            Text(amt, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = color)
        }
    }
}

@Composable
private fun TxnEmptyState(hasFilters: Boolean) {
    Box(Modifier.fillMaxWidth().padding(vertical = 48.dp).semantics {
        contentDescription = if (hasFilters) "No transactions match your filters" else "No transactions yet"
    }, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(if (hasFilters) Icons.Filled.FilterList else Icons.Filled.SwapHoriz, null, Modifier.size(48.dp),
                MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Text(if (hasFilters) "No matching transactions" else "No transactions yet", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text(if (hasFilters) "Try adjusting your filters" else "Add your first transaction to get started",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun buildTxnDesc(txn: Transaction): String {
    val amt = CurrencyFormatter.format(txn.amount, txn.currency, showSign = true)
    return "Transaction: $amt at ${txn.payee ?: "Unknown"}, ${txn.date}"
}

@Preview(showBackground = true, showSystemUi = true, name = "Transactions - Light")
@Preview(showBackground = true, showSystemUi = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Transactions - Dark")
@Composable
private fun TransactionsPreview() {
    FinanceTheme(dynamicColor = false) {
        TransactionsContent(
            TransactionsUiState(isLoading = false, dateGroups = listOf(
                TransactionDateGroup(kotlinx.datetime.LocalDate(2025, 3, 6), "Today", SampleData.transactions.take(3)),
                TransactionDateGroup(kotlinx.datetime.LocalDate(2025, 3, 5), "Yesterday", SampleData.transactions.drop(3).take(3))),
                filter = TransactionFilter(), totalCount = 20),
            {}, {}, {}, {}, {}, {}, {}, {}, {})
    }
}

@Preview(showBackground = true, name = "Transactions Empty - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Transactions Empty - Dark")
@Composable
private fun TxnEmptyPreview() { FinanceTheme(dynamicColor = false) { TxnEmptyState(false) } }

@Preview(showBackground = true, name = "Transactions Filtered Empty - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Transactions Filtered Empty - Dark")
@Composable
private fun TxnFilteredEmptyPreview() { FinanceTheme(dynamicColor = false) { TxnEmptyState(true) } }
