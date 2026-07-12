// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.pnl

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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
 * Food-truck weekly/monthly P&L screen (#2184).
 *
 * Surfaces revenue, COGS, labor, and overhead with gross/net margin
 * percentages so the owner can answer "what was my food cost % last week?"
 * without exporting data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfitLossScreen(
    onBack: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: ProfitLossViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Food Truck P&L",
                        modifier = Modifier.semantics {
                            contentDescription = "Food truck profit and loss"
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
            item(key = "grouping") {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PnlGrouping.entries.forEach { grouping ->
                        FilterChip(
                            selected = grouping == state.grouping,
                            onClick = { viewModel.setGrouping(grouping) },
                            label = { Text(grouping.label) },
                            modifier = Modifier.financeSemantic("${grouping.label} profit and loss"),
                        )
                    }
                }
            }

            item(key = "headline") {
                HeadlineCard(state)
            }

            item(key = "margins") {
                MarginRow(state)
            }

            if (state.revenueLines.isNotEmpty()) {
                item(key = "rev-header") { SectionHeader("Revenue") }
                items(state.revenueLines, key = { "rev-${it.label}" }) { LineRow(it) }
            }

            item(key = "exp-header") { SectionHeader("Costs") }
            items(state.expenseLines, key = { "exp-${it.label}" }) { LineRow(it) }
        }
    }
}

@Composable
private fun HeadlineCard(state: ProfitLossUiState) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(state.periodLabel, style = MaterialTheme.typography.labelLarge)
            Text(
                "Net profit ${state.netProfitFormatted}",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = if (state.isProfitable) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                modifier = Modifier.financeSemantic("Net profit ${state.netProfitFormatted}"),
            )
            Text(
                "Revenue ${state.revenueFormatted} · Gross ${state.grossProfitFormatted}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MarginRow(state: ProfitLossUiState) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MarginCard("Food cost", state.foodCostPercentLabel, Modifier.weight(1f))
        MarginCard("Labor", state.laborPercentLabel, Modifier.weight(1f))
        MarginCard("Net margin", state.netMarginLabel, Modifier.weight(1f))
    }
}

@Composable
private fun MarginCard(label: String, value: String, modifier: Modifier = Modifier) {
    ElevatedCard(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.financeSemantic("$label $value"),
            )
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun LineRow(line: PnlLineUi) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(line.label, style = MaterialTheme.typography.bodyLarge)
            Text(
                "${line.amountFormatted}  (${line.percentLabel})",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
        }
        HorizontalDivider(modifier = Modifier.padding(top = 8.dp))
    }
}

@Preview(showBackground = true)
@Composable
private fun ProfitLossScreenPreview() {
    FinanceTheme {
        ProfitLossScreen()
    }
}
