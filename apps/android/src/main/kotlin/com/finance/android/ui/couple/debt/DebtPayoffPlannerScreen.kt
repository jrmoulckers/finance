// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.debt

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.finance.android.ui.couple.Partner
import com.finance.android.ui.theme.FinanceTheme
import org.koin.compose.viewmodel.koinViewModel

/**
 * Joint debt payoff planner (#2153).
 *
 * Compares avalanche vs snowball across both partners' debts, supports personal
 * / shared / jointly-funded ownership, shows the tradeoff against wedding and
 * house savings, and offers a simpler recommendation mode.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DebtPayoffPlannerScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DebtPlannerViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Debt payoff planner") },
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
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showAdd = true },
                modifier = Modifier.semantics { contentDescription = "Add a debt" },
            ) {
                Icon(Icons.Filled.Add, contentDescription = null)
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(4.dp)) }
            item { SimpleModeToggle(state, viewModel) }
            item { ExtraPaymentCard(state, viewModel) }

            if (state.avalanche != null && state.snowball != null) {
                if (state.simpleMode) {
                    item { RecommendationCard(state) }
                } else {
                    item { StrategyComparison(state) }
                }
                state.weddingTradeoffText?.let { text ->
                    item { TradeoffCard(text) }
                }
            } else {
                item {
                    Text(
                        state.recommendationSummary,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            item {
                Text(
                    "Your debts",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
            }
            items(state.debts, key = { it.id }) { debt ->
                DebtRow(debt, onDelete = { viewModel.deleteDebt(debt.id) })
            }
            item { Spacer(Modifier.height(80.dp)) }
        }
    }

    if (showAdd) {
        AddDebtDialog(
            partnerAName = state.profile.partnerAName,
            partnerBName = state.profile.partnerBName,
            onDismiss = { showAdd = false },
            onAdd = { name, bal, apr, min, ownership, owner ->
                viewModel.addDebt(name, bal, apr, min, ownership, owner)
                showAdd = false
            },
        )
    }
}

@Composable
private fun SimpleModeToggle(state: DebtPlannerUiState, viewModel: DebtPlannerViewModel) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Just tell us what to do", style = MaterialTheme.typography.bodyLarge)
            Text(
                "Show one clear recommendation instead of the full comparison",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = state.simpleMode,
            onCheckedChange = viewModel::setSimpleMode,
            modifier = Modifier.semantics { contentDescription = "Simple recommendation mode" },
        )
    }
}

@Composable
private fun ExtraPaymentCard(state: DebtPlannerUiState, viewModel: DebtPlannerViewModel) {
    var text by remember(state.extraMonthlyCents) {
        mutableStateOf((state.extraMonthlyCents / 100.0).toString())
    }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "Extra toward debt each month",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            OutlinedTextField(
                value = text,
                onValueChange = {
                    text = it
                    it.toDoubleOrNull()?.let { d -> viewModel.setExtraMonthly(d) }
                },
                label = { Text("Extra monthly payment ($)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Extra monthly payment in dollars" },
            )
            Text(
                "Applied on top of every minimum payment.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RecommendationCard(state: DebtPlannerUiState) {
    val plan = if (state.recommendedStrategy == PayoffStrategy.AVALANCHE) {
        state.avalanche
    } else {
        state.snowball
    } ?: return
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                "Recommended: ${state.recommendedStrategy.displayName}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() },
            )
            Text(state.recommendationSummary, style = MaterialTheme.typography.bodyMedium)
            Text(
                "Debt-free in ${plan.debtFreeText} · ${plan.totalInterestFormatted} interest",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Order: ${plan.orderedNames.joinToString(" → ")}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun StrategyComparison(state: DebtPlannerUiState) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        state.avalanche?.let {
            PlanCard(
                plan = it,
                recommended = state.recommendedStrategy == PayoffStrategy.AVALANCHE,
                modifier = Modifier.weight(1f),
            )
        }
        state.snowball?.let {
            PlanCard(
                plan = it,
                recommended = state.recommendedStrategy == PayoffStrategy.SNOWBALL,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun PlanCard(plan: StrategyPlanUi, recommended: Boolean, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = if (recommended) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                plan.strategy.displayName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
            if (recommended) {
                AssistChip(onClick = {}, label = { Text("Recommended") })
            }
            Text("Debt-free: ${plan.debtFreeText}", style = MaterialTheme.typography.bodyMedium)
            Text(
                "Interest: ${plan.totalInterestFormatted}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text(
                plan.strategy.rationale,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun TradeoffCard(text: String) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(
                "Wedding & house tradeoff",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun DebtRow(debt: DebtRowUi, onDelete: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(debt.name, style = MaterialTheme.typography.bodyLarge)
                Text(
                    "${debt.balanceFormatted} · ${debt.aprFormatted} · ${debt.minPaymentFormatted}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    debt.ownershipLabel,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            IconButton(
                onClick = onDelete,
                modifier = Modifier.semantics { contentDescription = "Delete ${debt.name}" },
            ) {
                Icon(Icons.Filled.Delete, contentDescription = null)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddDebtDialog(
    partnerAName: String,
    partnerBName: String,
    onDismiss: () -> Unit,
    onAdd: (String, Double, Double, Double, DebtOwnership, Partner?) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var balance by remember { mutableStateOf("") }
    var apr by remember { mutableStateOf("") }
    var minPayment by remember { mutableStateOf("") }
    var ownership by remember { mutableStateOf(DebtOwnership.PERSONAL) }
    var owner by remember { mutableStateOf(Partner.A) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    onAdd(
                        name,
                        balance.toDoubleOrNull() ?: 0.0,
                        apr.toDoubleOrNull() ?: 0.0,
                        minPayment.toDoubleOrNull() ?: 0.0,
                        ownership,
                        if (ownership == DebtOwnership.PERSONAL) owner else null,
                    )
                },
                enabled = name.isNotBlank() && (balance.toDoubleOrNull() ?: 0.0) > 0,
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Add a debt") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = balance,
                    onValueChange = { balance = it },
                    label = { Text("Balance ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = apr,
                    onValueChange = { apr = it },
                    label = { Text("APR (%)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = minPayment,
                    onValueChange = { minPayment = it },
                    label = { Text("Minimum payment ($/mo)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                Text("Ownership", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DebtOwnership.entries.forEach { opt ->
                        FilterChip(
                            selected = ownership == opt,
                            onClick = { ownership = opt },
                            label = {
                                Text(
                                    opt.name.lowercase()
                                        .replace('_', ' ')
                                        .replaceFirstChar { it.uppercase() },
                                )
                            },
                        )
                    }
                }
                if (ownership == DebtOwnership.PERSONAL) {
                    SingleChoiceSegmentedButtonRow {
                        SegmentedButton(
                            selected = owner == Partner.A,
                            onClick = { owner = Partner.A },
                            shape = SegmentedButtonDefaults.itemShape(0, 2),
                        ) { Text(partnerAName) }
                        SegmentedButton(
                            selected = owner == Partner.B,
                            onClick = { owner = Partner.B },
                            shape = SegmentedButtonDefaults.itemShape(1, 2),
                        ) { Text(partnerBName) }
                    }
                }
            }
        },
    )
}

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
@Suppress("UnusedPrivateMember")
private fun DebtPlannerScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        // Live data comes from the ViewModel.
    }
}
