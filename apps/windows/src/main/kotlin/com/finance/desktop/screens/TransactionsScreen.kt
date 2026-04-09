// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.TransactionsViewModel
import com.finance.models.Transaction
import com.finance.models.TransactionType

// =============================================================================
// Local UI-only types for sorting (not duplicated from KMP models)
// =============================================================================

private enum class SortColumn { DATE, PAYEE, AMOUNT }
private enum class SortDirection { ASC, DESC }

// =============================================================================
// Transactions Screen — Full-width Table (KMP shared models)
// =============================================================================

/**
 * Full-width transaction table for the desktop Finance application.
 *
 * Data flows from [TransactionsViewModel], which loads from the KMP shared
 * repository layer. Search and type filtering are delegated to the ViewModel;
 * column sorting is applied locally in the UI layer.
 *
 * Features:
 * - Search bar for filtering by payee (delegated to ViewModel)
 * - Type filter chips (All / Expenses / Income / Transfers)
 * - Sortable columns (click header to sort ascending/descending)
 * - Right-click context menus on each row
 * - Mouse-friendly row spacing and hover-ready layout
 *
 * Narrator: Every row is described as "Transaction: amount at payee, date".
 * Sort controls announce column name and direction.
 */
@Composable
fun TransactionsScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<TransactionsViewModel>()
    val state by viewModel.uiState.collectAsState()

    var sortColumn by remember { mutableStateOf(SortColumn.DATE) }
    var sortDirection by remember { mutableStateOf(SortDirection.DESC) }

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading transactions"
                },
            )
        }
        return
    }

    // Apply local sorting on top of ViewModel-filtered data
    val sortedTransactions by remember(state.transactions, sortColumn, sortDirection) {
        derivedStateOf {
            state.transactions.sortedWith(
                compareBy<Transaction> { txn ->
                    when (sortColumn) {
                        SortColumn.DATE -> txn.date.toString()
                        SortColumn.PAYEE -> (txn.payee ?: "").lowercase()
                        SortColumn.AMOUNT -> txn.amount.amount.toString().padStart(20)
                    }
                }.let { if (sortDirection == SortDirection.DESC) it.reversed() else it },
            )
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Transactions screen" },
    ) {
        // Header
        Text(
            text = "Transactions",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Transactions heading"
            },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // Search + filters bar
        SearchAndFilterBar(
            searchQuery = state.filter.searchQuery,
            onSearchChange = { viewModel.updateSearch(it) },
            typeFilter = state.filter.type,
            onTypeFilterChange = { viewModel.setTypeFilter(it) },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // Table
        Surface(
            modifier = Modifier.fillMaxSize(),
            shape = MaterialTheme.shapes.medium,
            tonalElevation = 1.dp,
        ) {
            Column {
                // Table header
                TableHeader(
                    sortColumn = sortColumn,
                    sortDirection = sortDirection,
                    onSort = { column ->
                        if (sortColumn == column) {
                            sortDirection =
                                if (sortDirection == SortDirection.ASC) SortDirection.DESC
                                else SortDirection.ASC
                        } else {
                            sortColumn = column
                            sortDirection = SortDirection.ASC
                        }
                    },
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                // Table body
                if (sortedTransactions.isEmpty()) {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = if (state.filter.searchQuery.isNotBlank() || state.filter.type != null)
                                    Icons.Filled.FilterList else Icons.Filled.SwapHoriz,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                            Text(
                                text = if (state.filter.searchQuery.isNotBlank() || state.filter.type != null)
                                    "No matching transactions" else "No transactions yet",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.semantics {
                                    contentDescription = "No matching transactions"
                                },
                            )
                        }
                    }
                } else {
                    LazyColumn {
                        items(sortedTransactions, key = { it.id.value }) { txn ->
                            TransactionTableRow(txn)
                            HorizontalDivider(
                                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                            )
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// Search & Filter Bar
// =============================================================================

@Composable
private fun SearchAndFilterBar(
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    typeFilter: TransactionType?,
    onTypeFilterChange: (TransactionType?) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Search field
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchChange,
            modifier = Modifier
                .weight(1f)
                .semantics {
                    contentDescription = "Search transactions by payee or category"
                },
            placeholder = { Text("Search payees, categories\u2026") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (searchQuery.isNotEmpty()) {
                    IconButton(
                        onClick = { onSearchChange("") },
                        modifier = Modifier.semantics {
                            contentDescription = "Clear search"
                        },
                    ) {
                        Icon(Icons.Filled.Clear, contentDescription = null)
                    }
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(8.dp),
        )

        // Filter chips
        Row(horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm)) {
            FilterChip(
                selected = typeFilter == null,
                onClick = { onTypeFilterChange(null) },
                label = { Text("All") },
                modifier = Modifier.semantics {
                    contentDescription = "Filter: All types"
                },
            )
            FilterChip(
                selected = typeFilter == TransactionType.EXPENSE,
                onClick = {
                    onTypeFilterChange(
                        if (typeFilter == TransactionType.EXPENSE) null
                        else TransactionType.EXPENSE,
                    )
                },
                label = { Text("Expenses") },
                leadingIcon = {
                    Icon(
                        Icons.Filled.TrendingDown,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
                modifier = Modifier.semantics {
                    contentDescription = "Filter: Expenses"
                },
            )
            FilterChip(
                selected = typeFilter == TransactionType.INCOME,
                onClick = {
                    onTypeFilterChange(
                        if (typeFilter == TransactionType.INCOME) null
                        else TransactionType.INCOME,
                    )
                },
                label = { Text("Income") },
                leadingIcon = {
                    Icon(
                        Icons.Filled.TrendingUp,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
                modifier = Modifier.semantics {
                    contentDescription = "Filter: Income"
                },
            )
            FilterChip(
                selected = typeFilter == TransactionType.TRANSFER,
                onClick = {
                    onTypeFilterChange(
                        if (typeFilter == TransactionType.TRANSFER) null
                        else TransactionType.TRANSFER,
                    )
                },
                label = { Text("Transfers") },
                leadingIcon = {
                    Icon(
                        Icons.Filled.SwapHoriz,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
                modifier = Modifier.semantics {
                    contentDescription = "Filter: Transfers"
                },
            )
        }
    }
}

// =============================================================================
// Table Header — sortable columns
// =============================================================================

@Composable
private fun TableHeader(
    sortColumn: SortColumn,
    sortDirection: SortDirection,
    onSort: (SortColumn) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(
                horizontal = FinanceDesktopTheme.spacing.lg,
                vertical = FinanceDesktopTheme.spacing.md,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SortableColumnHeader(
            "Date", SortColumn.DATE, sortColumn, sortDirection, onSort, Modifier.width(120.dp),
        )
        SortableColumnHeader(
            "Payee", SortColumn.PAYEE, sortColumn, sortDirection, onSort, Modifier.weight(1f),
        )
        SortableColumnHeader(
            "Amount", SortColumn.AMOUNT, sortColumn, sortDirection, onSort,
            Modifier.width(130.dp),
        )
    }
}

@Composable
private fun SortableColumnHeader(
    label: String,
    column: SortColumn,
    currentSort: SortColumn,
    direction: SortDirection,
    onSort: (SortColumn) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isActive = currentSort == column
    val dirLabel = if (isActive) {
        if (direction == SortDirection.ASC) "ascending" else "descending"
    } else {
        "not sorted"
    }

    Row(
        modifier = modifier
            .clickable { onSort(column) }
            .padding(vertical = FinanceDesktopTheme.spacing.xs)
            .semantics {
                contentDescription = "$label column, $dirLabel. Click to sort."
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium,
            color = if (isActive) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurface,
        )
        if (isActive) {
            Spacer(Modifier.width(4.dp))
            Icon(
                imageVector = if (direction == SortDirection.ASC) Icons.Filled.ArrowUpward
                else Icons.Filled.ArrowDownward,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

// =============================================================================
// Table Row
// =============================================================================

@Composable
private fun TransactionTableRow(txn: Transaction) {
    val amountColor = when (txn.type) {
        TransactionType.EXPENSE -> MaterialTheme.colorScheme.error
        TransactionType.INCOME -> Color(0xFF2E7D32)
        TransactionType.TRANSFER -> MaterialTheme.colorScheme.tertiary
    }
    val typeIcon = when (txn.type) {
        TransactionType.EXPENSE -> Icons.Filled.TrendingDown
        TransactionType.INCOME -> Icons.Filled.TrendingUp
        TransactionType.TRANSFER -> Icons.Filled.SwapHoriz
    }
    val formattedAmount = CurrencyFormatter.format(txn.amount, txn.currency, showSign = true)
    val payee = txn.payee ?: "Unknown"

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("View Details") { /* view */ },
                ContextMenuItem("Edit Transaction") { /* edit */ },
                ContextMenuItem("Duplicate") { /* duplicate */ },
                ContextMenuItem("Copy Amount") { /* copy */ },
                ContextMenuItem("Delete") { /* delete */ },
            )
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { /* navigate to detail */ }
                .padding(
                    horizontal = FinanceDesktopTheme.spacing.lg,
                    vertical = FinanceDesktopTheme.spacing.md,
                )
                .semantics {
                    contentDescription =
                        "Transaction: $formattedAmount at $payee, ${txn.date}"
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Date
            Text(
                text = txn.date.toString(),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.width(120.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Payee (with type icon)
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = typeIcon,
                    contentDescription = null,
                    tint = amountColor,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = payee,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            // Amount
            Text(
                text = formattedAmount,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = amountColor,
                modifier = Modifier.width(130.dp),
            )
        }
    }
}
