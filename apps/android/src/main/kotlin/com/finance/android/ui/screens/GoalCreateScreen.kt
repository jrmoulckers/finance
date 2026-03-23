// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.GoalCreateUiState
import com.finance.android.ui.viewmodel.GoalCreateViewModel
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.toLocalDateTime
import org.koin.compose.viewmodel.koinViewModel

/**
 * Goal creation screen — single-page form for adding a new savings goal.
 *
 * Fields: name, target amount, target date, linked account, optional note.
 * Uses Material 3 components with full TalkBack accessibility.
 * Navigates back on successful save via [onSaved].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalCreateScreen(
    onSaved: () -> Unit = {},
    onBack: () -> Unit = {},
    viewModel: GoalCreateViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isSaved) { onSaved(); return }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "New Goal",
                        modifier = Modifier.semantics {
                            contentDescription = "New Goal screen"
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
        GoalCreateForm(
            state = state,
            onNameChange = viewModel::updateName,
            onTargetAmountChange = viewModel::updateTargetAmount,
            onTargetDateChange = viewModel::updateTargetDate,
            onAccountSelect = viewModel::selectAccount,
            onNoteChange = viewModel::updateNote,
            onSave = viewModel::save,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalCreateForm(
    state: GoalCreateUiState,
    onNameChange: (String) -> Unit,
    onTargetAmountChange: (String) -> Unit,
    onTargetDateChange: (LocalDate) -> Unit,
    onAccountSelect: (SyncId?) -> Unit,
    onNoteChange: (String) -> Unit,
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
        item(key = "amount") {
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
                label = { Text("Amount") },
                placeholder = { Text("0.00") },
                leadingIcon = { Icon(Icons.Filled.AttachMoney, contentDescription = null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                isError = state.errors.any { it.contains("amount", ignoreCase = true) },
            )
        }

        // ── Target date ─────────────────────────────────────────────
        item(key = "date") {
            Text(
                text = "Target Date",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            val dateDisplay = state.targetDate?.let { formatDateDisplay(it) } ?: ""
            OutlinedTextField(
                value = dateDisplay,
                onValueChange = {},
                readOnly = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentDescription = if (dateDisplay.isNotEmpty()) {
                            "Target date: $dateDisplay"
                        } else {
                            "Target date: not selected, tap to choose"
                        }
                    },
                label = { Text("Date") },
                placeholder = { Text("Select a date") },
                leadingIcon = { Icon(Icons.Filled.CalendarMonth, contentDescription = null) },
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
                isError = state.errors.any { it.contains("date", ignoreCase = true) },
            )
        }

        // ── Linked account (optional) ───────────────────────────────
        item(key = "account") {
            Text(
                text = "Linked Account (optional)",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            AccountSelectorDropdown(
                accounts = state.accounts,
                selectedAccount = state.selectedAccount,
                onAccountSelected = onAccountSelect,
            )
        }

        // ── Note (optional) ─────────────────────────────────────────
        item(key = "note") {
            Text(
                text = "Note (optional)",
                style = MaterialTheme.typography.labelLarge,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.note,
                onValueChange = onNoteChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Optional note" },
                label = { Text("Note") },
                placeholder = { Text("Add a note...") },
                maxLines = 3,
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
                            if (state.isSaving) "Saving goal" else "Save goal"
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
                    Text("Save Goal")
                }
            }
        }

        // ── Bottom spacer ───────────────────────────────────────────
        item(key = "spacer") { Spacer(Modifier.height(32.dp)) }
    }

    // ── Date picker dialog ──────────────────────────────────────────
    if (showDatePicker) {
        GoalDatePickerDialog(
            initialDate = state.targetDate,
            onDateSelected = { date ->
                onTargetDateChange(date)
                showDatePicker = false
            },
            onDismiss = { showDatePicker = false },
        )
    }
}

/**
 * Material 3 [DatePickerDialog] for selecting a future target date.
 *
 * Only dates after today are selectable.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalDatePickerDialog(
    initialDate: LocalDate?,
    onDateSelected: (LocalDate) -> Unit,
    onDismiss: () -> Unit,
) {
    val initialMillis = initialDate?.atStartOfDayIn(TimeZone.UTC)?.toEpochMilliseconds()
    val datePickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)

    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        val instant = Instant.fromEpochMilliseconds(millis)
                        val date = instant.toLocalDateTime(TimeZone.UTC).date
                        onDateSelected(date)
                    }
                },
                modifier = Modifier.semantics {
                    contentDescription = "Confirm selected date"
                },
            ) {
                Text("OK")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
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
                contentDescription = "Select a target date for your goal"
            },
        )
    }
}

/**
 * Dropdown selector for linking an optional account to the goal.
 *
 * Includes a "None" option to clear the selection.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountSelectorDropdown(
    accounts: List<Account>,
    selectedAccount: Account?,
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
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            // "None" option to clear selection
            DropdownMenuItem(
                text = {
                    Text(
                        text = "None",
                        modifier = Modifier.semantics {
                            contentDescription = "No linked account"
                        },
                    )
                },
                onClick = {
                    onAccountSelected(null)
                    expanded = false
                },
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
                    onClick = {
                        onAccountSelected(account.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

/**
 * Formats a [LocalDate] as "MMM dd, yyyy" (e.g. "Jun 15, 2025").
 * Consistent with the format used in [GoalsViewModel].
 */
