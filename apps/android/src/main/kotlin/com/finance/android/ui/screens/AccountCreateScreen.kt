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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.AccountCreateUiState
import com.finance.android.ui.viewmodel.AccountCreateViewModel
import com.finance.models.AccountType
import org.koin.compose.viewmodel.koinViewModel

/**
 * Account creation screen — single-page form for adding a new account.
 *
 * Fields: name, type, currency, initial balance, optional note.
 * Uses Material 3 components with full TalkBack accessibility.
 * Navigates back on successful save via [onSaved].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountCreateScreen(
    onSaved: () -> Unit = {},
    onBack: () -> Unit = {},
    viewModel: AccountCreateViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isSaved) { onSaved(); return }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "New Account",
                        modifier = Modifier.semantics {
                            contentDescription = "New Account screen"
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
        AccountCreateForm(
            state = state,
            supportedCurrencies = viewModel.supportedCurrencies,
            onNameChange = viewModel::updateName,
            onTypeChange = viewModel::updateAccountType,
            onCurrencyChange = viewModel::updateCurrency,
            onBalanceChange = viewModel::updateInitialBalance,
            onNoteChange = viewModel::updateNote,
            onSave = viewModel::save,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountCreateForm(
    state: AccountCreateUiState,
    supportedCurrencies: List<String>,
    onNameChange: (String) -> Unit,
    onTypeChange: (AccountType) -> Unit,
    onCurrencyChange: (String) -> Unit,
    onBalanceChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
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

        // ── Account name ────────────────────────────────────────────
        item(key = "name") {
            Text(
                text = "Account Name",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.name,
                onValueChange = onNameChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Account name input" },
                label = { Text("Name") },
                placeholder = { Text("e.g. Main Checking") },
                singleLine = true,
                isError = state.errors.any { it.contains("name", ignoreCase = true) },
            )
        }

        // ── Account type ────────────────────────────────────────────
        item(key = "type") {
            Text(
                text = "Account Type",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            AccountTypeDropdown(
                selectedType = state.accountType,
                onTypeSelected = onTypeChange,
            )
        }

        // ── Currency ────────────────────────────────────────────────
        item(key = "currency") {
            Text(
                text = "Currency",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            CurrencyDropdown(
                selectedCurrency = state.currency,
                currencies = supportedCurrencies,
                onCurrencySelected = onCurrencyChange,
            )
        }

        // ── Initial balance ─────────────────────────────────────────
        item(key = "balance") {
            Text(
                text = "Initial Balance",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = state.initialBalance,
                onValueChange = onBalanceChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Initial balance in dollars" },
                label = { Text("Balance") },
                placeholder = { Text("0.00") },
                leadingIcon = { Icon(Icons.Filled.AttachMoney, contentDescription = null) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
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
                            if (state.isSaving) "Saving account" else "Save account"
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
                    Text("Save Account")
                }
            }
        }

        // ── Bottom spacer for FAB clearance ─────────────────────────
        item(key = "spacer") { Spacer(Modifier.height(32.dp)) }
    }
}

/**
 * Dropdown selector for [AccountType] values.
 *
 * Displays each type as a human-readable name (e.g. "Credit Card").
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountTypeDropdown(
    selectedType: AccountType,
    onTypeSelected: (AccountType) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val displayName = accountTypeDisplayName(selectedType)

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
                .semantics { contentDescription = "Account type: $displayName" },
            label = { Text("Type") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            AccountType.entries.forEach { type ->
                val name = accountTypeDisplayName(type)
                DropdownMenuItem(
                    text = {
                        Text(
                            text = name,
                            modifier = Modifier.semantics {
                                contentDescription = "Account type: $name"
                            },
                        )
                    },
                    onClick = {
                        onTypeSelected(type)
                        expanded = false
                    },
                )
            }
        }
    }
}

/**
 * Dropdown selector for currency codes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CurrencyDropdown(
    selectedCurrency: String,
    currencies: List<String>,
    onCurrencySelected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier,
    ) {
        OutlinedTextField(
            value = selectedCurrency,
            onValueChange = {},
            readOnly = true,
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .semantics { contentDescription = "Currency: $selectedCurrency" },
            label = { Text("Currency") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            currencies.forEach { currency ->
                DropdownMenuItem(
                    text = {
                        Text(
                            text = currency,
                            modifier = Modifier.semantics {
                                contentDescription = "Currency: $currency"
                            },
                        )
                    },
                    onClick = {
                        onCurrencySelected(currency)
                        expanded = false
                    },
                )
            }
        }
    }
}

/** Maps [AccountType] enum values to user-friendly display names. */
private fun accountTypeDisplayName(type: AccountType): String = when (type) {
    AccountType.CHECKING -> "Checking"
    AccountType.SAVINGS -> "Savings"
    AccountType.CREDIT_CARD -> "Credit Card"
    AccountType.CASH -> "Cash"
    AccountType.INVESTMENT -> "Investment"
    AccountType.LOAN -> "Loan"
    AccountType.OTHER -> "Other"
}

// ── Previews ────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "Account Create - Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Account Create - Dark",
)
@Composable
private fun AccountCreateFormPreview() {
    FinanceTheme(dynamicColor = false) {
        AccountCreateForm(
            state = AccountCreateUiState(
                name = "Main Checking",
                accountType = AccountType.CHECKING,
                currency = "USD",
                initialBalance = "1500.00",
            ),
            supportedCurrencies = listOf("USD", "EUR", "GBP", "JPY", "CAD"),
            onNameChange = {},
            onTypeChange = {},
            onCurrencyChange = {},
            onBalanceChange = {},
            onNoteChange = {},
            onSave = {},
        )
    }
}

@Preview(showBackground = true, name = "Account Create - Errors")
@Composable
private fun AccountCreateErrorsPreview() {
    FinanceTheme(dynamicColor = false) {
        AccountCreateForm(
            state = AccountCreateUiState(
                errors = listOf("Account name is required"),
            ),
            supportedCurrencies = listOf("USD", "EUR", "GBP", "JPY", "CAD"),
            onNameChange = {},
            onTypeChange = {},
            onCurrencyChange = {},
            onBalanceChange = {},
            onNoteChange = {},
            onSave = {},
        )
    }
}

@Preview(showBackground = true, name = "Account Create - Saving")
@Composable
private fun AccountCreateSavingPreview() {
    FinanceTheme(dynamicColor = false) {
        AccountCreateForm(
            state = AccountCreateUiState(
                name = "Savings Account",
                accountType = AccountType.SAVINGS,
                currency = "USD",
                initialBalance = "5000.00",
                isSaving = true,
            ),
            supportedCurrencies = listOf("USD", "EUR", "GBP", "JPY", "CAD"),
            onNameChange = {},
            onTypeChange = {},
            onCurrencyChange = {},
            onBalanceChange = {},
            onNoteChange = {},
            onSave = {},
        )
    }
}
