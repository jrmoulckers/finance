package com.finance.desktop.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
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

private data class GoalItem(
    val id: String,
    val name: String,
    val icon: ImageVector,
    val currentAmount: String,
    val targetAmount: String,
    val progress: Float,
    val deadline: String,
    val monthlyContribution: String,
)

private val sampleGoals = listOf(
    GoalItem("1", "Emergency Fund", Icons.Filled.Shield, "\$8,500", "\$10,000", 0.85f, "Jun 2025", "\$375/mo"),
    GoalItem("2", "Vacation Fund", Icons.Filled.Flight, "\$1,200", "\$3,000", 0.40f, "Dec 2025", "\$200/mo"),
    GoalItem("3", "New Car", Icons.Filled.DirectionsCar, "\$5,000", "\$25,000", 0.20f, "Mar 2027", "\$500/mo"),
    GoalItem("4", "Home Down Payment", Icons.Filled.Home, "\$32,000", "\$80,000", 0.40f, "Jan 2028", "\$1,200/mo"),
    GoalItem("5", "New Phone", Icons.Filled.PhoneAndroid, "\$800", "\$1,200", 0.67f, "Aug 2025", "\$100/mo"),
    GoalItem("6", "Education Fund", Icons.Filled.School, "\$4,500", "\$15,000", 0.30f, "Sep 2026", "\$350/mo"),
)

// =============================================================================
// Goals Screen — Card Grid with Progress Bars
// =============================================================================

/**
 * Savings goals screen for the desktop Finance application.
 *
 * Displays a responsive grid of goal cards, each showing:
 * - Goal name and icon
 * - Animated horizontal progress bar
 * - Current / target amounts
 * - Deadline and monthly contribution info
 *
 * Right-click context menus provide Edit, Contribute, and Delete actions.
 * Narrator reads goal name, progress percentage, amounts, and deadline.
 */
@Composable
fun GoalsScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Goals screen" },
    ) {
        Text(
            text = "Savings Goals",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Savings Goals heading"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
        Text(
            text = "Track progress toward your financial goals",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        if (sampleGoals.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Filled.Star,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
                    Text(
                        text = "No savings goals yet",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics {
                            contentDescription = "No savings goals yet"
                        },
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
                    Text(
                        text = "Create a goal to start saving toward something",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 320.dp),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                items(sampleGoals, key = { it.id }) { goal ->
                    GoalCard(goal)
                }
            }
        }
    }
}

// =============================================================================
// Goal Card with Progress Bar
// =============================================================================

@Composable
private fun GoalCard(goal: GoalItem) {
    val progressColor = when {
        goal.progress >= 0.75f -> Color(0xFF2E7D32)
        goal.progress >= 0.40f -> MaterialTheme.colorScheme.primary
        else -> Color(0xFFFF9800)
    }
    val progressPercent = (goal.progress * 100).toInt()

    val animatedProgress by animateFloatAsState(
        targetValue = goal.progress.coerceIn(0f, 1f),
        animationSpec = tween(800),
        label = "goal-progress",
    )

    ContextMenuArea(
        items = {
            listOf(
                ContextMenuItem("Add Contribution") { /* contribute */ },
                ContextMenuItem("Edit Goal") { /* edit */ },
                ContextMenuItem("View History") { /* history */ },
                ContextMenuItem("Delete Goal") { /* delete */ },
            )
        },
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription =
                        "${goal.name}: $progressPercent% complete, ${goal.currentAmount} of ${goal.targetAmount}, deadline ${goal.deadline}"
                },
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
            ) {
                // Header row: icon + name + percentage
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = goal.icon,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp),
                        )
                        Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                        Text(
                            text = goal.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = "$progressPercent%",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = progressColor,
                    )
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Progress bar
                LinearProgressIndicator(
                    progress = { animatedProgress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = progressColor,
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    strokeCap = StrokeCap.Round,
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                // Amounts row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column {
                        Text(
                            text = "Saved",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = goal.currentAmount,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = "Target",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = goal.targetAmount,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                // Footer: deadline + monthly contribution
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = "Deadline: ${goal.deadline}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = goal.monthlyContribution,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}
