// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Account type for display purposes, mirroring [com.finance.models.AccountType].
 */
enum class AccountDisplayType(val label: String) {
    CHECKING("Checking"),
    SAVINGS("Savings"),
    CREDIT_CARD("Credit Card"),
    CASH("Cash"),
    INVESTMENT("Investment"),
    LOAN("Loan"),
    OTHER("Other"),
}

/**
 * Presentation-layer account used by the selector dropdown.
 */
data class AccountDisplayItem(
    val id: String,
    val name: String,
    val type: AccountDisplayType,
    val formattedBalance: String,
)

/**
 * Returns the Material icon for the given account type.
 */
private fun iconForAccountType(type: AccountDisplayType): ImageVector = when (type) {
    AccountDisplayType.CHECKING -> Icons.Default.AccountBalance
    AccountDisplayType.SAVINGS -> Icons.Default.Savings
    AccountDisplayType.CREDIT_CARD -> Icons.Default.CreditCard
    AccountDisplayType.CASH -> Icons.Default.Wallet
    AccountDisplayType.INVESTMENT -> Icons.Default.ShowChart
    AccountDisplayType.LOAN -> Icons.Default.Payments
    AccountDisplayType.OTHER -> Icons.Default.AccountBalance
}

/**
 * Dropdown selector that displays accounts grouped by type.
 *
 * Shows the currently selected account in an outlined card. Tapping
 * opens a dropdown menu with accounts grouped under type headers.
 *
 * @param accounts Full list of accounts to display.
 * @param selectedAccountId The currently selected account ID, or null.
 * @param onAccountSelected Callback invoked when the user picks an account.
 * @param label Optional label shown above the selector.
 * @param modifier Modifier applied to the outer column.
 */
@Composable
fun AccountSelector(
    accounts: List<AccountDisplayItem>,
    selectedAccountId: String?,
    onAccountSelected: (AccountDisplayItem) -> Unit,
    label: String? = null,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedAccount = accounts.find { it.id == selectedAccountId }
    val groupedAccounts = remember(accounts) {
        accounts.groupBy { it.type }
    }

    Column(modifier = modifier) {
        if (label != null) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .padding(bottom = 4.dp)
                    .semantics { contentDescription = "$label label" },
            )
        }

        OutlinedCard(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded }
                .semantics {
                    contentDescription = buildString {
                        append("Account selector")
                        if (selectedAccount != null) {
                            append(", selected: ${selectedAccount.name}")
                            append(", ${selectedAccount.type.label}")
                            append(", balance ${selectedAccount.formattedBalance}")
                        } else {
                            append(", no account selected")
                        }
                        append(". Double tap to ${if (expanded) "close" else "open"}")
                    }
                },
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
            ) {
                if (selectedAccount != null) {
                    Icon(
                        imageVector = iconForAccountType(selectedAccount.type),
                        contentDescription = null, // parent semantics covers this
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(24.dp),
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = selectedAccount.name,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "${selectedAccount.type.label} \u00B7 ${selectedAccount.formattedBalance}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    Text(
                        text = "Select an account",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                }

                Icon(
                    imageVector = if (expanded) {
                        Icons.Default.KeyboardArrowUp
                    } else {
                        Icons.Default.KeyboardArrowDown
                    },
                    contentDescription = if (expanded) "Collapse account list" else "Expand account list",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .semantics { contentDescription = "Account dropdown menu" },
        ) {
            groupedAccounts.entries.forEachIndexed { groupIndex, (type, accountsInGroup) ->
                if (groupIndex > 0) {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                }

                // Group header
                Text(
                    text = type.label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .semantics { contentDescription = "${type.label} accounts group" },
                )

                accountsInGroup.forEach { account ->
                    val isSelected = account.id == selectedAccountId
                    DropdownMenuItem(
                        text = {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.clearAndSetSemantics {
                                    contentDescription = buildString {
                                        append("${account.name}, ${account.type.label}")
                                        append(", balance ${account.formattedBalance}")
                                        if (isSelected) append(", currently selected")
                                    }
                                },
                            ) {
                                Icon(
                                    imageVector = iconForAccountType(account.type),
                                    contentDescription = null,
                                    tint = if (isSelected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                    modifier = Modifier.size(20.dp),
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = account.name,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    )
                                    Text(
                                        text = account.formattedBalance,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        },
                        onClick = {
                            onAccountSelected(account)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

// -- Previews -----------------------------------------------------------------

private val sampleAccounts = listOf(
    AccountDisplayItem("1", "Main Checking", AccountDisplayType.CHECKING, "\$5,230.00"),
    AccountDisplayItem("2", "Emergency Fund", AccountDisplayType.SAVINGS, "\$12,500.00"),
    AccountDisplayItem("3", "Travel Savings", AccountDisplayType.SAVINGS, "\$3,200.00"),
    AccountDisplayItem("4", "Visa Platinum", AccountDisplayType.CREDIT_CARD, "-\$1,450.00"),
    AccountDisplayItem("5", "Brokerage", AccountDisplayType.INVESTMENT, "\$45,000.00"),
    AccountDisplayItem("6", "Cash Wallet", AccountDisplayType.CASH, "\$120.00"),
)

@Preview(showBackground = true, name = "AccountSelector - with selection")
@Composable
private fun AccountSelectorSelectedPreview() {
    MaterialTheme {
        AccountSelector(
            accounts = sampleAccounts,
            selectedAccountId = "1",
            onAccountSelected = {},
            label = "From Account",
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Preview(showBackground = true, name = "AccountSelector - no selection")
@Composable
private fun AccountSelectorEmptyPreview() {
    MaterialTheme {
        AccountSelector(
            accounts = sampleAccounts,
            selectedAccountId = null,
            onAccountSelected = {},
            label = "Account",
            modifier = Modifier.padding(16.dp),
        )
    }
}
