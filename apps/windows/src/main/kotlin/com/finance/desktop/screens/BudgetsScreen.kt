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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.finance.core.budget.BudgetHealth
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.BudgetItemUi
import com.finance.desktop.viewmodel.BudgetsViewModel

// =============================================================================
// Budgets Screen — Grid of Budget Cards (KMP shared logic)
// =============================================================================

/**
 * Budget overview screen for the desktop Finance application.
 *
 * Data flows from [BudgetsViewModel], which loads budgets from the KMP shared
 * repository and computes utilization via [com.finance.core.budget.BudgetCalculator].
 * No hardcoded sample data — all values come from the repository layer.
 *
 * Displays a responsive grid of budget cards, each showing:
 * - Category name and period
 * - Animated progress ring with utilization percentage
 * - Spent / limit amounts and remaining balance
 * - Color-coded health indicator (green/amber/red)
 *
 * Right-click context menus provide Edit and Delete actions.
 * Narrator reads category, amounts, and health status.
 */
@Composable
fun BudgetsScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<BudgetsViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading budgets"
                },
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Budgets screen" },
    ) {
        Text(
            text = "Budgets",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Budgets heading"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        Text(
            text = "Track your spending against budget limits",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        if (state.budgets.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Filled.PieChart,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    Text(
                        text = "No budgets yet",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics {
                            contentDescription = "No budgets yet"
                        },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                    Text(
                        text = "Create your first budget to start tracking",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 240.dp),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                items(state.budgets, key = { it.id }) { budget ->
                    BudgetCard(budget)
                }
            }
        }
    }
}

// =============================================================================
// Budget Card with Progress Ring
// =============================================================================

@Composable
private fun BudgetCard(budget: BudgetItemUi) {
    val healthColor = when (budget.health) {
        BudgetHealth.OVER -> MaterialTheme.colorScheme.error
        BudgetHealth.WARNING -> Color(0xFFFF9800)
        BudgetHealth.HEALTHY -> MaterialTheme.colorScheme.primary
    }
    val healthLabel = when (budget.health) {
        BudgetHealth.OVER -> "over budget"
        BudgetHealth.WARNING -> "approaching limit"
        BudgetHealth.HEALTHY -> "on track"
    }

    val animatedProgress by animateFloatAsState(
        targetValue = budget.utilization.coerceIn(0f, 1f),
        animationSpec = tween(800),
        label = "budget-ring-progress",
    )

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("Edit Budget") { /* edit */ },
                ContextMenuItem("View Transactions") { /* view transactions for category */ },
                ContextMenuItem("Reset Budget") { /* reset */ },
                ContextMenuItem("Delete Budget") { /* delete */ },
            )
        },
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription =
                        "${budget.name}: ${budget.spent} of ${budget.limit}, ${budget.remaining}, $healthLabel"
                },
            colors = CardDefaults.cardColors(
                containerColor = if (budget.isOver) {
                    MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
                } else {
                    MaterialTheme.colorScheme.surface
                },
            ),
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                // Category name + period
                Text(
                    text = budget.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = budget.period,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Progress ring
                Box(
                    modifier = Modifier.size(96.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    val trackColor = MaterialTheme.colorScheme.surfaceVariant
                    Canvas(Modifier.size(96.dp)) {
                        val strokeWidth = 8.dp.toPx()
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
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "${(budget.utilization * 100).toInt()}%",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = healthColor,
                        )
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Amounts
                Text(
                    text = "${budget.spent} / ${budget.limit}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = budget.remaining,
                    style = MaterialTheme.typography.labelMedium,
                    color = healthColor,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}
