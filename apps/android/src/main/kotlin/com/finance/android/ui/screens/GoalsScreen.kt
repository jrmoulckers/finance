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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.GoalItemUi
import com.finance.android.ui.viewmodel.GoalsUiState
import com.finance.android.ui.viewmodel.GoalsViewModel
import com.finance.models.types.SyncId
import org.koin.compose.viewmodel.koinViewModel

/**
 * Goals screen — displays savings goals with progress tracking.
 *
 * Shows a summary header with active/completed counts, followed by
 * individual goal cards with progress bars and formatted amounts.
 * Supports pull-to-refresh. Handles loading, error, and empty states.
 * Fully accessible via TalkBack with content descriptions on all elements.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsScreen(
    modifier: Modifier = Modifier,
    viewModel: GoalsViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .semantics { contentDescription = "Loading goals" },
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics { contentDescription = "Loading indicator" },
            )
        }
        return
    }

    GoalsContent(
        state = state,
        onRefresh = viewModel::refresh,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GoalsContent(
    state: GoalsUiState,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    PullToRefreshBox(
        isRefreshing = state.isRefreshing,
        onRefresh = onRefresh,
        modifier = modifier.fillMaxSize(),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ── Error banner ────────────────────────────────────────
            if (state.errorMessage != null) {
                item(key = "error") {
                    GoalsErrorBanner(
                        message = state.errorMessage,
                        onRetry = onRefresh,
                    )
                }
            }

            // ── Header ─────────────────────────────────────────────
            item(key = "header") {
                GoalsSummaryHeader(
                    activeCount = state.activeCount,
                    completedCount = state.completedCount,
                )
            }

            // ── Empty state ─────────────────────────────────────────
            if (state.goals.isEmpty() && state.errorMessage == null) {
                item(key = "empty") {
                    GoalsEmptyState()
                }
            }

            // ── Goal cards ──────────────────────────────────────────
            if (state.goals.isNotEmpty()) {
                items(state.goals, key = { it.id.value }) { goal ->
                    GoalCard(goal = goal)
                }
            }

            item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
        }
    }
}

@Composable
private fun GoalsSummaryHeader(
    activeCount: Int,
    completedCount: Int,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                heading()
                contentDescription = "Goals: $activeCount active, $completedCount completed"
            },
    ) {
        Text(
            text = "Goals",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "$activeCount active · $completedCount completed",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics {
                contentDescription = "$activeCount active goals, $completedCount completed goals"
            },
        )
    }
}

@Composable
private fun GoalsEmptyState(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 48.dp)
            .semantics { contentDescription = "No goals yet. Create your first savings goal to get started." },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.Filled.Flag,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "No goals yet",
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Create your first savings goal to get started",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun GoalsErrorBanner(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Error: $message" },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = onRetry,
                modifier = Modifier.semantics { contentDescription = "Retry loading goals" },
            ) {
                Text(
                    text = "Retry",
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
            }
        }
    }
}

@Composable
private fun GoalCard(
    goal: GoalItemUi,
    modifier: Modifier = Modifier,
) {
    val animatedProgress by animateFloatAsState(
        targetValue = goal.progressPercent,
        animationSpec = tween(durationMillis = 800),
        label = "goal-progress",
    )
    val progressPercent = (goal.progressPercent * 100).toInt()
    val progressColor = if (goal.isCompleted) {
        MaterialTheme.colorScheme.tertiary
    } else {
        MaterialTheme.colorScheme.primary
    }

    ElevatedCard(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${goal.name}: ${goal.currentFormatted} of ${goal.targetFormatted}, " +
                    "$progressPercent percent" +
                    if (goal.isCompleted) ", completed" else ""
            },
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
        ) {
            // ── Top row: icon + name + completion badge ─────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (goal.icon != null) {
                    Text(
                        text = goal.icon,
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.semantics {
                            contentDescription = "Goal icon"
                        },
                    )
                    Spacer(Modifier.width(12.dp))
                }
                Text(
                    text = goal.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (goal.isCompleted) {
                    Spacer(Modifier.width(8.dp))
                    Icon(
                        imageVector = Icons.Filled.CheckCircle,
                        contentDescription = "Goal completed",
                        tint = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // ── Progress bar ────────────────────────────────────────
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .semantics {
                        contentDescription = "Progress: $progressPercent percent"
                    },
                color = progressColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                strokeCap = StrokeCap.Round,
            )

            Spacer(Modifier.height(12.dp))

            // ── Amount details ──────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(
                        text = "Current",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = goal.currentFormatted,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Remaining",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = goal.remainingFormatted,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "Target",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = goal.targetFormatted,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            // ── Target date (if present) ────────────────────────────
            if (goal.targetDate != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Target: ${goal.targetDate}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "Target date: ${goal.targetDate}"
                    },
                )
            }
        }
    }
}

@Preview(showBackground = true, name = "Goals - Light")
@Preview(showBackground = true, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES, name = "Goals - Dark")
@Preview(showBackground = true, showSystemUi = true, name = "Goals – with data")
@Composable
private fun GoalsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalsContent(
            state = GoalsUiState(
                isLoading = false,
                activeCount = 2,
                completedCount = 1,
                goals = listOf(
                    GoalItemUi(
                        id = SyncId("1"),
                        name = "Emergency Fund",
                        targetFormatted = "$10,000.00",
                        currentFormatted = "$3,500.00",
                        remainingFormatted = "$6,500.00",
                        progressPercent = 0.35f,
                        targetDate = "Dec 31, 2025",
                        isCompleted = false,
                        icon = "🛡️",
                    ),
                    GoalItemUi(
                        id = SyncId("2"),
                        name = "Vacation",
                        targetFormatted = "$5,000.00",
                        currentFormatted = "$5,000.00",
                        remainingFormatted = "$0.00",
                        progressPercent = 1.0f,
                        targetDate = "Jun 15, 2025",
                        isCompleted = true,
                        icon = "✈️",
                    ),
                    GoalItemUi(
                        id = SyncId("3"),
                        name = "New Laptop",
                        targetFormatted = "$2,000.00",
                        currentFormatted = "$800.00",
                        remainingFormatted = "$1,200.00",
                        progressPercent = 0.4f,
                        targetDate = null,
                        isCompleted = false,
                        icon = null,
                    ),
                ),
            ),
            onRefresh = {},
        )
    }
}

@Preview(showBackground = true, name = "Goals – empty")
@Composable
private fun GoalsEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalsContent(
            state = GoalsUiState(
                isLoading = false,
                activeCount = 0,
                completedCount = 0,
                goals = emptyList(),
            ),
            onRefresh = {},
        )
    }
}

@Preview(showBackground = true, name = "Goals – error")
@Composable
private fun GoalsErrorPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalsContent(
            state = GoalsUiState(
                isLoading = false,
                errorMessage = "Unable to load goals. Pull down to retry.",
            ),
            onRefresh = {},
        )
    }
}
