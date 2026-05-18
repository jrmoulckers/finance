// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.components.filter

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.models.TransactionType
import kotlinx.datetime.LocalDate

/**
 * A collapsible advanced filter bar for the Transactions screen.
 *
 * Features:
 * - Toggle button showing active filter count as a badge
 * - Expandable panel with date range, category, account, amount, type, status filters
 * - Sort field and direction controls
 * - Active filter chips with individual remove buttons
 * - "Clear all" action
 *
 * Narrator: Panel expansion state and active filter count are announced.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilterBar(
    filter: AdvancedFilter,
    sortConfig: SortConfig,
    availableCategories: List<String>,
    availableAccounts: List<String>,
    onFilterChange: (AdvancedFilter) -> Unit,
    onSortChange: (SortConfig) -> Unit,
    onClearAll: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }

    Column(modifier = modifier.fillMaxWidth()) {
        // Toggle row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Filter toggle button with badge
            Row(verticalAlignment = Alignment.CenterVertically) {
                BadgedBox(
                    badge = {
                        if (filter.activeCount > 0) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.primary,
                                contentColor = MaterialTheme.colorScheme.onPrimary,
                            ) {
                                Text(
                                    text = filter.activeCount.toString(),
                                    modifier = Modifier.semantics {
                                        contentDescription =
                                            "${filter.activeCount} active filters"
                                    },
                                )
                            }
                        }
                    },
                ) {
                    IconButton(
                        onClick = { expanded = !expanded },
                        modifier = Modifier.semantics {
                            contentDescription = if (expanded) {
                                "Collapse filter panel"
                            } else {
                                "Expand filter panel, ${filter.activeCount} active filters"
                            }
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.FilterList,
                            contentDescription = null,
                        )
                    }
                }

                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))

                Text(
                    text = "Filters",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium,
                )
            }

            // Sort controls
            SortControls(
                sortConfig = sortConfig,
                onSortChange = onSortChange,
            )
        }

        // Active filter chips
        if (filter.activeCount > 0) {
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            ActiveFilterChips(
                filter = filter,
                onFilterChange = onFilterChange,
                onClearAll = onClearAll,
            )
        }

        // Expandable filter panel
        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(),
            exit = shrinkVertically(),
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = FinanceDesktopTheme.spacing.md),
                shape = MaterialTheme.shapes.medium,
                tonalElevation = 2.dp,
            ) {
                FilterPanelContent(
                    filter = filter,
                    availableCategories = availableCategories,
                    availableAccounts = availableAccounts,
                    onFilterChange = onFilterChange,
                )
            }
        }
    }
}

/**
 * Sort controls with field dropdown and direction toggle.
 */
