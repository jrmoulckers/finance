// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components.search

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.SyncId

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Horizontally scrollable row of Material 3 [FilterChip]s.
 *
 * Each filter category renders a chip whose selected state reflects whether
 * the corresponding filter in [state] is non-null. A "Clear all" chip
 * appears whenever any filter is active.
 *
 * @param state       The composable [SearchFilterState] driving selection.
 * @param onDateRangeClick   Opens a date-range picker.
 * @param onCategoryClick    Opens a category multi-select.
 * @param onAmountRangeClick Opens an amount-range input.
 * @param onTypeClick        Opens a transaction-type selector.
 * @param onAccountClick     Opens an account selector.
 * @param modifier           Optional [Modifier].
 */
@Composable
fun FilterChipRow(
    state: SearchFilterState,
    onDateRangeClick: () -> Unit = {},
    onCategoryClick: () -> Unit = {},
    onAmountRangeClick: () -> Unit = {},
    onTypeClick: () -> Unit = {},
    onAccountClick: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // ---- Clear All chip (only shown when filters are active) ----------
        if (state.hasActiveFilters) {
            FilterChip(
                selected = false,
                onClick = { state.clearAll() },
                label = { Text("Clear all") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = null,
                        modifier = Modifier.size(FilterChipDefaults.IconSize),
                    )
                },
                modifier = Modifier.semantics {
                    contentDescription = "Clear all filters"
                },
            )

            Spacer(modifier = Modifier.width(4.dp))
        }

        // ---- Date range ---------------------------------------------------
        FilterChipWithBadge(
            label = "Date",
            icon = Icons.Default.CalendarToday,
            isSelected = state.dateRange != null,
            badgeCount = if (state.dateRange != null) 1 else 0,
            accessibilityLabel = dateRangeAccessibilityLabel(state.dateRange),
            onClick = onDateRangeClick,
        )

        // ---- Category -----------------------------------------------------
        val categoryCount = state.category?.selectedCategoryIds?.size ?: 0
        FilterChipWithBadge(
            label = "Category",
            icon = Icons.Default.Category,
            isSelected = state.category != null,
            badgeCount = categoryCount,
            accessibilityLabel = if (categoryCount > 0)
                "Category filter, $categoryCount selected"
            else
                "Category filter",
            onClick = onCategoryClick,
        )

        // ---- Amount range -------------------------------------------------
        FilterChipWithBadge(
            label = "Amount",
            icon = Icons.Default.AttachMoney,
            isSelected = state.amountRange != null,
            badgeCount = if (state.amountRange != null) 1 else 0,
            accessibilityLabel = amountRangeAccessibilityLabel(state.amountRange),
            onClick = onAmountRangeClick,
        )

        // ---- Transaction type ---------------------------------------------
        val typeCount = state.transactionType?.selectedTypes?.size ?: 0
        FilterChipWithBadge(
            label = "Type",
            icon = Icons.Default.SwapHoriz,
            isSelected = state.transactionType != null,
            badgeCount = typeCount,
            accessibilityLabel = if (typeCount > 0)
                "Transaction type filter, $typeCount selected"
            else
                "Transaction type filter",
            onClick = onTypeClick,
        )

        // ---- Account ------------------------------------------------------
        val accountCount = state.account?.selectedAccountIds?.size ?: 0
        FilterChipWithBadge(
            label = "Account",
            icon = Icons.Default.CreditCard,
            isSelected = state.account != null,
            badgeCount = accountCount,
            accessibilityLabel = if (accountCount > 0)
                "Account filter, $accountCount selected"
            else
                "Account filter",
            onClick = onAccountClick,
        )
    }
}

// ---------------------------------------------------------------------------
// Internal composables
// ---------------------------------------------------------------------------

/**
 * A [FilterChip] wrapped in a [BadgedBox] that shows a count badge when
 * [badgeCount] > 0.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FilterChipWithBadge(
    label: String,
    icon: ImageVector,
    isSelected: Boolean,
    badgeCount: Int,
    accessibilityLabel: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BadgedBox(
        badge = {
            if (badgeCount > 0) {
                Badge(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ) {
                    Text(
                        text = badgeCount.toString(),
                        modifier = Modifier.semantics {
                            contentDescription = "$badgeCount active"
                        },
                    )
                }
            }
        },
        modifier = modifier,
    ) {
        FilterChip(
            selected = isSelected,
            onClick = onClick,
            label = { Text(label) },
            leadingIcon = {
                Icon(
                    imageVector = icon,
                    contentDescription = null, // decorative; chip has its own label
                    modifier = Modifier.size(FilterChipDefaults.IconSize),
                )
            },
            modifier = Modifier.semantics {
                contentDescription = accessibilityLabel
            },
        )
    }
}

// ---------------------------------------------------------------------------
// Accessibility helpers
// ---------------------------------------------------------------------------

private fun dateRangeAccessibilityLabel(dateRange: DateRangeFilter?): String =
    if (dateRange == null) {
        "Date filter"
    } else {
        val presetLabel = when (dateRange.preset) {
            DateRangePreset.TODAY -> "today"
            DateRangePreset.THIS_WEEK -> "this week"
            DateRangePreset.THIS_MONTH -> "this month"
            DateRangePreset.CUSTOM -> "custom range"
        }
        "Date filter, $presetLabel"
    }

private fun amountRangeAccessibilityLabel(amountRange: AmountRangeFilter?): String =
    if (amountRange == null) {
        "Amount filter"
    } else {
        buildString {
            append("Amount filter")
            amountRange.min?.let { append(", minimum ${it.amount} cents") }
            amountRange.max?.let { append(", maximum ${it.amount} cents") }
        }
    }

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(name = "FilterChipRow — no active filters", showBackground = true)
@Composable
private fun FilterChipRowInactivePreview() {
    MaterialTheme {
        val state = rememberSearchFilterState()
        FilterChipRow(state = state)
    }
}

@Preview(name = "FilterChipRow — mixed active/inactive", showBackground = true)
@Composable
private fun FilterChipRowMixedPreview() {
    MaterialTheme {
        val state = rememberSearchFilterState().apply {
            dateRange = DateRangeFilter(preset = DateRangePreset.THIS_MONTH)
            category = CategoryFilter(
                selectedCategoryIds = setOf(
                    SyncId("cat-1"),
                    SyncId("cat-2"),
                    SyncId("cat-3"),
                ),
            )
            transactionType = TransactionTypeFilter(
                selectedTypes = setOf(TransactionType.EXPENSE),
            )
        }
        FilterChipRow(state = state)
    }
}

@Preview(name = "FilterChipRow — all active", showBackground = true)
@Composable
private fun FilterChipRowAllActivePreview() {
    MaterialTheme {
        val state = rememberSearchFilterState().apply {
            query = "Grocery"
            dateRange = DateRangeFilter(preset = DateRangePreset.TODAY)
            category = CategoryFilter(
                selectedCategoryIds = setOf(SyncId("cat-1")),
            )
            amountRange = AmountRangeFilter(
                min = Cents(500L),
                max = Cents(10_000L),
            )
            transactionType = TransactionTypeFilter(
                selectedTypes = setOf(
                    TransactionType.EXPENSE,
                    TransactionType.INCOME,
                ),
            )
            account = AccountFilter(
                selectedAccountIds = setOf(SyncId("acct-1")),
            )
        }
        FilterChipRow(state = state)
    }
}
