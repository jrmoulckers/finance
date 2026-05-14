// SPDX-License-Identifier: BUSL-1.1

@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.ui.screens.currency

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.core.multicurrency.CurrencyInfo
import com.finance.models.types.Currency
import org.koin.compose.viewmodel.koinViewModel

// ─────────────────────────────────────────────────────────────────────────────
// Currency Picker Screen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searchable currency selector screen.
 *
 * Displays the full ISO 4217 currency catalog with codes, names, and symbols.
 * Supports real-time filtering via a search text field. The selected currency
 * is indicated with a check icon.
 *
 * @param onBack Called when the user navigates back.
 * @param onCurrencySelected Called when a currency is chosen; receives the [Currency].
 * @param viewModel The [CurrencyViewModel] providing picker state.
 */
@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
fun CurrencyPickerScreen(
    onBack: () -> Unit,
    onCurrencySelected: (Currency) -> Unit,
    viewModel: CurrencyViewModel = koinViewModel(),
) {
    val state by viewModel.pickerState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Select Currency",
                        modifier = Modifier.semantics { heading() },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Navigate back"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            // ── Search field ────────────────────────────────────────────
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = viewModel::onSearchQueryChanged,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .semantics {
                        contentDescription = "Search currencies by code or name"
                    },
                placeholder = { Text("Search currencies…") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Search,
                        contentDescription = null,
                    )
                },
                singleLine = true,
            )

            // ── Content ─────────────────────────────────────────────────
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

                state.filteredCurrencies.isEmpty() -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .semantics {
                                contentDescription = "No currencies match your search"
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "No currencies found",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                else -> {
                    LazyColumn(
                        contentPadding = PaddingValues(vertical = 4.dp),
                    ) {
                        items(
                            items = state.filteredCurrencies,
                            key = { it.code },
                        ) { currencyInfo ->
                            CurrencyListItem(
                                info = currencyInfo,
                                isSelected = state.selectedCurrency?.code == currencyInfo.code,
                                onClick = {
                                    val currency = Currency(currencyInfo.code)
                                    viewModel.selectCurrency(currency)
                                    onCurrencySelected(currency)
                                },
                            )
                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = 16.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency List Item
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row in the currency picker list.
 *
 * Displays the currency symbol, code, full name, and a check mark if selected.
 *
 * @param info The [CurrencyInfo] to display.
 * @param isSelected Whether this currency is currently selected.
 * @param onClick Called when the user taps this row.
 */
@Composable
private fun CurrencyListItem(
    info: CurrencyInfo,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics {
                contentDescription = "${info.displayName}, ${info.code}. " +
                    if (isSelected) "Currently selected" else "Tap to select"
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Currency symbol badge
        Box(
            modifier = Modifier
                .size(40.dp)
                .semantics { contentDescription = "Currency symbol ${info.symbol}" },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = info.symbol,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Code and name
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = info.code,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = info.displayName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Selection indicator
        if (isSelected) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = "Selected",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}
