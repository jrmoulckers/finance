// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.unit.dp
import com.finance.android.ui.viewmodel.GoalEditUiState
import com.finance.android.ui.viewmodel.GoalEditViewModel
import com.finance.models.types.SyncId
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import org.koin.compose.viewmodel.koinViewModel

/**
 * Goal edit screen — single-page form for editing an existing goal.
 *
 * Mirrors [GoalCreateScreen] layout but pre-populates fields and
 * provides update/delete actions. Full TalkBack accessibility.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalEditScreen(
    onSaved: () -> Unit = {},
    onDeleted: () -> Unit = {},
    onBack: () -> Unit = {},
    viewModel: GoalEditViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(state.isSaved) { if (state.isSaved) onSaved() }
    LaunchedEffect(state.isDeleted) { if (state.isDeleted) onDeleted() }

    if (state.isLoading) {
        Box(
            Modifier
                .fillMaxSize()
                .semantics { contentDescription = "Loading goal" },
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
                        text = "Edit Goal",
                        modifier = Modifier.semantics {
                            contentDescription = "Edit Goal screen"
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
                            contentDescription = "Delete goal"
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
        GoalEditForm(
            state = state,
            onNameChange = viewModel::updateName,
            onTargetAmountChange = viewModel::updateTargetAmount,
            onCurrentAmountChange = viewModel::updateCurrentAmount,
            onTargetDateChange = viewModel::updateTargetDate,
            onAccountSelect = viewModel::selectAccount,
            onSave = viewModel::save,
            modifier = Modifier.padding(innerPadding),
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = {
                Text(
                    text = "Delete Goal?",
                    modifier = Modifier.semantics {
                        contentDescription = "Delete Goal confirmation"
                    },
                )
            },
            text = {
                Text(
                    text = "This will permanently remove this goal and cannot be undone.",
                    modifier = Modifier.semantics {
                        contentDescription =
                            "This will permanently remove this goal and cannot be undone"
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalEditForm(
    state: GoalEditUiState,
    onNameChange: (String) -> Unit,
    onTargetAmountChange: (String) -> Unit,
    onCurrentAmountChange: (String) -> Unit,
    onTargetDateChange: (LocalDate) -> Unit,
    onAccountSelect: (SyncId?) -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showDatePicker by remember { mutableStateOf(false) }

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

        // ── Goal name ───────────────────────────────────────────────
        item(key = "name") {
            Text(
                text = "Goal Name",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.name,
                onValueChange = onNameChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Goal name input" },
                label = { Text("Name") },
                placeholder = { Text("e.g. Emergency Fund") },
                singleLine = true,
                isError = state.errors.any { it.contains("name", ignoreCase = true) },
            )
        }

        // ── Target amount ───────────────────────────────────────────
        item(key = "targetAmount") {
            Text(
                text = "Target Amount",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.targetAmount,
                onValueChange = onTargetAmountChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Target amount in dollars" },
                label = { Text("Target") },
                placeholder = { Text("0.00") },
                leadingIcon = { Icon(Icons.Filled.AttachMoney, contentDescription = null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                isError = state.errors.any { it.contains("target", ignoreCase = true) },
            )
        }

        // ── Current amount ──────────────────────────────────────────
        item(key = "currentAmount") {
            Text(
                text = "Current Amount",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.currentAmount,
                onValueChange = onCurrentAmountChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Current saved amount in dollars" },
                label = { Text("Current") },
                placeholder = { Text("0.00") },
                leadingIcon = { Icon(Icons.Filled.AttachMoney, contentDescription = null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
            )
        }

        // ── Target date ─────────────────────────────────────────────
        item(key = "targetDate") {
            Text(
                text = "Target Date",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.targetDate?.let { goalEditFormatDate(it) } ?: "",
                onValueChange = {},
                readOnly = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = "Target date: ${
                            state.targetDate?.let { goalEditFormatDate(it) } ?: "not set"
                        }"
                    },
                label = { Text("Date") },
                placeholder = { Text("Select a target date") },
                trailingIcon = {
                    IconButton(
                        onClick = { showDatePicker = true },
                        modifier = Modifier.semantics {
                            contentDescription = "Open date picker"
                        },
                    ) {
                        Icon(Icons.Filled.CalendarMonth, contentDescription = null)
                    }
                },
            )
        }

        // ── Linked account ──────────────────────────────────────────
        if (state.accounts.isNotEmpty()) {
            item(key = "account") {
                Text(
                    text = "Linked Account (optional)",
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.semantics { heading() },
                )
                Spacer(Modifier.height(8.dp))
                GoalEditAccountDropdown(
                    selectedAccount = state.selectedAccount,
                    accounts = state.accounts,
                    onAccountSelected = onAccountSelect,
                )
            }
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

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = state.targetDate?.atStartOfDayIn(TimeZone.UTC)
                ?.toEpochMilliseconds(),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            val date = Instant.fromEpochMilliseconds(millis)
                                .toLocalDateTime(TimeZone.UTC).date
                            onTargetDateChange(date)
                        }
                        showDatePicker = false
                    },
                    modifier = Modifier.semantics {
                        contentDescription = "Confirm date selection"
                    },
                ) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDatePicker = false },
                    modifier = Modifier.semantics {
                        contentDescription = "Cancel date selection"
                    },
                ) {
                    Text("Cancel")
                }
            },
        ) {
            DatePicker(
                state = datePickerState,
                modifier = Modifier.semantics {
                    contentDescription = "Date picker for target date"
                },
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalEditAccountDropdown(
    selectedAccount: com.finance.models.Account?,
    accounts: List<com.finance.models.Account>,
    onAccountSelected: (SyncId?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val displayName = selectedAccount?.name ?: "None"

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
                .semantics { contentDescription = "Linked account: $displayName" },
            label = { Text("Account") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = {
                    Text(
                        text = "None",
                        modifier = Modifier.semantics {
                            contentDescription = "No linked account"
                        },
                    )
                },
                onClick = { onAccountSelected(null); expanded = false },
            )
            accounts.forEach { account ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = account.name,
                            modifier = Modifier.semantics {
                                contentDescription = "Account: ${account.name}"
                            },
                        )
                    },
                    onClick = { onAccountSelected(account.id); expanded = false },
                )
            }
        }
    }
}

private fun goalEditFormatDate(date: LocalDate): String {
    val month = date.month.name.lowercase().replaceFirstChar { it.uppercase() }.take(3)
    return "$month ${date.dayOfMonth}, ${date.year}"
}
