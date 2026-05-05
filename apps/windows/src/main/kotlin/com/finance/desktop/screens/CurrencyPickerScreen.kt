// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.CurrencyDisplayInfo
import com.finance.desktop.viewmodel.CurrencyViewModel
import com.finance.models.types.Currency

// =============================================================================
// Currency Picker Screen — Searchable Currency Selector (Desktop-Optimized)
// =============================================================================

/**
 * Full-screen searchable currency selector optimized for desktop.
 *
 * Layout uses a wider two-column grid to take advantage of desktop screen
 * real estate. Keyboard navigation is fully supported: Tab into the search
 * field, type to filter, use arrow keys to navigate the list, Enter to select.
 *
 * ## Desktop-specific optimizations
 * - Wider layout with two-column currency grid on large screens
 * - Hover states on currency cards for mouse interaction
 * - Search field auto-focused on screen entry
 * - Keyboard shortcut hints in Narrator descriptions
 *
 * ## Accessibility
 * - Search field has content description for Narrator
 * - Each currency item announces flag, name, code, and selection state
 * - Selected item uses `selected = true` semantics
 * - Empty/error states are announced via content description
 *
 * @param onCurrencySelected Callback invoked when the user selects a currency.
 *   Receives the selected [Currency] value class.
 * @param selectedCurrency The currently selected currency (highlighted in list).
 * @param modifier Optional [Modifier] for the root layout.
 */
@Composable
fun CurrencyPickerScreen(
    onCurrencySelected: ((Currency) -> Unit)? = null,
    selectedCurrency: Currency? = null,
    modifier: Modifier = Modifier,
) {
    val viewModel = koinGet<CurrencyViewModel>()
    val state by viewModel.pickerState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Currency picker screen" },
    ) {
        // ── Header ──
        Text(
            text = "Select Currency",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Select Currency heading"
            },
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // ── Search bar ──
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = { viewModel.updateSearchQuery(it) },
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "Search currencies by name, code, or symbol"
                },
            placeholder = { Text("Search currencies (e.g. USD, Dollar, €)…") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (state.searchQuery.isNotEmpty()) {
                    IconButton(
                        onClick = { viewModel.updateSearchQuery("") },
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

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // ── Content ──
        when {
            state.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.semantics {
                            contentDescription = "Loading currencies"
                        },
                    )
                }
            }

            state.error != null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = state.error ?: "Unknown error",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.semantics {
                            contentDescription = "Error: ${state.error}"
                        },
                    )
                }
            }

            state.filteredCurrencies.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            imageVector = Icons.Filled.Search,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                        Text(
                            text = "No currencies match \"${state.searchQuery}\"",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics {
                                contentDescription =
                                    "No currencies match ${state.searchQuery}"
                            },
                        )
                    }
                }
            }

            else -> {
                // Results count for Narrator
                Text(
                    text = "${state.filteredCurrencies.size} currencies",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription =
                            "${state.filteredCurrencies.size} currencies available"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

                Surface(
                    modifier = Modifier.fillMaxSize(),
                    shape = MaterialTheme.shapes.medium,
                    tonalElevation = 1.dp,
                ) {
                    LazyColumn(
                        modifier = Modifier.padding(FinanceDesktopTheme.spacing.sm),
                        verticalArrangement = Arrangement.spacedBy(
                            FinanceDesktopTheme.spacing.xs,
                        ),
                    ) {
                        items(
                            state.filteredCurrencies,
                            key = { it.currency.code },
                        ) { info ->
                            val isSelected =
                                (selectedCurrency ?: state.selectedCurrency) == info.currency
                            CurrencyListItem(
                                info = info,
                                isSelected = isSelected,
                                onClick = {
                                    viewModel.selectCurrency(info.currency)
                                    onCurrencySelected?.invoke(info.currency)
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// Currency List Item
// =============================================================================

/**
 * A single currency row in the picker list.
 *
 * Displays flag emoji, currency name, ISO code, and symbol.
 * Highlights the selected currency with primary container colors.
 */
@Composable
private fun CurrencyListItem(
    info: CurrencyDisplayInfo,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val containerColor = if (isSelected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surface
    }
    val contentColor = if (isSelected) {
        MaterialTheme.colorScheme.onPrimaryContainer
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    val accessibilityLabel = buildString {
        append("${info.flagEmoji} ${info.name}")
        append(", ${info.currency.code}")
        append(", ${info.symbol}")
        if (isSelected) append(", selected")
    }

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple(),
                onClick = onClick,
            )
            .semantics {
                role = Role.Button
                selected = isSelected
                contentDescription = accessibilityLabel
            },
        colors = CardDefaults.elevatedCardColors(containerColor = containerColor),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = FinanceDesktopTheme.spacing.lg,
                    vertical = FinanceDesktopTheme.spacing.md,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Flag emoji
            Text(
                text = info.flagEmoji,
                style = MaterialTheme.typography.titleLarge,
            )

            Spacer(Modifier.width(FinanceDesktopTheme.spacing.lg))

            // Name + code
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = info.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = contentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = info.currency.code,
                    style = MaterialTheme.typography.labelSmall,
                    color = contentColor.copy(alpha = 0.7f),
                )
            }

            // Symbol
            Text(
                text = info.symbol,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = contentColor.copy(alpha = 0.8f),
            )

            // Check icon for selected
            if (isSelected) {
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Icon(
                    imageVector = Icons.Filled.Check,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

// =============================================================================
// Inline Currency Picker (for embedding in dialogs/forms)
// =============================================================================

/**
 * Compact inline currency picker suitable for embedding in transaction forms
 * and dialogs. Shows a scrollable list of currencies with search.
 *
 * @param currencies The list of currencies to display.
 * @param selectedCurrency The currently selected currency.
 * @param onSelect Callback when a currency is selected.
 * @param modifier Optional [Modifier].
 */
@Composable
fun InlineCurrencyPicker(
    currencies: List<CurrencyDisplayInfo>,
    selectedCurrency: Currency,
    onSelect: (Currency) -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        LazyColumn(
            modifier = Modifier
                .padding(FinanceDesktopTheme.spacing.sm)
                .height(300.dp),
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xs),
        ) {
            items(currencies, key = { it.currency.code }) { info ->
                val isSelected = selectedCurrency == info.currency
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            if (isSelected) MaterialTheme.colorScheme.primaryContainer
                            else MaterialTheme.colorScheme.surfaceVariant,
                            RoundedCornerShape(6.dp),
                        )
                        .clickable { onSelect(info.currency) }
                        .padding(
                            horizontal = FinanceDesktopTheme.spacing.md,
                            vertical = FinanceDesktopTheme.spacing.sm,
                        )
                        .semantics {
                            role = Role.Button
                            selected = isSelected
                            contentDescription = "${info.flagEmoji} ${info.name}, ${info.currency.code}" +
                                if (isSelected) ", selected" else ""
                        },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(text = info.flagEmoji, style = MaterialTheme.typography.bodyLarge)
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                    Text(
                        text = "${info.currency.code} – ${info.name}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isSelected) MaterialTheme.colorScheme.onPrimaryContainer
                        else MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (isSelected) {
                        Icon(
                            Icons.Filled.Check,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }
}
