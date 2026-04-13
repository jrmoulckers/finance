// SPDX-License-Identifier: BUSL-1.1

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
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.AccountsViewModel
import com.finance.models.Account
import com.finance.models.AccountType
import com.finance.models.Transaction
import com.finance.models.TransactionType

// =============================================================================
// Accounts Screen — Master-Detail Layout (KMP shared models)
// =============================================================================

/**
 * Maps KMP shared [AccountType] to a display icon.
 *
 * Centralised here so that every composable referencing account types
 * shows a consistent icon, matching the Fluent Design icon vocabulary.
 */
private fun AccountType.toIcon(): ImageVector = when (this) {
    AccountType.CHECKING -> Icons.Filled.AccountBalance
    AccountType.SAVINGS -> Icons.Filled.Savings
    AccountType.CREDIT_CARD -> Icons.Filled.CreditCard
    AccountType.INVESTMENT -> Icons.AutoMirrored.Filled.ShowChart
    AccountType.CASH -> Icons.Filled.Wallet
    AccountType.LOAN -> Icons.Filled.CreditCard
    AccountType.OTHER -> Icons.Filled.AccountBalance
}

/**
 * Human-readable label for an [AccountType].
 */
private fun AccountType.displayName(): String = name.lowercase()
    .replace('_', ' ')
    .replaceFirstChar { it.uppercase() }

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
 * All account data flows from [AccountsViewModel], which loads from the
 * KMP shared repository layer — no hardcoded sample data.
 *
 * Right-click context menus on accounts and transactions for desktop UX.
 * Narrator reads account type, name, and balance for each item.
 */
@Composable
fun AccountsScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<AccountsViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading accounts"
                },
            )
        }
        return
    }

    val allAccounts = state.groups.flatMap { it.accounts }
    val selectedAccount = state.selectedAccount ?: allAccounts.firstOrNull()

    Row(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Accounts screen" },
    ) {
        // ── Master: Account list ──
        AccountListPanel(
            accounts = allAccounts,
            selectedId = selectedAccount?.id?.value,
            onSelect = { viewModel.selectAccount(it) },
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
        if (selectedAccount != null) {
            AccountDetailPanel(
                account = selectedAccount,
                transactions = state.selectedAccountTransactions,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
        }
    }
}

// =============================================================================
// Master panel — account list
// =============================================================================

@Composable
private fun AccountListPanel(
    accounts: List<Account>,
    selectedId: String?,
    onSelect: (Account) -> Unit,
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
                items(accounts, key = { it.id.value }) { account ->
                    AccountListItem(
                        account = account,
                        isSelected = account.id.value == selectedId,
                        onClick = { onSelect(account) },
                    )
                }
            }
        }
    }
}

@Composable
private fun AccountListItem(
    account: Account,
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
    val formattedBalance = CurrencyFormatter.format(account.currentBalance, account.currency)
    val typeName = account.type.displayName()

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
                        "${account.name}, $typeName, balance: $formattedBalance"
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
                    imageVector = account.type.toIcon(),
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
                        text = typeName,
                        style = MaterialTheme.typography.labelSmall,
                        color = contentColor.copy(alpha = 0.7f),
                    )
                }
                Text(
                    text = formattedBalance,
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
    account: Account,
    transactions: List<Transaction>,
    modifier: Modifier = Modifier,
) {
    val formattedBalance = CurrencyFormatter.format(account.currentBalance, account.currency)
    val typeName = account.type.displayName()

    Column(
        modifier = modifier.padding(start = FinanceDesktopTheme.spacing.lg),
    ) {
        // Account info header
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "${account.name}, balance: $formattedBalance"
                },
            colors = CardDefaults.elevatedCardColors(
                containerColor = MaterialTheme.colorScheme.secondaryContainer,
            ),
        ) {
            Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = account.type.toIcon(),
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
                    text = formattedBalance,
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
                    DetailChip("Type", typeName)
                    DetailChip("Status", if (account.isArchived) "Archived" else "Active")
                    DetailChip("Transactions", "${transactions.size}")
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

        if (transactions.isEmpty()) {
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
                items(transactions, key = { it.id.value }) { txn ->
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
private fun AccountTransactionRow(txn: Transaction) {
    val isExpense = txn.type == TransactionType.EXPENSE
    val amountColor = if (isExpense) MaterialTheme.colorScheme.error else Color(0xFF2E7D32)
    val formattedAmount = CurrencyFormatter.format(txn.amount, txn.currency, showSign = true)
    val payee = txn.payee ?: "Unknown"

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
                        "Transaction: $formattedAmount at $payee, ${txn.date}"
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
                        imageVector = if (isExpense) Icons.AutoMirrored.Filled.TrendingDown
                        else Icons.AutoMirrored.Filled.TrendingUp,
                        contentDescription = null,
                        tint = amountColor,
                        modifier = Modifier.size(20.dp),
                    )
                    Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                    Column {
                        Text(
                            text = payee,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = txn.date.toString(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    text = formattedAmount,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = amountColor,
                )
            }
        }
    }
}