private fun formatDateDisplay(date: LocalDate): String {
    val month = date.month.name
        .lowercase()
        .replaceFirstChar { it.uppercase() }
        .take(3)
    return "$month ${date.dayOfMonth}, ${date.year}"
}

// ── Previews ────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "Goal Create - Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Goal Create - Dark",
)
@Composable
private fun GoalCreateFormPreview() {
    val now = Clock.System.now()
    FinanceTheme(dynamicColor = false) {
        GoalCreateForm(
            state = GoalCreateUiState(
                name = "Emergency Fund",
                targetAmount = "10000.00",
                targetDate = LocalDate(2025, 12, 31),
                accounts = listOf(
                    Account(
                        SyncId("acc-1"), SyncId("h-1"), "Main Checking",
                        AccountType.CHECKING, Currency.USD, Cents(52473L),
                        createdAt = now, updatedAt = now,
                    ),
                    Account(
                        SyncId("acc-2"), SyncId("h-1"), "Savings",
                        AccountType.SAVINGS, Currency.USD, Cents(1867000L),
                        createdAt = now, updatedAt = now,
                    ),
                ),
                selectedAccount = Account(
                    SyncId("acc-2"), SyncId("h-1"), "Savings",
                    AccountType.SAVINGS, Currency.USD, Cents(1867000L),
                    createdAt = now, updatedAt = now,
                ),
            ),
            onNameChange = {},
            onTargetAmountChange = {},
            onTargetDateChange = {},
            onAccountSelect = {},
            onNoteChange = {},
            onSave = {},
        )
    }
}

@Preview(showBackground = true, name = "Goal Create - Errors")
@Composable
private fun GoalCreateErrorsPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalCreateForm(
            state = GoalCreateUiState(
                errors = listOf(
                    "Goal name is required",
                    "Target amount must be greater than zero",
                    "Target date is required",
                ),
            ),
            onNameChange = {},
            onTargetAmountChange = {},
            onTargetDateChange = {},
            onAccountSelect = {},
            onNoteChange = {},
            onSave = {},
        )
    }
}

@Preview(showBackground = true, name = "Goal Create - Saving")
@Composable
private fun GoalCreateSavingPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalCreateForm(
            state = GoalCreateUiState(
                name = "Vacation Fund",
                targetAmount = "5000.00",
                targetDate = LocalDate(2025, 8, 15),
                isSaving = true,
            ),
            onNameChange = {},
            onTargetAmountChange = {},
            onTargetDateChange = {},
            onAccountSelect = {},
            onNoteChange = {},
            onSave = {},
        )
    }
}
