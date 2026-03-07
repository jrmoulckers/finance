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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.finance.desktop.theme.FinanceDesktopTheme

// =============================================================================
// Sample data
// =============================================================================

private data class BudgetItem(
    val id: String,
    val name: String,
    val spent: String,
    val limit: String,
    val remaining: String,
    val utilization: Float,
    val isOver: Boolean,
    val period: String,
)

private val sampleBudgetItems = listOf(
    BudgetItem("1", "Groceries", "\$248", "\$600", "\$352 left", 0.41f, false, "Monthly"),
    BudgetItem("2", "Dining Out", "\$245", "\$300", "\$55 left", 0.82f, false, "Monthly"),
    BudgetItem("3", "Transport", "\$89", "\$200", "\$111 left", 0.45f, false, "Monthly"),
    BudgetItem("4", "Entertainment", "\$180", "\$150", "\$30 over", 1.2f, true, "Monthly"),
    BudgetItem("5", "Shopping", "\$320", "\$400", "\$80 left", 0.80f, false, "Monthly"),
    BudgetItem("6", "Utilities", "\$125", "\$200", "\$75 left", 0.625f, false, "Monthly"),
    BudgetItem("7", "Healthcare", "\$45", "\$150", "\$105 left", 0.30f, false, "Monthly"),
    BudgetItem("8", "Subscriptions", "\$78", "\$100", "\$22 left", 0.78f, false, "Monthly"),
)

// =============================================================================
// Budgets Screen — Grid of Budget Cards
// =============================================================================

/**
 * Budget overview screen for the desktop Finance application.
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

        if (sampleBudgetItems.isEmpty()) {
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
                items(sampleBudgetItems, key = { it.id }) { budget ->
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
private fun BudgetCard(budget: BudgetItem) {
    val healthColor = when {
        budget.isOver -> MaterialTheme.colorScheme.error
        budget.utilization > 0.75f -> Color(0xFFFF9800)
        else -> MaterialTheme.colorScheme.primary
    }
    val healthLabel = when {
        budget.isOver -> "over budget"
        budget.utilization > 0.75f -> "approaching limit"
        else -> "on track"
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
