// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finance.android.ui.data.SampleData
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.AccountGroup
import com.finance.android.ui.viewmodel.AccountsViewModel
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Cents
import com.finance.models.types.Currency

/**
 * Accounts screen (#22) — lists accounts grouped by type.
 * Each account card shows name, icon, balance, and type badge.
 * Groups display total balance. Tap navigates to account detail.
 * FAB to add new account. Empty state when no accounts exist.
 */
@Composable
fun AccountsScreen(
    onAccountClick: (String) -> Unit = {},
    onAddAccount: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: AccountsViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val sel = state.selectedAccount
    if (sel != null) {
        AccountDetailScreen(sel, state.selectedAccountTransactions, viewModel::clearSelection)
        return
    }
    if (state.isLoading) {
        Box(modifier.fillMaxSize().semantics { contentDescription = "Loading accounts" },
            contentAlignment = Alignment.Center) {
            CircularProgressIndicator(Modifier.semantics { contentDescription = "Loading indicator" })
        }
        return
    }
    Scaffold(modifier = modifier, floatingActionButton = {
        FloatingActionButton(onClick = onAddAccount, modifier = Modifier.semantics { contentDescription = "Add new account" }) {
            Icon(Icons.Filled.Add, contentDescription = null)
        }
    }) { innerPadding ->
        if (state.isEmpty) AccountsEmptyState(Modifier.padding(innerPadding))
        else AccountsList(state.groups, { acct -> viewModel.selectAccount(acct); onAccountClick(acct.id.value) },
            Modifier.padding(innerPadding))
    }
}

@Composable
private fun AccountsEmptyState(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().semantics { contentDescription = "No accounts yet. Add your first account." },
        contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.AccountBalance, null, Modifier.size(64.dp), MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(16.dp))
            Text("No accounts yet", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Text("Add your first account to get started", style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AccountsList(groups: List<AccountGroup>, onAccountClick: (Account) -> Unit, modifier: Modifier = Modifier) {
    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        groups.forEach { group ->
            item(key = "hdr-${group.type}") { AccountGroupHeader(group) }
            items(group.accounts, key = { it.id.value }) { acct -> AccountCard(acct) { onAccountClick(acct) } }
        }
        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

@Composable
private fun AccountGroupHeader(group: AccountGroup) {
    Row(Modifier.fillMaxWidth().semantics { heading(); contentDescription = "${group.displayName}: total ${group.totalBalanceFormatted}" },
        horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(group.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(group.totalBalanceFormatted, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AccountCard(account: Account, onClick: () -> Unit) {
    val bal = CurrencyFormatter.format(account.currentBalance, account.currency)
    val icon = accountTypeIcon(account.type)
    val typeName = account.type.name.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }
    ElevatedCard(Modifier.fillMaxWidth().clickable(onClick = onClick).semantics {
        contentDescription = "${account.name}, $typeName, balance: $bal"
    }) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, Modifier.size(32.dp), MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(16.dp))
            Column(Modifier.weight(1f)) {
                Text(account.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                SuggestionChip(onClick = {}, label = { Text(typeName, style = MaterialTheme.typography.labelSmall) },
                    modifier = Modifier.semantics { contentDescription = "Account type: $typeName" })
            }
            Text(bal, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountDetailScreen(account: Account, transactions: List<Transaction>, onBack: () -> Unit) {
    val bal = CurrencyFormatter.format(account.currentBalance, account.currency)
    val typeName = account.type.name.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }
    Scaffold(topBar = {
        TopAppBar(title = { Text(account.name, modifier = Modifier.semantics { contentDescription = "Account: ${account.name}" }) },
            navigationIcon = {
                IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Navigate back" }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, null)
                }
            })
    }) { innerPadding ->
        LazyColumn(Modifier.fillMaxSize().padding(innerPadding), contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item(key = "info") {
                ElevatedCard(Modifier.fillMaxWidth().semantics { contentDescription = "${account.name}, balance: $bal" },
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column(Modifier.padding(20.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(accountTypeIcon(account.type), null, Modifier.size(28.dp), MaterialTheme.colorScheme.onSecondaryContainer)
                            Spacer(Modifier.width(12.dp))
                            Text(account.name, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSecondaryContainer)
                        }
                        Spacer(Modifier.height(16.dp))
                        Text("Current Balance", style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f))
                        Text(bal, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSecondaryContainer)
                        Spacer(Modifier.height(8.dp))
                        HorizontalDivider(color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.2f))
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            DetailItem("Type", typeName)
                            DetailItem("Currency", account.currency.code)
                            DetailItem("Status", if (account.isArchived) "Archived" else "Active")
                        }
                    }
                }
            }
            item(key = "hist-hdr") {
                Text("Transaction History", style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading(); contentDescription = "Transaction History section" })
            }
            if (transactions.isEmpty()) {
                item(key = "no-txn") {
                    Text("No transactions for this account", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = "No transactions for this account" })
                }
            } else {
                items(transactions, key = { it.id.value }) { txn -> AccountTxnItem(txn, account.currency) }
            }
            item(key = "spacer") { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
private fun DetailItem(label: String, value: String) {
    Column(Modifier.semantics { contentDescription = "$label: $value" }) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSecondaryContainer)
    }
}

@Composable
private fun AccountTxnItem(txn: Transaction, currency: Currency) {
    val isExp = txn.type == TransactionType.EXPENSE
    val amt = CurrencyFormatter.format(txn.amount, currency, showSign = true)
    val color = if (isExp) MaterialTheme.colorScheme.error else Color(0xFF2E7D32)
    val payee = txn.payee ?: "Unknown"
    val cat = SampleData.categoryMap[txn.categoryId]?.name ?: "Uncategorized"
    Card(Modifier.fillMaxWidth().semantics { contentDescription = "Transaction: $amt at $payee, ${txn.date}" }) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(if (isExp) Icons.Filled.TrendingDown else Icons.Filled.TrendingUp, null, tint = color, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(payee, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("$cat • ${txn.date}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(amt, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = color)
        }
    }
}

private fun accountTypeIcon(type: AccountType): ImageVector = when (type) {
    AccountType.CHECKING -> Icons.Filled.AccountBalance
    AccountType.SAVINGS -> Icons.Filled.Savings
    AccountType.CREDIT_CARD -> Icons.Filled.CreditCard
    AccountType.CASH -> Icons.Filled.Wallet
    AccountType.INVESTMENT -> Icons.Filled.ShowChart
    AccountType.LOAN -> Icons.Filled.AccountBalanceWallet
    AccountType.OTHER -> Icons.Filled.AccountBalance
}

@Preview(showBackground = true, showSystemUi = true)
@Composable
private fun AccountsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        AccountsList(
            groups = listOf(
                AccountGroup(AccountType.CHECKING, "Checking",
                    SampleData.accounts.filter { it.type == AccountType.CHECKING },
                    Cents(524_73L), "$524.73"),
                AccountGroup(AccountType.SAVINGS, "Savings",
                    SampleData.accounts.filter { it.type == AccountType.SAVINGS },
                    Cents(18_670_00L), "$18,670.00")),
            onAccountClick = {})
    }
}

@Preview(showBackground = true)
@Composable
private fun AccountsEmptyPreview() {
    FinanceTheme(dynamicColor = false) { AccountsEmptyState() }
}
