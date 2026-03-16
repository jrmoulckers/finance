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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.finance.android.ui.components.AmountInput
import com.finance.android.ui.viewmodel.AccountsViewModel
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.AccountType
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.launch
import org.koin.compose.viewmodel.koinViewModel

private val creatableAccountTypes = listOf(
    AccountType.CHECKING,
    AccountType.SAVINGS,
    AccountType.CREDIT_CARD,
    AccountType.INVESTMENT,
    AccountType.CASH,
)

private val supportedCurrencies = listOf(
    Currency.USD,
    Currency.EUR,
    Currency.GBP,
    Currency.CAD,
    Currency.JPY,
)

/**
 * Account creation form for adding a new account from the Accounts tab.
 *
 * Collects the account name, type, opening balance, and currency before saving
 * through [AccountsViewModel] and returning to the previous destination.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountCreateScreen(
    onSaved: () -> Unit = {},
    onBack: () -> Unit = {},
    viewModel: AccountsViewModel = koinViewModel(),
) {
    var name by rememberSaveable { mutableStateOf("") }
    var selectedTypeName by rememberSaveable { mutableStateOf(AccountType.CHECKING.name) }
    var selectedCurrencyCode by rememberSaveable { mutableStateOf(Currency.USD.code) }
    var initialBalanceCents by rememberSaveable { mutableStateOf(0L) }
    var nameError by rememberSaveable { mutableStateOf<String?>(null) }
    var typeExpanded by remember { mutableStateOf(false) }
    var currencyExpanded by remember { mutableStateOf(false) }
    var isSaving by rememberSaveable { mutableStateOf(false) }

    val coroutineScope = rememberCoroutineScope()
    val selectedType = creatableAccountTypes.first { it.name == selectedTypeName }
    val selectedCurrency = supportedCurrencies.first { it.code == selectedCurrencyCode }
    val formattedBalance = CurrencyFormatter.format(Cents(initialBalanceCents), selectedCurrency)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Add Account",
                        modifier = Modifier.semantics {
                            contentDescription = "Add account"
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.semantics {
                            contentDescription = "Back to accounts"
                        },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = onBack,
                    modifier = Modifier
                        .weight(1f)
                        .semantics { contentDescription = "Cancel account creation" },
                    enabled = !isSaving,
                ) {
                    Text("Cancel")
                }
                Button(
                    onClick = {
                        val trimmedName = name.trim()
                        if (trimmedName.isBlank()) {
                            nameError = "Account name is required"
                            return@Button
                        }
                        nameError = null
                        coroutineScope.launch {
                            isSaving = true
                            viewModel.createAccount(
                                name = trimmedName,
                                accountType = selectedType,
                                initialBalance = Cents(initialBalanceCents),
                                currency = selectedCurrency,
                            )
                            isSaving = false
                            onSaved()
                        }
                    },
                    modifier = Modifier
                        .weight(1f)
                        .semantics { contentDescription = "Save new account" },
                    enabled = !isSaving,
                ) {
                    Text(if (isSaving) "Saving…" else "Save")
                }
            }
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item(key = "account-name") {
                Column {
                    Text(
                        text = "Account name",
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = name,
                        onValueChange = {
                            name = it
                            if (nameError != null) {
                                nameError = null
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { contentDescription = "Account name input" },
                        label = { Text("Account name") },
                        placeholder = { Text("e.g. Everyday Checking") },
                        isError = nameError != null,
                        supportingText = nameError?.let { message ->
                            { Text(message) }
                        },
                        singleLine = true,
                    )
                }
            }
            item(key = "account-type") {
                Column {
                    Text(
                        text = "Account type",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Account type selector"
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                    ExposedDropdownMenuBox(
                        expanded = typeExpanded,
                        onExpandedChange = { typeExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = selectedType.displayLabel(),
                            onValueChange = {},
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .semantics {
                                    contentDescription = "Account type, ${selectedType.displayLabel()}"
                                },
                            readOnly = true,
                            label = { Text("Account type") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded)
                            },
                        )
                        ExposedDropdownMenu(
                            expanded = typeExpanded,
                            onDismissRequest = { typeExpanded = false },
                        ) {
                            creatableAccountTypes.forEach { accountType ->
                                DropdownMenuItem(
                                    text = { Text(accountType.displayLabel()) },
                                    onClick = {
                                        selectedTypeName = accountType.name
                                        typeExpanded = false
                                    },
                                )
                            }
                        }
                    }
                }
            }
            item(key = "currency") {
                Column {
                    Text(
                        text = "Currency",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Currency selector"
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                    ExposedDropdownMenuBox(
                        expanded = currencyExpanded,
                        onExpandedChange = { currencyExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = selectedCurrency.code,
                            onValueChange = {},
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                .semantics {
                                    contentDescription = "Currency, ${selectedCurrency.code}"
                                },
                            readOnly = true,
                            label = { Text("Currency") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = currencyExpanded)
                            },
                        )
                        ExposedDropdownMenu(
                            expanded = currencyExpanded,
                            onDismissRequest = { currencyExpanded = false },
                        ) {
                            supportedCurrencies.forEach { currency ->
                                DropdownMenuItem(
                                    text = { Text("${currency.code} (${currency.symbol()})") },
                                    onClick = {
                                        selectedCurrencyCode = currency.code
                                        currencyExpanded = false
                                    },
                                )
                            }
                        }
                    }
                }
            }
            item(key = "opening-balance") {
                Column {
                    Text(
                        text = "Initial balance",
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Initial balance input"
                        },
                    )
                    Spacer(Modifier.height(8.dp))
                    AmountInput(
                        amountCents = initialBalanceCents,
                        onAmountChange = { initialBalanceCents = it },
                        currencySymbol = selectedCurrency.symbol(),
                        decimalPlaces = selectedCurrency.decimalPlaces,
                        label = "Initial balance",
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            item(key = "summary") {
                ElevatedCard(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            contentDescription = "Account summary, ${name.ifBlank { "New account" }}, ${selectedType.displayLabel()}, opening balance $formattedBalance, currency ${selectedCurrency.code}"
                        },
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("Summary")
                        Text("Name: ${name.ifBlank { "New account" }}")
                        Text("Type: ${selectedType.displayLabel()}")
                        Text("Opening balance: $formattedBalance")
                        Text("Currency: ${selectedCurrency.code}")
                    }
                }
            }
        }
    }
}

private fun AccountType.displayLabel(): String = when (this) {
    AccountType.CHECKING -> "Checking"
    AccountType.SAVINGS -> "Savings"
    AccountType.CREDIT_CARD -> "Credit Card"
    AccountType.CASH -> "Cash"
    AccountType.INVESTMENT -> "Investment"
    AccountType.LOAN -> "Loan"
    AccountType.OTHER -> "Other"
}

private fun Currency.symbol(): String = when (code) {
    Currency.USD.code -> "$"
    Currency.EUR.code -> "€"
    Currency.GBP.code -> "£"
    Currency.CAD.code -> "C$"
    Currency.JPY.code -> "¥"
    else -> code
}
