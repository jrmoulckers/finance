package com.finance.android.ui.components.states

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.PieChart
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * A reusable empty-state composable with icon, title, description,
 * and an optional call-to-action button.
 *
 * All text uses non-judgmental, encouraging copy.
 *
 * @param icon Icon displayed above the title.
 * @param iconContentDescription Accessibility description for the icon.
 * @param title Headline text (e.g. "No transactions yet").
 * @param description Supporting body text.
 * @param actionLabel Label for the optional CTA button. When `null`, no button is shown.
 * @param onAction Callback invoked when the CTA button is tapped.
 * @param modifier Additional [Modifier].
 */
@Composable
fun EmptyState(
    icon: ImageVector,
    iconContentDescription: String,
    title: String,
    description: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = "$title. $description"
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = iconContentDescription,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (actionLabel != null && onAction != null) {
            Spacer(modifier = Modifier.height(24.dp))
            Button(onClick = onAction) {
                Text(text = actionLabel)
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Pre-built variants
// ---------------------------------------------------------------------------

/**
 * Empty state shown when the user has no transactions.
 *
 * @param onAddTransaction Callback to navigate to the add-transaction flow.
 * @param modifier Additional [Modifier].
 */
@Composable
fun NoTransactionsEmptyState(
    onAddTransaction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    EmptyState(
        icon = Icons.Outlined.Receipt,
        iconContentDescription = "Transactions",
        title = "No transactions yet",
        description = "Add your first transaction to start tracking your finances.",
        actionLabel = "Add transaction",
        onAction = onAddTransaction,
        modifier = modifier,
    )
}

/**
 * Empty state shown when the user has no budgets.
 *
 * @param onCreateBudget Callback to navigate to the create-budget flow.
 * @param modifier Additional [Modifier].
 */
@Composable
fun NoBudgetsEmptyState(
    onCreateBudget: () -> Unit,
    modifier: Modifier = Modifier,
) {
    EmptyState(
        icon = Icons.Outlined.PieChart,
        iconContentDescription = "Budgets",
        title = "No budgets set",
        description = "Create one to track your spending and stay on top of your goals.",
        actionLabel = "Create budget",
        onAction = onCreateBudget,
        modifier = modifier,
    )
}

/**
 * Empty state shown when the user has no savings goals.
 *
 * @param onCreateGoal Callback to navigate to the create-goal flow.
 * @param modifier Additional [Modifier].
 */
@Composable
fun NoGoalsEmptyState(
    onCreateGoal: () -> Unit,
    modifier: Modifier = Modifier,
) {
    EmptyState(
        icon = Icons.Outlined.Flag,
        iconContentDescription = "Goals",
        title = "No goals yet",
        description = "Set a savings target to work toward something meaningful.",
        actionLabel = "Set a goal",
        onAction = onCreateGoal,
        modifier = modifier,
    )
}

/**
 * Empty state shown when the user has no linked accounts.
 *
 * @param onAddAccount Callback to navigate to the add-account flow.
 * @param modifier Additional [Modifier].
 */
@Composable
fun NoAccountsEmptyState(
    onAddAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    EmptyState(
        icon = Icons.Outlined.AccountBalance,
        iconContentDescription = "Accounts",
        title = "No accounts added",
        description = "Add an account to get started with your financial overview.",
        actionLabel = "Add account",
        onAction = onAddAccount,
        modifier = modifier,
    )
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

@Preview(showBackground = true, name = "EmptyState — Generic")
@Composable
private fun EmptyStatePreview() {
    MaterialTheme {
        EmptyState(
            icon = Icons.Outlined.Receipt,
            iconContentDescription = "Example",
            title = "Nothing here yet",
            description = "This is a generic empty state preview.",
            actionLabel = "Take action",
            onAction = {},
        )
    }
}

@Preview(showBackground = true, name = "NoTransactionsEmptyState")
@Composable
private fun NoTransactionsEmptyStatePreview() {
    MaterialTheme {
        NoTransactionsEmptyState(onAddTransaction = {})
    }
}

@Preview(showBackground = true, name = "NoBudgetsEmptyState")
@Composable
private fun NoBudgetsEmptyStatePreview() {
    MaterialTheme {
        NoBudgetsEmptyState(onCreateBudget = {})
    }
}

@Preview(showBackground = true, name = "NoGoalsEmptyState")
@Composable
private fun NoGoalsEmptyStatePreview() {
    MaterialTheme {
        NoGoalsEmptyState(onCreateGoal = {})
    }
}

@Preview(showBackground = true, name = "NoAccountsEmptyState")
@Composable
private fun NoAccountsEmptyStatePreview() {
    MaterialTheme {
        NoAccountsEmptyState(onAddAccount = {})
    }
}