@Composable
private fun SortControls(
    sortConfig: SortConfig,
    onSortChange: (SortConfig) -> Unit,
) {
    var showSortMenu by remember { mutableStateOf(false) }

    Row(verticalAlignment = Alignment.CenterVertically) {
        // Sort field dropdown
        AssistChip(
            onClick = { showSortMenu = true },
            label = { Text("Sort: ${sortConfig.field.label}") },
            leadingIcon = {
                Icon(
                    Icons.Filled.Sort,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
            },
            modifier = Modifier.semantics {
                contentDescription =
                    "Sort by ${sortConfig.field.label}, ${sortConfig.direction.name.lowercase()}"
            },
        )

        DropdownMenu(
            expanded = showSortMenu,
            onDismissRequest = { showSortMenu = false },
        ) {
            SortField.entries.forEach { field ->
                DropdownMenuItem(
                    text = { Text(field.label) },
                    onClick = {
                        onSortChange(sortConfig.copy(field = field))
                        showSortMenu = false
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Sort by ${field.label}"
                    },
                )
            }
        }

        Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))

        // Direction toggle
        IconButton(
            onClick = {
                val newDirection = if (sortConfig.direction == SortDirection.ASCENDING) {
                    SortDirection.DESCENDING
                } else {
                    SortDirection.ASCENDING
                }
                onSortChange(sortConfig.copy(direction = newDirection))
            },
            modifier = Modifier.semantics {
                contentDescription = if (sortConfig.direction == SortDirection.ASCENDING) {
                    "Sort ascending, click to change to descending"
                } else {
                    "Sort descending, click to change to ascending"
                }
            },
        ) {
            Icon(
                imageVector = if (sortConfig.direction == SortDirection.ASCENDING) {
                    Icons.Filled.ArrowUpward
                } else {
                    Icons.Filled.ArrowDownward
                },
                contentDescription = null,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/**
 * Active filter chips showing current filters with remove actions.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ActiveFilterChips(
    filter: AdvancedFilter,
    onFilterChange: (AdvancedFilter) -> Unit,
    onClearAll: () -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
    ) {
        // Type filter chip
        if (filter.type != null) {
            InputChip(
                selected = true,
                onClick = { onFilterChange(filter.copy(type = null)) },
                label = { Text("Type: ${filter.type.name.lowercase().replaceFirstChar { it.uppercase() }}") },
                trailingIcon = {
                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                },
                modifier = Modifier.semantics {
                    contentDescription = "Remove type filter"
                },
            )
        }

        // Date range chip
        if (filter.dateStart != null || filter.dateEnd != null) {
            val dateLabel = buildString {
                append("Date: ")
                if (filter.dateStart != null) append(filter.dateStart)
                append(" – ")
                if (filter.dateEnd != null) append(filter.dateEnd)
            }
            InputChip(
                selected = true,
                onClick = { onFilterChange(filter.copy(dateStart = null, dateEnd = null)) },
                label = { Text(dateLabel) },
                trailingIcon = {
                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                },
                modifier = Modifier.semantics {
                    contentDescription = "Remove date range filter"
                },
            )
        }

        // Category chips
        filter.categories.forEach { category ->
            InputChip(
                selected = true,
                onClick = {
                    onFilterChange(filter.copy(categories = filter.categories - category))
                },
                label = { Text(category) },
                trailingIcon = {
                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                },
                modifier = Modifier.semantics {
                    contentDescription = "Remove category filter: $category"
                },
            )
        }

        // Account chips
        filter.accounts.forEach { account ->
            InputChip(
                selected = true,
                onClick = {
                    onFilterChange(filter.copy(accounts = filter.accounts - account))
                },
                label = { Text(account) },
                trailingIcon = {
                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                },
                modifier = Modifier.semantics {
                    contentDescription = "Remove account filter: $account"
                },
            )
        }

        // Amount range chip
        if (filter.amountMin != null || filter.amountMax != null) {
            val amountLabel = buildString {
                append("Amount: ")
                if (filter.amountMin != null) append("$${filter.amountMin}")
                append(" – ")
                if (filter.amountMax != null) append("$${filter.amountMax}")
            }
            InputChip(
                selected = true,
                onClick = { onFilterChange(filter.copy(amountMin = null, amountMax = null)) },
                label = { Text(amountLabel) },
                trailingIcon = {
                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                },
                modifier = Modifier.semantics {
                    contentDescription = "Remove amount range filter"
                },
            )
        }

        // Status chip
        if (filter.status != null) {
            InputChip(
                selected = true,
                onClick = { onFilterChange(filter.copy(status = null)) },
                label = { Text("Status: ${filter.status.label}") },
                trailingIcon = {
                    Icon(Icons.Filled.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                },
                modifier = Modifier.semantics {
                    contentDescription = "Remove status filter"
                },
            )
        }

        // Clear all button
        if (filter.activeCount > 1) {
            TextButton(
                onClick = onClearAll,
                modifier = Modifier.semantics {
                    contentDescription = "Clear all filters"
                },
            ) {
                Icon(
                    Icons.Filled.Clear,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(4.dp))
                Text("Clear all")
            }
        }
    }
}

/**
 * Expandable filter panel content with all filter controls.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FilterPanelContent(
    filter: AdvancedFilter,
    availableCategories: List<String>,
    availableAccounts: List<String>,
    onFilterChange: (AdvancedFilter) -> Unit,
) {
    Column(
        modifier = Modifier
            .padding(FinanceDesktopTheme.spacing.lg)
            .semantics { contentDescription = "Advanced filter panel" },
        verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
    ) {
        // Row 1: Date range
        Text(
            text = "Date Range",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
        ) {
            OutlinedTextField(
                value = filter.dateStart?.toString() ?: "",
                onValueChange = { value ->
                    val date = try {
                        LocalDate.parse(value)
                    } catch (_: Exception) {
                        null
                    }
                    onFilterChange(filter.copy(dateStart = date))
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Start date, format: YYYY-MM-DD" },
                label = { Text("From") },
                placeholder = { Text("YYYY-MM-DD") },
                singleLine = true,
            )
            OutlinedTextField(
                value = filter.dateEnd?.toString() ?: "",
                onValueChange = { value ->
                    val date = try {
                        LocalDate.parse(value)
                    } catch (_: Exception) {
                        null
                    }
                    onFilterChange(filter.copy(dateEnd = date))
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "End date, format: YYYY-MM-DD" },
                label = { Text("To") },
                placeholder = { Text("YYYY-MM-DD") },
                singleLine = true,
            )
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // Row 2: Type filter
        Text(
            text = "Transaction Type",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            TransactionType.entries.forEach { type ->
                FilterChip(
                    selected = filter.type == type,
                    onClick = {
                        onFilterChange(
                            filter.copy(type = if (filter.type == type) null else type),
                        )
                    },
                    label = { Text(type.name.lowercase().replaceFirstChar { it.uppercase() }) },
                    modifier = Modifier.semantics {
                        contentDescription = "Type filter: ${type.name.lowercase()}"
                    },
                )
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // Row 3: Categories (multi-select)
        Text(
            text = "Categories",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
        ) {
            availableCategories.forEach { category ->
                FilterChip(
                    selected = category in filter.categories,
                    onClick = {
                        val updated = if (category in filter.categories) {
                            filter.categories - category
                        } else {
                            filter.categories + category
                        }
                        onFilterChange(filter.copy(categories = updated))
                    },
                    label = { Text(category) },
                    modifier = Modifier.semantics {
                        contentDescription = "Category: $category"
                    },
                )
            }
            if (availableCategories.isEmpty()) {
                Text(
                    text = "No categories available",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // Row 4: Accounts (multi-select)
        Text(
            text = "Accounts",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
        ) {
            availableAccounts.forEach { account ->
                FilterChip(
                    selected = account in filter.accounts,
                    onClick = {
                        val updated = if (account in filter.accounts) {
                            filter.accounts - account
                        } else {
                            filter.accounts + account
                        }
                        onFilterChange(filter.copy(accounts = updated))
                    },
                    label = { Text(account) },
                    modifier = Modifier.semantics {
                        contentDescription = "Account: $account"
                    },
                )
            }
            if (availableAccounts.isEmpty()) {
                Text(
                    text = "No accounts available",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // Row 5: Amount range
        Text(
            text = "Amount Range",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
        ) {
            OutlinedTextField(
                value = filter.amountMin?.toString() ?: "",
                onValueChange = { value ->
                    val amount = value.toDoubleOrNull()
                    onFilterChange(filter.copy(amountMin = amount))
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Minimum amount" },
                label = { Text("Min") },
                placeholder = { Text("0.00") },
                singleLine = true,
            )
            OutlinedTextField(
                value = filter.amountMax?.toString() ?: "",
                onValueChange = { value ->
                    val amount = value.toDoubleOrNull()
                    onFilterChange(filter.copy(amountMax = amount))
                },
                modifier = Modifier
                    .weight(1f)
                    .semantics { contentDescription = "Maximum amount" },
                label = { Text("Max") },
                placeholder = { Text("1000.00") },
                singleLine = true,
            )
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

        // Row 6: Status
        Text(
            text = "Status",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
        ) {
            TransactionStatus.entries.forEach { status ->
                FilterChip(
                    selected = filter.status == status,
                    onClick = {
                        onFilterChange(
                            filter.copy(status = if (filter.status == status) null else status),
                        )
                    },
                    label = { Text(status.label) },
                    modifier = Modifier.semantics {
                        contentDescription = "Status filter: ${status.label}"
                    },
                )
            }
        }
    }
}
