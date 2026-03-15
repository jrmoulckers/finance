// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.BudgetItemUi
import com.finance.android.ui.viewmodel.BudgetsUiState
import com.finance.android.ui.viewmodel.BudgetsViewModel
import com.finance.core.budget.BudgetHealth
import com.finance.models.BudgetPeriod
import com.finance.models.types.SyncId
import org.koin.compose.viewmodel.koinViewModel

/**
 * Budgets screen (#430) — displays budget categories with progress indicators.
 *
 * Shows a summary card with total budgeted vs. spent and overall health,
 * followed by individual budget cards with utilization progress bars.
 * Supports pull-to-refresh. TalkBack accessible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudgetsScreen(
    modifier: Modifier = Modifier,
    viewModel: BudgetsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    when {
        state.isLoading -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .semantics { contentDescription = "Loading budgets" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics {
                        contentDescription = "Loading indicator"
                    },
                )
            }
        }

        state.errorMessage != null -> {
            BudgetsErrorState(
                message = state.errorMessage!!,
                onRetry = viewModel::refresh,
                modifier = modifier,
            )
        }

        else -> {
            BudgetsContent(
                state = state,
                onRefresh = viewModel::refresh,
                modifier = modifier,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BudgetsContent(
    state: BudgetsUiState,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = onRefresh,
        modifier = modifier.fillMaxSize(),
    ) {
        if (state.budgets.isEmpty()) {
            BudgetsEmptyState()
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item(key = "summary") {
                    BudgetSummaryCard(
                        totalBudgeted = state.totalBudgeted,
                        totalSpent = state.totalSpent,
                        overallHealth = state.overallHealth,
                    )
                }
                item(key = "list-header") {
                    Text(
                        text = "Your Budgets",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics {
                            heading()
                            contentDescription = "Your Budgets section"
                        },
                    )
                }
                items(state.budgets, key = { it.id.value }) { budget ->
                    BudgetItemCard(budget)
                }
                item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
            }
        }
    }
}

@Composable
private fun BudgetSummaryCard(
    totalBudgeted: String,
    totalSpent: String,
    overallHealth: BudgetHealth,
) {
    val healthLabel = when (overallHealth) {
        BudgetHealth.HEALTHY -> "On track"
        BudgetHealth.WARNING -> "Approaching limits"
        BudgetHealth.OVER -> "Over budget"
    }
    val healthColor = when (overallHealth) {
        BudgetHealth.HEALTHY -> Color(0xFF2E7D32)
        BudgetHealth.WARNING -> Color(0xFFFF9800)
        BudgetHealth.OVER -> MaterialTheme.colorScheme.error
    }

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription =
                    "Budget summary: $totalSpent spent of $totalBudgeted budgeted, $healthLabel"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Budget Overview",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.semantics {
                    contentDescription = "Budget Overview label"
                },
            )
            Spacer(Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Spent",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                    )
                    Text(
                        text = totalSpent,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Budgeted",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
                    )
                    Text(
                        text = totalBudgeted,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(
                text = healthLabel,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = healthColor,
                modifier = Modifier.semantics {
                    contentDescription = "Overall status: $healthLabel"
                },
            )
        }
    }
}

@Composable
private fun BudgetItemCard(budget: BudgetItemUi) {
    val healthColor = when (budget.health) {
        BudgetHealth.HEALTHY -> MaterialTheme.colorScheme.primary
        BudgetHealth.WARNING -> Color(0xFFFF9800)
        BudgetHealth.OVER -> MaterialTheme.colorScheme.error
    }
    val healthLabel = when (budget.health) {
        BudgetHealth.HEALTHY -> "healthy"
        BudgetHealth.WARNING -> "warning"
        BudgetHealth.OVER -> "over budget"
    }
    val periodLabel = when (budget.period) {
        BudgetPeriod.WEEKLY -> "Weekly"
        BudgetPeriod.BIWEEKLY -> "Biweekly"
        BudgetPeriod.MONTHLY -> "Monthly"
        BudgetPeriod.QUARTERLY -> "Quarterly"
        BudgetPeriod.YEARLY -> "Yearly"
    }

    val animatedProgress by animateFloatAsState(
        targetValue = budget.utilizationPercent.coerceIn(0f, 1f),
        animationSpec = tween(800),
        label = "budget-progress",
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription =
                    "${budget.name}: ${budget.spent} of ${budget.limit}, " +
                        "${budget.remaining} remaining, $healthLabel"
            },
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = budget.name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "${budget.categoryName} • $periodLabel",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${budget.spent} / ${budget.limit}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = budget.remaining,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = healthColor,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .semantics {
                        contentDescription =
                            "${(budget.utilizationPercent * 100).toInt()} percent used"
                    },
                color = healthColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                strokeCap = StrokeCap.Round,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "${(budget.utilizationPercent * 100).toInt()}% used",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun BudgetsEmptyState(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .semantics {
                contentDescription = "No budgets yet. Create your first budget to start tracking."
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Filled.AccountBalanceWallet,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "No budgets yet",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics {
                    contentDescription = "No budgets yet"
                },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Create your first budget to start tracking spending",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription =
                        "Create your first budget to start tracking spending"
                },
            )
        }
    }
}

@Composable
private fun BudgetsErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .semantics {
                contentDescription = "Error loading budgets: $message"
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Filled.ErrorOutline,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.error,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "Something went wrong",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics {
                    contentDescription = "Something went wrong"
                },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = message
                },
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = onRetry,
                modifier = Modifier.semantics {
                    contentDescription = "Retry loading budgets"
                },
            ) {
                Text("Retry")
            }
        }
    }
}

@Preview(showBackground = true, showSystemUi = true, name = "Budgets")
@Composable
private fun BudgetsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetsContent(
            state = BudgetsUiState(
                isLoading = false,
                totalBudgeted = "$1,580.00",
                totalSpent = "$687.42",
                overallHealth = BudgetHealth.WARNING,
                budgets = listOf(
                    BudgetItemUi(
                        SyncId("bud-1"), "Groceries", "Groceries",
                        "shopping_cart", "$248.00", "$600.00",
                        "+$352.00", 0.41f, BudgetHealth.HEALTHY,
                        BudgetPeriod.MONTHLY,
                    ),
                    BudgetItemUi(
                        SyncId("bud-2"), "Dining Out", "Dining Out",
                        "restaurant", "$245.00", "$300.00",
                        "+$55.00", 0.82f, BudgetHealth.WARNING,
                        BudgetPeriod.MONTHLY,
                    ),
                    BudgetItemUi(
                        SyncId("bud-3"), "Transportation", "Transportation",
                        "directions_car", "$89.00", "$200.00",
                        "+$111.00", 0.45f, BudgetHealth.HEALTHY,
                        BudgetPeriod.MONTHLY,
                    ),
                ),
            ),
            onRefresh = {},
        )
    }
}

@Preview(showBackground = true, name = "Budgets - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Budgets - Dark")
@Preview(showBackground = true, name = "Budgets Empty")
@Composable
private fun BudgetsEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetsEmptyState()
    }
}

@Preview(showBackground = true, name = "Budgets Error")
@Composable
private fun BudgetsErrorPreview() {
    FinanceTheme(dynamicColor = false) {
        BudgetsErrorState(
            message = "Network connection unavailable",
            onRetry = {},
        )
    }
}
