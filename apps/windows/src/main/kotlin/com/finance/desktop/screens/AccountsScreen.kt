package com.finance.desktop.screens

import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.desktop.theme.FinanceDesktopTheme

// =============================================================================
// Sample data (UI-layer placeholders)
// =============================================================================

private data class AccountItem(
    val id: String,
    val name: String,
    val type: String,
    val typeIcon: ImageVector,
    val balance: String,
    val transactions: List<AccountTransaction>,
)

private data class AccountTransaction(
    val id: String,
    val payee: String,
    val amount: String,
    val isExpense: Boolean,
    val date: String,
    val category: String,
)

private val sampleAccounts = listOf(
    AccountItem(
        "1", "Main Checking", "Checking", Icons.Filled.AccountBalance, "\$5,247.30",
        listOf(
            AccountTransaction("t1", "Whole Foods", "-\$52.30", true, "Mar 6", "Groceries"),
            AccountTransaction("t2", "Salary", "+\$4,200.00", false, "Mar 5", "Income"),
            AccountTransaction("t3", "Electric Bill", "-\$125.00", true, "Mar 3", "Utilities"),
            AccountTransaction("t4", "Gas Station", "-\$45.00", true, "Mar 2", "Transport"),
        ),
    ),
    AccountItem(
        "2", "Savings Account", "Savings", Icons.Filled.Savings, "\$18,670.00",
        listOf(
            AccountTransaction("t5", "Interest", "+\$12.50", false, "Mar 1", "Income"),
            AccountTransaction("t6", "Transfer In", "+\$500.00", false, "Feb 28", "Transfer"),
        ),
    ),
    AccountItem(
        "3", "Visa Card", "Credit Card", Icons.Filled.CreditCard, "-\$1,284.50",
        listOf(
            AccountTransaction("t7", "Netflix", "-\$15.99", true, "Mar 5", "Entertainment"),
            AccountTransaction("t8", "Restaurant", "-\$68.00", true, "Mar 4", "Dining"),
            AccountTransaction("t9", "Amazon", "-\$42.99", true, "Mar 3", "Shopping"),
        ),
    ),
    AccountItem(
        "4", "Investment Portfolio", "Investment", Icons.Filled.ShowChart, "\$92,500.00",
        listOf(
            AccountTransaction("t10", "Dividend", "+\$125.00", false, "Mar 1", "Investment"),
        ),
    ),
    AccountItem(
        "5", "Cash Wallet", "Cash", Icons.Filled.Wallet, "\$185.42",
        listOf(),
    ),
)

// =============================================================================
// Accounts Screen — Master-Detail Layout
// =============================================================================

/**
 * Master-detail accounts screen for the desktop Finance application.
 *
 * Layout:
 * ```
 * ┌─────────────────┬────────────────────────────────┐
 * │  Account List    │  Account Detail                │
 * │  (scrollable)   │  + Transaction History          │
 * │                 │  (scrollable)                   │
 * └─────────────────┴────────────────────────────────┘
 * ```
 *
 * Right-click context menus on accounts and transactions for desktop UX.
 * Narrator reads account type, name, and balance for each item.
 */
@Composable
fun AccountsScreen(modifier: Modifier = Modifier) {
    var selectedAccountId by remember { mutableStateOf(sampleAccounts.first().id) }
    val selectedAccount = sampleAccounts.find { it.id == selectedAccountId }
        ?: sampleAccounts.first()

    Row(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Accounts screen" },
    ) {
        // ── Master: Account list ──
        AccountListPanel(
            accounts = sampleAccounts,
            selectedId = selectedAccount.id,
            onSelect = { selectedAccountId = it.id },
            modifier = Modifier
                .width(320.dp)
                .fillMaxHeight(),
        )

        VerticalDivider(
            modifier = Modifier
                .fillMaxHeight()
                .padding(horizontal = FinanceDesktopTheme.spacing.sm),
            color = MaterialTheme.colorScheme.outlineVariant,
        )

        // ── Detail: selected account info + transaction history ──
        AccountDetailPanel(
            account = selectedAccount,
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
        )
    }
}

