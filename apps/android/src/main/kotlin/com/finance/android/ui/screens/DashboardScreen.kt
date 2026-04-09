// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.data.SampleData
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.BudgetStatusUi
import com.finance.android.ui.viewmodel.DashboardUiState
import com.finance.android.ui.viewmodel.DashboardViewModel
import org.koin.compose.viewmodel.koinViewModel
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Currency

/**
 * Dashboard screen (#19) — the app's primary landing screen.
 *
 * Shows net worth, today's spending, budget health overview with
 * horizontal scrolling progress rings, recent transactions, and quick
 * action buttons. Supports pull-to-refresh. TalkBack accessible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onAddTransaction: () -> Unit = {},
    onViewAllTransactions: () -> Unit = {},
    onViewInsights: () -> Unit = {},
    onViewAccounts: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: DashboardViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    if (state.isLoading) {
        Box(modifier = modifier.fillMaxSize().semantics { contentDescription = "Loading dashboard" },
            contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.semantics { contentDescription = "Loading indicator" })
        }
        return
    }
    DashboardContent(state, viewModel::refresh, onAddTransaction, onViewAllTransactions, onViewInsights, onViewAccounts, modifier)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DashboardContent(
    state: DashboardUiState, onRefresh: () -> Unit,
    onAddTransaction: () -> Unit, onViewAllTransactions: () -> Unit,
    onViewInsights: () -> Unit, onViewAccounts: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = onRefresh,
        modifier = modifier.fillMaxSize()) {
        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item(key = "net-worth") { NetWorthCard(state.netWorthFormatted, onClick = onViewAccounts) }
            item(key = "spending") { SpendingSummaryRow(state.todaySpendingFormatted, state.monthlySpendingFormatted) }
            item(key = "insights") { InsightsCard(onViewInsights) }
            if (state.budgetStatuses.isNotEmpty()) {
                item(key = "budget-hdr") {
                    Text("Budget Health", style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics { heading(); contentDescription = "Budget Health section" })
                }
                item(key = "budget-row") { BudgetHealthRow(state.budgetStatuses) }
            }
            item(key = "recent-hdr") {
                Text("Recent Transactions", style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics { heading(); contentDescription = "Recent Transactions section" })
            }
            if (state.recentTransactions.isEmpty()) {
                item(key = "recent-empty") {
                    Text("No recent transactions", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = "No recent transactions" })
                }
            } else {
                items(state.recentTransactions, key = { it.id.value }) { txn ->
                    RecentTransactionItem(txn, state.currency)
                }
            }
            item(key = "actions") { QuickActionsRow(onAddTransaction, onViewAllTransactions) }
            item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
        }
    }
}

@Composable
private fun NetWorthCard(formatted: String, onClick: () -> Unit = {}) {
    ElevatedCard(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Net worth: $formatted. Tap to view accounts." },
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Net Worth", style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.semantics { contentDescription = "Net Worth label" })
            Spacer(Modifier.height(8.dp))
            Text(formatted, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
    }
}

@Composable
private fun SpendingSummaryRow(today: String, monthly: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        SpendingCard("Today", today, Icons.Filled.TrendingDown, Modifier.weight(1f))
        SpendingCard("This Month", monthly, Icons.Filled.AttachMoney, Modifier.weight(1f))
    }
}

@Composable
private fun SpendingCard(label: String, amount: String, icon: ImageVector, modifier: Modifier = Modifier) {
    Card(modifier = modifier.semantics { contentDescription = "$label spending: $amount" }) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(12.dp))
            Column {
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(amount, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun BudgetHealthRow(budgets: List<BudgetStatusUi>) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(horizontal = 4.dp)) {
        items(budgets, key = { it.name }) { BudgetHealthCard(it) }
    }
}

@Composable
private fun BudgetHealthCard(budget: BudgetStatusUi) {
    val healthColor = when (budget.health) {
        BudgetHealth.HEALTHY -> MaterialTheme.colorScheme.primary
        BudgetHealth.WARNING -> Color(0xFFFF9800)
        BudgetHealth.OVER -> MaterialTheme.colorScheme.error
    }
    val healthLabel = when (budget.health) {
        BudgetHealth.HEALTHY -> "healthy"; BudgetHealth.WARNING -> "warning"; BudgetHealth.OVER -> "over budget"
    }
    val progress by animateFloatAsState(budget.utilizationPercent.coerceIn(0f, 1f),
        animationSpec = tween(800), label = "budget-progress")

    Card(modifier = Modifier.width(140.dp).semantics {
        contentDescription = "${budget.name}: ${budget.spent} of ${budget.limit}, $healthLabel"
    }) {
        Column(Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                val track = MaterialTheme.colorScheme.surfaceVariant
                Canvas(Modifier.size(64.dp)) {
                    val sw = 6.dp.toPx()
                    val arcSize = Size(size.width - sw, size.height - sw)
                    val tl = Offset(sw / 2, sw / 2)
                    drawArc(track, -90f, 360f, false, tl, arcSize, style = Stroke(sw, cap = StrokeCap.Round))
                    drawArc(healthColor, -90f, progress * 360f, false, tl, arcSize, style = Stroke(sw, cap = StrokeCap.Round))
                }
                Text("${(budget.utilizationPercent * 100).toInt()}%", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(8.dp))
            Text(budget.name, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${budget.spent} / ${budget.limit}", style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun RecentTransactionItem(transaction: Transaction, currency: Currency) {
    val isExpense = transaction.type == TransactionType.EXPENSE
    val amtFmt = CurrencyFormatter.format(transaction.amount, currency, showSign = true)
    val color = if (isExpense) MaterialTheme.colorScheme.error else Color(0xFF2E7D32)
    val cat = SampleData.categoryMap[transaction.categoryId]?.name ?: "Uncategorized"
    val payee = transaction.payee ?: "Unknown"
    Card(Modifier.fillMaxWidth().semantics { contentDescription = "Transaction: $amtFmt at $payee, $cat" }) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(if (isExpense) Icons.Filled.TrendingDown else Icons.Filled.TrendingUp,
                    contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(payee, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(cat, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(amtFmt, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = color)
        }
    }
}

@Composable
private fun QuickActionsRow(onAdd: () -> Unit, onViewAll: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        FilledTonalButton(onClick = onAdd, modifier = Modifier.weight(1f).semantics { contentDescription = "Add new transaction" }) {
            Icon(Icons.Filled.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Add Transaction")
        }
        FilledTonalButton(onClick = onViewAll, modifier = Modifier.weight(1f).semantics { contentDescription = "View all transactions" }) {
            Icon(Icons.Filled.List, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("View All")
        }
    }
}

/** Card that navigates to the Analytics / Spending Insights screen. */
@Composable
private fun InsightsCard(onClick: () -> Unit) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().semantics {
            contentDescription = "View spending insights and analytics"
        },
    ) {
        Row(
            Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Insights,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Spending Insights", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium)
                    Text(
                        "View trends and analytics",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Icon(
                Icons.Filled.TrendingUp,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Preview(showBackground = true, showSystemUi = true, name = "Dashboard - Light")
@Preview(showBackground = true, showSystemUi = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Dashboard - Dark")
@Composable
private fun DashboardScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        DashboardContent(
            state = DashboardUiState(isLoading = false, netWorthFormatted = "$116,899.22",
                todaySpendingFormatted = "$28.78", monthlySpendingFormatted = "$1,247.63",
                budgetStatuses = listOf(
                    BudgetStatusUi("Groceries", "$248", "$600", "+$352", 0.41f, BudgetHealth.HEALTHY, null),
                    BudgetStatusUi("Dining", "$245", "$300", "+$55", 0.82f, BudgetHealth.WARNING, null),
                    BudgetStatusUi("Transport", "$89", "$200", "+$111", 0.45f, BudgetHealth.HEALTHY, null),
                ),
                recentTransactions = SampleData.transactions.take(5), currency = Currency.USD),
            onRefresh = {}, onAddTransaction = {}, onViewAllTransactions = {}, onViewInsights = {}, onViewAccounts = {})
    }
}

@Preview(showBackground = true, name = "Dashboard - Loading - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Dashboard - Loading - Dark")
@Composable
private fun DashboardLoadingPreview() {
    FinanceTheme(dynamicColor = false) {
        DashboardContent(
            state = DashboardUiState(isLoading = false, isRefreshing = false,
                netWorthFormatted = "$0.00", todaySpendingFormatted = "$0.00",
                monthlySpendingFormatted = "$0.00", budgetStatuses = emptyList(),
                recentTransactions = emptyList(), currency = Currency.USD),
            onRefresh = {}, onAddTransaction = {}, onViewAllTransactions = {}, onViewInsights = {}, onViewAccounts = {})
    }
}

@Preview(showBackground = true, name = "Dashboard - Over Budget - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Dashboard - Over Budget - Dark")
@Composable
private fun DashboardOverBudgetPreview() {
    FinanceTheme(dynamicColor = false) {
        DashboardContent(
            state = DashboardUiState(isLoading = false, netWorthFormatted = "$42,350.00",
                todaySpendingFormatted = "$156.40", monthlySpendingFormatted = "$3,892.15",
                budgetStatuses = listOf(
                    BudgetStatusUi("Dining", "$380", "$300", "-$80", 1.27f, BudgetHealth.OVER, null),
                    BudgetStatusUi("Shopping", "$510", "$500", "-$10", 1.02f, BudgetHealth.OVER, null),
                    BudgetStatusUi("Groceries", "$580", "$600", "+$20", 0.97f, BudgetHealth.WARNING, null),
                ),
                recentTransactions = SampleData.transactions.take(3), currency = Currency.USD),
            onRefresh = {}, onAddTransaction = {}, onViewAllTransactions = {}, onViewInsights = {}, onViewAccounts = {})
    }
}
