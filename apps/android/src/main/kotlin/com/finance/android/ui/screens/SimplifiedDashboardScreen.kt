// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.finance.android.ui.viewmodel.DashboardViewModel
import org.koin.compose.viewmodel.koinViewModel

/**
 * Simplified dashboard for cognitive accessibility mode.
 *
 * Shows only essential financial information with:
 * - Large, clear text (minimum 18sp body, 28sp headings)
 * - Enlarged touch targets (minimum 56dp)
 * - Reduced information density
 * - Plain language labels
 * - High-contrast card borders
 *
 * ## Accessibility
 * - All cards have semantic `contentDescription`.
 * - Touch targets exceed WCAG 2.2 minimum of 44×44dp.
 * - Headings use `semantics { heading() }`.
 * - No animations that could cause cognitive overload.
 *
 * @param onAddTransaction Callback for the "Add Transaction" action.
 * @param onViewAccounts Callback to navigate to accounts list.
 * @param onViewBudgets Callback to navigate to budgets list.
 * @param viewModel Dashboard ViewModel for financial data.
 */
@Composable
fun SimplifiedDashboardScreen(
    onAddTransaction: () -> Unit,
    onViewAccounts: () -> Unit,
    onViewBudgets: () -> Unit,
    viewModel: DashboardViewModel = koinViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .semantics { contentDescription = "Simplified dashboard" },
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // Greeting
        Text(
            text = "Your Money",
            style = MaterialTheme.typography.headlineLarge.copy(
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
            ),
            modifier = Modifier.semantics { heading() },
        )

        // Total balance card
        SimplifiedInfoCard(
            icon = Icons.Default.AccountBalance,
            label = "You have",
            value = uiState.netWorthFormatted.ifEmpty { "$0.00" },
            description = "Your total balance across all accounts",
        )

        // Monthly spending card
        SimplifiedInfoCard(
            icon = Icons.Default.ShoppingCart,
            label = "This month you spent",
            value = uiState.monthlySpendingFormatted.ifEmpty { "$0.00" },
            description = "Total spending this month",
        )

        // Budget status card
        SimplifiedInfoCard(
            icon = Icons.Default.Savings,
            label = "Budget status",
            value = if (uiState.budgetStatuses.isEmpty()) {
                "No budgets set"
            } else {
                "${uiState.budgetStatuses.size} spending plan(s) active"
            },
            description = "Your spending plan status",
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Large action buttons
        SimplifiedActionButton(
            text = "Add Transaction",
            icon = Icons.Default.Add,
            onClick = onAddTransaction,
            description = "Add a new money in or money out entry",
        )

        SimplifiedActionButton(
            text = "View Accounts",
            icon = Icons.Default.AccountBalance,
            onClick = onViewAccounts,
            description = "See all your accounts",
        )

        SimplifiedActionButton(
            text = "Spending Plans",
            icon = Icons.Default.Savings,
            onClick = onViewBudgets,
            description = "See your spending plans",
        )
    }
}

/**
 * Large, clear info card for the simplified dashboard.
 */
@Composable
private fun SimplifiedInfoCard(
    icon: ImageVector,
    label: String,
    value: String,
    description: String,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = description },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        ),
    ) {
        Row(
            modifier = Modifier.padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(modifier = Modifier.padding(start = 16.dp)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = 18.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = value,
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Bold,
                    ),
                )
            }
        }
    }
}

/**
 * Large action button with 56dp minimum height for cognitive accessibility.
 */
@Composable
private fun SimplifiedActionButton(
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    description: String,
) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .semantics { contentDescription = description },
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(28.dp),
        )
        Spacer(modifier = Modifier.size(12.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.titleMedium.copy(
                fontSize = 20.sp,
                fontWeight = FontWeight.Medium,
            ),
        )
    }
}