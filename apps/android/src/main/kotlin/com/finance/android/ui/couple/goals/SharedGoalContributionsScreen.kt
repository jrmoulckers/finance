// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.goals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
 * Shared goal contributions for a house down payment (#2147).
 *
 * Shows combined household progress plus each partner's contribution effort,
 * suggested monthly targets, home-purchase milestones, and a contribution
 * history. Partners can choose whether contributions are shown in detail or
 * summarized.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SharedGoalContributionsScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: SharedGoalViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showAdd by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Shared goal") },
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
            if (state.selectedGoalId != null) {
                FloatingActionButton(
                    onClick = { showAdd = true },
                    modifier = Modifier.semantics { contentDescription = "Add a contribution" },
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                }
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
            item { GoalPicker(state, viewModel) }

            if (state.selectedGoalId == null && !state.isLoading) {
                item {
                    Text(
                        "Create a savings goal (e.g. \"House down payment\") to start " +
                            "contributing together.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (state.selectedGoalId != null) {
                item { TotalProgressCard(state) }
                item { VisibilityToggle(state, viewModel) }
                item {
                    Text(
                        "Each partner",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                }
                items(state.partnerProgress, key = { it.partner.name }) { p ->
                    PartnerProgressCard(p, state.showContributionsVisibly)
                }
                item { MilestonesCard(state) }
                if (state.showContributionsVisibly && state.history.isNotEmpty()) {
                    item {
                        Text(
                            "Contribution history",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.semantics { heading() },
                        )
                    }
                    items(state.history, key = { it.id }) { row ->
                        ContributionRow(row, onDelete = { viewModel.deleteContribution(row.id) })
                    }
                }
            }
            item { Spacer(Modifier.height(80.dp)) }
        }
    }

    if (showAdd) {
        AddContributionDialog(
            partnerAName = state.profile.partnerAName,
            partnerBName = state.profile.partnerBName,
            onDismiss = { showAdd = false },
            onAdd = { partner, amount, note ->
                viewModel.addContribution(partner, amount, note)
                showAdd = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalPicker(state: SharedGoalUiState, viewModel: SharedGoalViewModel) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(
            onClick = { expanded = true },
            enabled = state.goals.isNotEmpty(),
            modifier = Modifier.semantics { contentDescription = "Choose shared goal" },
        ) {
            Text(state.selectedGoalName.ifBlank { "Select a goal" })
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            state.goals.forEach { g ->
                DropdownMenuItem(
                    text = { Text(g.name) },
                    onClick = {
                        expanded = false
                        viewModel.selectGoal(g.id)
                    },
                )
            }
        }
    }
}

@Composable
private fun TotalProgressCard(state: SharedGoalUiState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                "Household total",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                "${state.totalSavedFormatted} of ${state.targetFormatted}",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            LinearProgressIndicator(
                progress = { state.progressFraction },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .semantics {
                        contentDescription =
                            "Progress ${(state.progressFraction * 100).toInt()} percent"
                    },
            )
            Text(
                "${state.remainingFormatted} to go",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun VisibilityToggle(state: SharedGoalUiState, viewModel: SharedGoalViewModel) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("Show contribution detail", style = MaterialTheme.typography.bodyLarge)
            Text(
                "Off shows each partner's share as a summary only",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(
            checked = state.showContributionsVisibly,
            onCheckedChange = viewModel::toggleVisibility,
            modifier = Modifier.semantics { contentDescription = "Show contribution detail" },
        )
    }
}

@Composable
private fun PartnerProgressCard(p: PartnerProgressUi, showDetail: Boolean) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row {
                Text(p.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                if (showDetail) {
                    Text(p.contributedFormatted, fontWeight = FontWeight.SemiBold)
                }
            }
            if (showDetail) {
                LinearProgressIndicator(
                    progress = { p.fractionOfRecorded },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp)
                        .semantics {
                            contentDescription =
                                "${p.name} contributed ${(p.fractionOfRecorded * 100).toInt()} " +
                                    "percent of recorded"
                        },
                )
            }
            Text(
                "Suggested: ${p.suggestedMonthlyFormatted}/mo",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun MilestonesCard(state: SharedGoalUiState) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "Home milestones",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            state.milestones.forEach { m ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (m.reached) {
                            Icons.Filled.CheckCircle
                        } else {
                            Icons.Outlined.Circle
                        },
                        contentDescription = if (m.reached) "Reached" else "Not yet reached",
                        tint = if (m.reached) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(m.label, Modifier.weight(1f))
                    Text(m.amountFormatted, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(
                "Plan for closing costs and an emergency buffer on top of the down payment.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ContributionRow(row: ContributionRowUi, onDelete: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("${row.partnerName} · ${row.amountFormatted}", style = MaterialTheme.typography.bodyMedium)
            if (row.note.isNotBlank()) {
                Text(
                    row.note,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        TextButton(
            onClick = onDelete,
            modifier = Modifier.semantics { contentDescription = "Remove contribution" },
        ) {
            Text("Remove")
        }
    }
}

@Composable
private fun AddContributionDialog(
    partnerAName: String,
    partnerBName: String,
    onDismiss: () -> Unit,
    onAdd: (Partner, Double, String) -> Unit,
) {
    var partner by remember { mutableStateOf(Partner.A) }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { onAdd(partner, amount.toDoubleOrNull() ?: 0.0, note) },
                enabled = (amount.toDoubleOrNull() ?: 0.0) > 0,
            ) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
        title = { Text("Add contribution") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = partner == Partner.A,
                        onClick = { partner = Partner.A },
                        label = { Text(partnerAName) },
                    )
                    FilterChip(
                        selected = partner == Partner.B,
                        onClick = { partner = Partner.B },
                        label = { Text(partnerBName) },
                    )
                }
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text("Amount ($)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("Note (optional)") },
                    singleLine = true,
                )
            }
        },
    )
}

@androidx.compose.ui.tooling.preview.Preview(showBackground = true)
@Composable
@Suppress("UnusedPrivateMember")
private fun SharedGoalScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        // Live data comes from the ViewModel.
    }
}
