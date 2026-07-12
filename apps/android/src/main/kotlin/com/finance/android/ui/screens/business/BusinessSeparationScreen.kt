// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.accessibility.financeSemantic
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Business vs personal money separation screen (#2182).
 *
 * Shows a combined and a business-only summary side-by-side, lets the owner
 * filter every rollup by scope, and flags ambiguous transactions for cleanup.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BusinessSeparationScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: BusinessSeparationViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Business & Personal",
                        modifier = Modifier.semantics {
                            contentDescription = "Business and personal money"
                            heading()
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Navigate back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        modifier = modifier,
    ) { padding ->
        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item(key = "side-by-side") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    state.combined?.let {
                        SummaryCard(title = "Combined", summary = it, modifier = Modifier.weight(1f))
                    }
                    state.businessOnly?.let {
                        SummaryCard(title = "Truck only", summary = it, modifier = Modifier.weight(1f))
                    }
                }
            }

            item(key = "filter") {
                ScopeFilterRow(selected = state.filter, onSelect = viewModel::setFilter)
            }

            if (state.reviewCount > 0) {
                item(key = "review-header") {
                    Text(
                        "${state.reviewCount} to review",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                }
            }

            items(state.transactions, key = { it.id }) { txn ->
                TransactionRow(txn = txn, onReclassify = viewModel::reclassify)
            }
        }
    }
}

@Composable
private fun ScopeFilterRow(
    selected: ScopeFilter,
    onSelect: (ScopeFilter) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ScopeFilter.entries.forEach { filter ->
            FilterChip(
                selected = filter == selected,
                onClick = { onSelect(filter) },
                label = { Text(filter.label) },
                modifier = Modifier.financeSemantic(filter.contentDescription),
            )
        }
    }
}

@Composable
private fun SummaryCard(
    title: String,
    summary: ScopeSummaryUi,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(
                summary.netFormatted,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = if (summary.netIsPositive) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.error
                },
                modifier = Modifier.financeSemantic("Net ${summary.netFormatted}"),
            )
            Text(
                "In ${summary.incomeFormatted} · Out ${summary.expenseFormatted}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                "${summary.transactionCount} transactions",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TransactionRow(
    txn: ScopedTransactionUi,
    onReclassify: (String, MoneyScope) -> Unit,
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(txn.payee, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                    Text(
                        listOfNotNull(txn.scope.label, txn.categoryLabel).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    (if (txn.isIncome) "+" else "−") + txn.amountFormatted,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = if (txn.isIncome) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                )
            }
            if (txn.needsReview) {
                Text(
                    "Flagged as split — classify it:",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { onReclassify(txn.id, MoneyScope.BUSINESS) },
                        modifier = Modifier.financeSemantic("Mark ${txn.payee} as business"),
                    ) { Text("Business") }
                    OutlinedButton(
                        onClick = { onReclassify(txn.id, MoneyScope.PERSONAL) },
                        modifier = Modifier.financeSemantic("Mark ${txn.payee} as personal"),
                    ) { Text("Personal") }
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun BusinessSeparationScreenPreview() {
    FinanceTheme {
        BusinessSeparationScreen()
    }
}
