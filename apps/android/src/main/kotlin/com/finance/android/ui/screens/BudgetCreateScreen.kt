// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Check
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
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.BudgetCreateUiState
import com.finance.android.ui.viewmodel.BudgetCreateViewModel
import com.finance.models.BudgetPeriod
import com.finance.models.Category
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import org.koin.compose.viewmodel.koinViewModel

/**
 * Budget creation screen — single-page form for adding a new budget.
 *
 * Fields: category selector, budgeted amount, period.
 * Uses Material 3 components with full TalkBack accessibility.
 * Navigates back on successful save via [onSaved].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetCreateScreen(
    onSaved: () -> Unit = {},
    onBack: () -> Unit = {},
    viewModel: BudgetCreateViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isSaved) { onSaved(); return }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "New Budget",
                        modifier = Modifier.semantics {
                            contentDescription = "New Budget screen"
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
            )
        },
    ) { innerPadding ->
        BudgetCreateForm(
            state = state,
            onCategorySelect = viewModel::selectCategory,
            onAmountChange = viewModel::updateAmount,
            onPeriodChange = viewModel::updatePeriod,
            onSave = viewModel::save,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun BudgetCreateForm(
    state: BudgetCreateUiState,
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
            BudgetPeriodDropdown(
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
                            if (state.isSaving) "Saving budget" else "Save budget"
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
                    Text("Save Budget")
                }
            }
        }

        // ── Bottom spacer ───────────────────────────────────────────
        item(key = "spacer") { Spacer(Modifier.height(32.dp)) }
    }
}

/**
 * Dropdown selector for [BudgetPeriod] values.
 *
 * Displays each period as a human-readable name (e.g. "Monthly").
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BudgetPeriodDropdown(
    selectedPeriod: BudgetPeriod,
    onPeriodSelected: (BudgetPeriod) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val displayName = budgetPeriodDisplayName(selectedPeriod)

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
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            BudgetPeriod.entries.forEach { period ->
                val name = budgetPeriodDisplayName(period)
                DropdownMenuItem(
                    text = {
                        Text(
                            text = name,
                            modifier = Modifier.semantics {
                                contentDescription = "Period: $name"
                            },
                        )
                    },
                    onClick = {
                        onPeriodSelected(period)
                        expanded = false
                    },
                )
            }
        }
    }
}

/** Maps [BudgetPeriod] enum values to user-friendly display names. */
private fun budgetPeriodDisplayName(period: BudgetPeriod): String = when (period) {
    BudgetPeriod.WEEKLY -> "Weekly"
    BudgetPeriod.BIWEEKLY -> "Biweekly"
    BudgetPeriod.MONTHLY -> "Monthly"
    BudgetPeriod.QUARTERLY -> "Quarterly"
    BudgetPeriod.YEARLY -> "Yearly"
}

// ── Previews ────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "Budget Create - Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Budget Create - Dark",
)
@Composable
private fun BudgetCreateFormPreview() {
    val now = Clock.System.now()
    FinanceTheme(dynamicColor = false) {
        BudgetCreateForm(
            state = BudgetCreateUiState(
                categories = listOf(
                    Category(SyncId("cat-1"), SyncId("h-1"), "Groceries", createdAt = now, updatedAt = now),
                    Category(SyncId("cat-2"), SyncId("h-1"), "Dining Out", createdAt = now, updatedAt = now),
                    Category(SyncId("cat-3"), SyncId("h-1"), "Transportation", createdAt = now, updatedAt = now),
                    Category(SyncId("cat-4"), SyncId("h-1"), "Entertainment", createdAt = now, updatedAt = now),
                ),
                selectedCategory = Category(SyncId("cat-1"), SyncId("h-1"), "Groceries", createdAt = now, updatedAt = now),
                amount = "600.00",
                period = BudgetPeriod.MONTHLY,
            ),
            onCategorySelect = {},
            onAmountChange = {},
            onPeriodChange = {},
            onSave = {},
        )
    }
}

@Preview(showBackground = true, name = "Budget Create - Errors")
@Composable
private fun BudgetCreateErrorsPreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetCreateForm(
            state = BudgetCreateUiState(
                errors = listOf("Please select a category", "Budgeted amount must be greater than zero"),
            ),
            onCategorySelect = {},
            onAmountChange = {},
            onPeriodChange = {},
            onSave = {},
        )
    }
}

@Preview(showBackground = true, name = "Budget Create - Saving")
@Composable
private fun BudgetCreateSavingPreview() {
    val now = Clock.System.now()
    FinanceTheme(dynamicColor = false) {
        BudgetCreateForm(
            state = BudgetCreateUiState(
                selectedCategory = Category(SyncId("cat-1"), SyncId("h-1"), "Groceries", createdAt = now, updatedAt = now),
                amount = "300.00",
                period = BudgetPeriod.WEEKLY,
                isSaving = true,
            ),
            onCategorySelect = {},
            onAmountChange = {},
            onPeriodChange = {},
            onSave = {},
        )
    }
}