// =============================================================================
// Master panel — account list
// =============================================================================

@Composable
private fun AccountListPanel(
    accounts: List<AccountItem>,
    selectedId: String,
    onSelect: (AccountItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = "Accounts",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Accounts list"
                },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            ) {
                items(accounts, key = { it.id }) { account ->
                    AccountListItem(
                        account = account,
                        isSelected = account.id == selectedId,
                        onClick = { onSelect(account) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AccountListItem(
    account: AccountItem,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val containerColor = if (isSelected) {
        MaterialTheme.colorScheme.primaryContainer
    } else {
        MaterialTheme.colorScheme.surface
    }
    val contentColor = if (isSelected) {
        MaterialTheme.colorScheme.onPrimaryContainer
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("View Account") { onClick() },
                ContextMenuItem("Edit Account") { /* edit */ },
                ContextMenuItem("Archive Account") { /* archive */ },
            )
        },
    ) {
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .semantics {
                    contentDescription =
                        "${account.name}, ${account.type}, balance: ${account.balance}"
                    selected = isSelected
                },
            colors = CardDefaults.elevatedCardColors(containerColor = containerColor),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(FinanceDesktopTheme.spacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = account.typeIcon,
                    contentDescription = null,
                    tint = contentColor,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = account.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        color = contentColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = account.type,
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.7f),
                    )
                }
                Text(
                    text = account.balance,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = contentColor,
                )
            }
        }
    }
}

// =============================================================================
// Detail panel — account info + transaction history
// =============================================================================

@Composable
private fun AccountDetailPanel(
    account: AccountItem,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(start = FinanceDesktopTheme.spacing.lg),
    ) {
        // Account info header
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "${account.name}, balance: ${account.balance}"
                },
            colors = CardDefaults.elevatedCardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
            ),
        ) {
            Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = account.typeIcon,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = account.name,
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.semantics { heading() },
                    )
                }
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                Text(
                    text = "Current Balance",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f),
                )
                Text(
                    text = account.balance,
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                HorizontalDivider(
                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.2f),
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    DetailChip("Type", account.type)
                    DetailChip("Status", "Active")
                    DetailChip("Transactions", "${account.transactions.size}")
                }
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // Transaction history
        Text(
            text = "Transaction History",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Transaction History for ${account.name}"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

        if (account.transactions.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxWidth().weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "No transactions for this account",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "No transactions for this account"
                    },
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
            ) {
                items(account.transactions, key = { it.id }) { txn ->
                    AccountTransactionRow(txn)
                }
            }
        }
    }
}

@Composable
private fun DetailChip(label: String, value: String) {
    Column(
        modifier = Modifier.semantics { contentDescription = "$label: $value" },
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSecondaryContainer,
        )
    }
}

@Composable
private fun AccountTransactionRow(txn: AccountTransaction) {
    val amountColor = if (txn.isExpense) MaterialTheme.colorScheme.error else Color(0xFF2E7D32)

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("View Details") { /* view */ },
                ContextMenuItem("Edit Transaction") { /* edit */ },
                ContextMenuItem("Copy Amount") { /* copy */ },
                ContextMenuItem("Delete Transaction") { /* delete */ },
            )
        },
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription =
                        "Transaction: ${txn.amount} at ${txn.payee}, ${txn.category}, ${txn.date}"
                },
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        horizontal = FinanceDesktopTheme.spacing.md,
                        vertical = FinanceDesktopTheme.spacing.sm,
                    ),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(
                        imageVector = if (txn.isExpense) Icons.Filled.TrendingDown
                        else Icons.Filled.TrendingUp,
                        contentDescription = null,
                        tint = amountColor,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Column {
                        Text(
                            text = txn.payee,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "${txn.category} • ${txn.date}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    text = txn.amount,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = amountColor,
                )
            }
        }
    }
}
