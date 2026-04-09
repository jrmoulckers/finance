// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
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
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.TrendingDown
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.BudgetStatusUi
import com.finance.desktop.viewmodel.DashboardViewModel
import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.types.Currency

// =============================================================================
// Dashboard Screen — wired to DashboardViewModel (KMP shared logic)
// =============================================================================

/**
 * Multi-panel dashboard for the desktop Finance application.
 *
 * Layout (Fluent Design, mouse-optimized spacing):
 * ```
 * ┌───────────────────────┬──────────────────┐
 * │  Net Worth Card       │  Recent          │
 * │  Spending Summary     │  Transactions    │
 * │                       │  (scrollable)    │
 * ├───────────────────────┴──────────────────┤
 * │  Budget Health (horizontal cards)         │
 * └──────────────────────────────────────────┘
 * ```
 *
 * All financial computations (net worth, spending totals, budget utilisation)
 * are performed by the KMP shared packages (`packages/core`) via
 * [DashboardViewModel], eliminating duplicate logic between platforms.
 *
 * Context menus on transaction items provide right-click actions.
 * Narrator reads every card via semantic content descriptions.
 */
@Composable
fun DashboardScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<DashboardViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading dashboard"
                },
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Dashboard screen" },
    ) {
        // ── Top half: summary (left) + recent transactions (right) ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
        ) {
            // Left column: net worth + spending summary
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                NetWorthCard(state.netWorthFormatted)
                SpendingSummaryRow(state.todaySpendingFormatted, state.monthlySpendingFormatted)
            }

            // Right column: recent transactions
            RecentTransactionsPanel(
                transactions = state.recentTransactions,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            )
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Bottom: budget health cards ──
        BudgetHealthSection(state.budgetStatuses)
    }
}

// =============================================================================
// Sub-composables
// =============================================================================

@Composable
private fun NetWorthCard(formatted: String) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Net worth: $formatted" },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Filled.AccountBalance,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
            Text(
                text = "Net Worth",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
            Text(
                text = formatted,
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.semantics { heading() },
            )
        }
    }
}

@Composable
private fun SpendingSummaryRow(today: String, monthly: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
    ) {
        SpendingCard(
            label = "Today",
            amount = today,
            icon = Icons.Filled.TrendingDown,
            modifier = Modifier.weight(1f),
        )
        SpendingCard(
            label = "This Month",
            amount = monthly,
            icon = Icons.Filled.AttachMoney,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SpendingCard(
    label: String,
    amount: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.semantics { contentDescription = "$label spending: $amount" },
    ) {
        Row(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(24.dp),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Column {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = amount,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun RecentTransactionsPanel(
    transactions: List<Transaction>,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        tonalElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg)) {
            Text(
                text = "Recent Transactions",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "Recent Transactions section"
                },
            )
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

            if (transactions.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "No recent transactions",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics {
                            contentDescription = "No recent transactions"
                        },
                    )
                }
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                ) {
                    items(transactions, key = { it.id.value }) { txn ->
                        TransactionRow(txn)
                    }
                }
            }
        }
    }
}

/**
 * Single transaction row with right-click context menu.
 *
 * Renders amount formatting using the KMP shared [CurrencyFormatter]
 * to match the exact output on Android/iOS/Web.
 */
@Composable
private fun TransactionRow(transaction: Transaction) {
    val isExpense = transaction.type == TransactionType.EXPENSE
    val amountColor = if (isExpense) {
        MaterialTheme.colorScheme.error
    } else {
        Color(0xFF2E7D32)
    }
    val formattedAmount = CurrencyFormatter.format(
        transaction.amount,
        transaction.currency,
        showSign = true,
    )
    val payee = transaction.payee ?: "Unknown"

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("View Details") { /* navigate to detail */ },
                ContextMenuItem("Edit Transaction") { /* open edit */ },
                ContextMenuItem("Copy Amount") { /* copy to clipboard */ },
            )
        },
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription =
                        "Transaction: $formattedAmount at $payee, ${transaction.date}"
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
                        imageVector = if (isExpense) Icons.Filled.TrendingDown
                        else Icons.Filled.TrendingUp,
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
                            text = transaction.date.toString(),
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

@Composable
private fun BudgetHealthSection(budgets: List<BudgetStatusUi>) {
    Column {
        Text(
            text = "Budget Health",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Budget Health section"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
        if (budgets.isEmpty()) {
            Text(
                text = "No budgets configured",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                budgets.forEach { budget ->
                    DashboardBudgetCard(budget, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun DashboardBudgetCard(budget: BudgetStatusUi, modifier: Modifier = Modifier) {
    val healthColor = when (budget.health) {
        BudgetHealth.OVER -> MaterialTheme.colorScheme.error
        BudgetHealth.WARNING -> Color(0xFFFF9800)
        BudgetHealth.HEALTHY -> MaterialTheme.colorScheme.primary
    }
    val healthLabel = when (budget.health) {
        BudgetHealth.OVER -> "over budget"
        BudgetHealth.WARNING -> "warning"
        BudgetHealth.HEALTHY -> "healthy"
    }

    val animatedProgress by animateFloatAsState(
        targetValue = budget.utilizationPercent.coerceIn(0f, 1f),
        animationSpec = tween(800),
        label = "budget-progress",
    )

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("View Budget Details") { /* navigate */ },
                ContextMenuItem("Edit Budget") { /* open edit */ },
            )
        },
    ) {
        Card(
            modifier = modifier.semantics {
                contentDescription =
                    "${budget.name}: ${budget.spent} of ${budget.limit}, $healthLabel"
            },
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // Progress ring
                Box(
                    modifier = Modifier.size(72.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    val trackColor = MaterialTheme.colorScheme.surfaceVariant
                    Canvas(Modifier.size(72.dp)) {
                        val strokeWidth = 6.dp.toPx()
                        val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
                        val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)
                        drawArc(
                            trackColor, -90f, 360f, false,
                            topLeft, arcSize,
                            style = Stroke(strokeWidth, cap = StrokeCap.Round),
                        )
                        drawArc(
                            healthColor, -90f, animatedProgress * 360f, false,
                            topLeft, arcSize,
                            style = Stroke(strokeWidth, cap = StrokeCap.Round),
                        )
                    }
                    Text(
                        text = "${(budget.utilizationPercent * 100).toInt()}%",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = budget.name,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${budget.spent} / ${budget.limit}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
