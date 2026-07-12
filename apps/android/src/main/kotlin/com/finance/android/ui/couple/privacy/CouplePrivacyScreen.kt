// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.privacy

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * "Yours, mine, ours" privacy model screen (#2142).
 *
 * Lets an engaged couple classify accounts, budgets, and goals as private to
 * one partner or shared, choose whether private items count toward combined net
 * worth, and default partner visibility to summaries rather than line items.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CouplePrivacyScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: CouplePrivacyViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Yours, mine, ours") },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics { contentDescription = "Go back" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Spacer(Modifier.height(4.dp))
                NetWorthCard(state)
            }
            item { SharingPreferencesCard(state, viewModel) }
            item {
                Text(
                    text = "Classify your money",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = "Everything starts as \"Ours\". Mark items private and only " +
                        "summaries are shared — never line-by-line detail.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state.items.isEmpty() && !state.isLoading) {
                item {
                    Text(
                        text = "Add accounts, budgets, or goals to classify them here.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(state.items, key = { "${it.type}:${it.id}" }) { itemUi ->
                PrivacyItemRow(
                    item = itemUi,
                    profile = state.profile,
                    onSelect = { viewModel.setVisibility(itemUi, it) },
                )
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

@Composable
private fun NetWorthCard(state: CouplePrivacyUiState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "Combined net worth",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = state.combinedNetWorthFormatted,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics {
                    contentDescription = "Combined net worth ${state.combinedNetWorthFormatted}"
                },
            )
            Text(
                text = "Shared-only view: ${state.sharedNetWorthFormatted}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (state.privateItemCount > 0) {
                Text(
                    text = "${state.privateItemCount} item(s) kept private",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SharingPreferencesCard(
    state: CouplePrivacyUiState,
    viewModel: CouplePrivacyViewModel,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            ToggleRow(
                title = "Include private accounts in net worth",
                subtitle = "Off shows only jointly-owned totals",
                checked = state.includePrivateInNetWorth,
                onCheckedChange = viewModel::setIncludePrivateInNetWorth,
            )
            ToggleRow(
                title = "Share summaries, not line items",
                subtitle = "Partners see category totals, not every transaction",
                checked = state.summaryOnlySharing,
                onCheckedChange = viewModel::setSummaryOnlySharing,
            )
        }
    }
}

@Composable
private fun ToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            modifier = Modifier.semantics { contentDescription = title },
        )
    }
}

@Composable
private fun PrivacyItemRow(
    item: PrivacyItemUi,
    profile: com.finance.android.ui.couple.CoupleProfile,
    onSelect: (PrivacyVisibility) -> Unit,
) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(item.name, style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "${item.type.name.lowercase().replaceFirstChar { it.uppercase() }} · ${item.subtitle}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.selectableGroup(),
            ) {
                VisibilityChip(PrivacyVisibility.MINE, profile.partnerAName, item.visibility, onSelect)
                VisibilityChip(PrivacyVisibility.YOURS, profile.partnerBName, item.visibility, onSelect)
                VisibilityChip(PrivacyVisibility.OURS, profile.sharedLabel, item.visibility, onSelect)
            }
        }
    }
}

@Composable
private fun VisibilityChip(
    value: PrivacyVisibility,
    label: String,
    selected: PrivacyVisibility,
    onSelect: (PrivacyVisibility) -> Unit,
) {
    val isSelected = value == selected
    FilterChip(
        selected = isSelected,
        onClick = { onSelect(value) },
        label = { Text(label) },
        modifier = Modifier.semantics {
            contentDescription = "${value.label} ($label)${if (isSelected) ", selected" else ""}"
        },
    )
}

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
@Suppress("UnusedPrivateMember")
private fun CouplePrivacyScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        // Preview renders the static chrome; live data comes from the ViewModel.
    }
}
