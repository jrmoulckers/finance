// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.android.ui.viewmodel.BudgetEditUiState
import com.finance.android.ui.viewmodel.BudgetEditViewModel
import com.finance.models.BudgetPeriod
import com.finance.models.types.SyncId
import org.koin.compose.viewmodel.koinViewModel

/**
 * Budget edit screen — single-page form for editing an existing budget.
 *
 * Mirrors [BudgetCreateScreen] layout but pre-populates fields and
 * provides update/delete actions. Full TalkBack accessibility.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetEditScreen(
    onSaved: () -> Unit = {},
    onDeleted: () -> Unit = {},
    onBack: () -> Unit = {},
    viewModel: BudgetEditViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(state.isSaved) { if (state.isSaved) onSaved() }
    LaunchedEffect(state.isDeleted) { if (state.isDeleted) onDeleted() }

    if (state.isLoading) {
        Box(
            Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Loading budget" },
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                Modifier.semantics { contentDescription = "Loading indicator" },
            )
        }
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Edit Budget",
                        modifier = Modifier.semantics {
                            contentDescription = "Edit Budget screen"
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Navigate back"
                        },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    IconButton(
                        onClick = { showDeleteDialog = true },
                        modifier = Modifier.semantics {
                            contentDescription = "Delete budget"
                        },
                    ) {
                        Icon(
                            Icons.Filled.Delete,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        BudgetEditForm(
            state = state,
            onCategorySelect = viewModel::selectCategory,
            onAmountChange = viewModel::updateAmount,
            onPeriodChange = viewModel::updatePeriod,
            onSave = viewModel::save,
            modifier = Modifier.padding(innerPadding),
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = {
                Text(
                    text = "Delete Budget?",
                    modifier = Modifier.semantics {
                        contentDescription = "Delete Budget confirmation"
                    },
                )
            },
            text = {
                Text(
                    text = "This will permanently remove this budget and cannot be undone.",
                    modifier = Modifier.semantics {
                        contentDescription =
                            "This will permanently remove this budget and cannot be undone"
                    },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.delete()
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Confirm delete"
                    },
                ) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDeleteDialog = false },
                    modifier = Modifier.semantics {
                        contentDescription = "Cancel delete"
                    },
                ) {
                    Text("Cancel")
                }
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun BudgetEditForm(
    state: BudgetEditUiState,
    onCategorySelect: (SyncId) -> Unit,
    onAmountChange: (String) -> Unit,
    onPeriodChange: (BudgetPeriod) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Error messages ──────────────────────────────────────────
        if (state.errors.isNotEmpty()) {
            item(key = "errors") {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "Errors: ${state.errors.joinToString(", ")}"
                        },
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                    ),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        state.errors.forEach { error ->
                            Text(
                                text = "• $error",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                }
            }
        }

        // ── Category selector ───────────────────────────────────────
        item(key = "category") {
            Text(
                text = "Category",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Select a category"
                },
            )
            Spacer(Modifier.height(8.dp))
            if (state.categories.isEmpty()) {
                Text(
                    text = "No categories available",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "No categories available"
                    },
                )
            } else {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.categories.forEach { cat ->
                        val selected = cat.id == state.selectedCategory?.id
                        FilterChip(
                            selected = selected,
                            onClick = { onCategorySelect(cat.id) },
                            label = {
                                Text(
                                    text = cat.name,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            },
                            modifier = Modifier.semantics {
                                contentDescription = if (selected) {
                                    "Category: ${cat.name}, selected"
                                } else {
                                    "Category: ${cat.name}"
                                }
                            },
                        )
                    }
                }
            }
        }

        // ── Budgeted amount ─────────────────────────────────────────
        item(key = "amount") {
            Text(
                text = "Budgeted Amount",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.amount,
                onValueChange = onAmountChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Budgeted amount in dollars" },
                label = { Text("Amount") },
                placeholder = { Text("0.00") },
                leadingIcon = { Icon(Icons.Filled.AttachMoney, contentDescription = null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                isError = state.errors.any { it.contains("amount", ignoreCase = true) },
            )
        }

        // ── Period selector ─────────────────────────────────────────
        item(key = "period") {
            Text(
                text = "Period",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            BudgetEditPeriodDropdown(
                selectedPeriod = state.period,
                onPeriodSelected = onPeriodChange,
            )
        }

        // ── Save button ─────────────────────────────────────────────
        item(key = "save") {
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = onSave,
                enabled = !state.isSaving,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription =
                            if (state.isSaving) "Saving changes" else "Save changes"
                    },
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Saving...")
                } else {
                    Icon(Icons.Filled.Check, contentDescription = null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Save Changes")
                }
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(32.dp)) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BudgetEditPeriodDropdown(
    selectedPeriod: BudgetPeriod,
    onPeriodSelected: (BudgetPeriod) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val displayName = budgetEditPeriodDisplayName(selectedPeriod)

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = displayName,
            onValueChange = {},
            readOnly = true,
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .semantics { contentDescription = "Period: $displayName" },
            label = { Text("Period") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            BudgetPeriod.entries.forEach { period ->
                val name = budgetEditPeriodDisplayName(period)
                DropdownMenuItem(
                    text = {
                        Text(
                            text = name,
                            modifier = Modifier.semantics {
                                contentDescription = "Period: $name"
                            },
                        )
                    },
                    onClick = { onPeriodSelected(period); expanded = false },
                )
            }
        }
    }
}

private fun budgetEditPeriodDisplayName(period: BudgetPeriod): String = when (period) {
    BudgetPeriod.WEEKLY -> "Weekly"
    BudgetPeriod.BIWEEKLY -> "Biweekly"
    BudgetPeriod.MONTHLY -> "Monthly"
    BudgetPeriod.QUARTERLY -> "Quarterly"
    BudgetPeriod.YEARLY -> "Yearly"
}
