// SPDX-License-Identifier: BUSL-1.1

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.unit.dp
import com.finance.desktop.components.ListEmptyState
import com.finance.desktop.components.ListErrorState
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.GoalItemUi
import com.finance.desktop.viewmodel.GoalsViewModel

// =============================================================================
// Goals Screen — Card Grid with Progress Bars (KMP shared logic)
// =============================================================================

/**
 * Savings goals screen for the desktop Finance application.
 *
 * Data flows from [GoalsViewModel], which loads goals from the KMP shared
 * [com.finance.desktop.data.repository.GoalRepository]. Progress is computed
 * by the KMP [com.finance.models.Goal.progress] property — no duplicate logic.
 *
 * Displays a responsive grid of goal cards, each showing:
 * - Goal name and icon
 * - Animated horizontal progress bar
 * - Current / target amounts
 * - Deadline info (if set)
 * - Edit (pencil) and Delete (trash) icon buttons
 *
 * Right-click context menus provide Edit, Contribute, and Delete actions.
 * Narrator reads goal name, progress percentage, amounts, and deadline.
 */
@Composable
fun GoalsScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<GoalsViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading goals"
                },
            )
        }
        return
    }

    if (state.errorMessage != null) {
        ListErrorState(
            message = state.errorMessage!!,
            onRetry = { viewModel.retry() },
            title = "Couldn't load goals",
            modifier = modifier,
        )
        return
    }

    // ── Edit / Create Dialog ──
    if (state.editingGoalId != null || state.isCreating) {
        GoalEditDialog(
            title = if (state.isCreating) "New Goal" else "Edit Goal",
            confirmLabel = if (state.isCreating) "Create" else "Save",
            name = state.editName,
            targetAmount = state.editTargetAmount,
            currentAmount = state.editCurrentAmount,
            onNameChange = { viewModel.updateEditName(it) },
            onTargetAmountChange = { viewModel.updateEditTargetAmount(it) },
            onCurrentAmountChange = { viewModel.updateEditCurrentAmount(it) },
            onSave = { viewModel.saveEdit() },
            onDismiss = { viewModel.cancelEdit() },
        )
    }

    // ── Delete Confirmation Dialog ──
    if (state.deletingGoalId != null) {
        val goalName = state.goals.find { it.id == state.deletingGoalId }?.name ?: "this goal"
        AlertDialog(
            onDismissRequest = { viewModel.cancelDelete() },
            title = { Text("Delete Goal") },
            text = {
                Text(
                    "Are you sure you want to delete \"$goalName\"? This action cannot be undone.",
                    modifier = Modifier.semantics {
                        contentDescription = "Confirm deletion of goal $goalName"
                    },
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.executeDelete() }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelDelete() }) {
                    Text("Cancel")
                }
            },
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Goals screen" },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f)) {
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
            }
            Button(
                onClick = { viewModel.startCreate() },
                modifier = Modifier.semantics { contentDescription = "New goal" },
            ) {
                Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(
                    text = "New Goal",
                    modifier = Modifier.padding(start = FinanceDesktopTheme.spacing.sm),
                )
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        if (state.goals.isEmpty()) {
            ListEmptyState(
                icon = Icons.Filled.Star,
                title = "No savings goals yet",
                message = "Create a goal to start saving toward something",
                ctaLabel = "Create goal",
                onCta = { viewModel.startCreate() },
            )
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 320.dp),
                horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                items(state.goals, key = { it.id }) { goal ->
                    GoalCard(
                        goal = goal,
                        onEdit = { viewModel.startEdit(goal.id) },
                        onDelete = { viewModel.confirmDelete(goal.id) },
                    )
                }
            }
        }
    }
}

// =============================================================================
// Goal Edit Dialog
// =============================================================================

/**
 * Dialog for editing a goal's name, target amount, and current amount.
 */
@Composable
private fun GoalEditDialog(
    name: String,
    targetAmount: String,
    currentAmount: String,
    onNameChange: (String) -> Unit,
    onTargetAmountChange: (String) -> Unit,
    onCurrentAmountChange: (String) -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
    title: String = "Edit Goal",
    confirmLabel: String = "Save",
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.semantics {
                    contentDescription = "Edit goal form"
                },
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = onNameChange,
                    label = { Text("Goal Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = targetAmount,
                    onValueChange = onTargetAmountChange,
                    label = { Text("Target Amount ($)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = currentAmount,
                    onValueChange = onCurrentAmountChange,
                    label = { Text("Current Amount ($)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onSave) { Text(confirmLabel) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

// =============================================================================
// Goal Card with Progress Bar
// =============================================================================

@Composable
@Suppress("LongMethod") // Goal detail composable
private fun GoalCard(
    goal: GoalItemUi,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val progressColor = when {
        goal.progress >= 0.75f -> FinanceDesktopTheme.status.positive
        goal.progress >= 0.40f -> MaterialTheme.colorScheme.primary
        else -> FinanceDesktopTheme.status.warning
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
                ContextMenuItem("Edit Goal") { onEdit() },
                ContextMenuItem("View History") { /* history */ },
                ContextMenuItem("Delete Goal") { onDelete() },
            )
        },
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = buildString {
                        append("${goal.name}: $progressPercent% complete, ")
                        append("${goal.currentAmount} of ${goal.targetAmount}")
                        goal.deadline?.let { append(", deadline $it") }
                    }
                },
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        ) {
            Column(
                modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
            ) {
                // Header row: icon + name + percentage + action buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.TrendingUp,
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
                    Spacer(Modifier.width(8.dp))
                    IconButton(
                        onClick = onEdit,
                        modifier = Modifier.semantics {
                            contentDescription = "Edit goal ${goal.name}"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Edit,
                            contentDescription = "Edit",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    IconButton(
                        onClick = onDelete,
                        modifier = Modifier.semantics {
                            contentDescription = "Delete goal ${goal.name}"
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Delete,
                            contentDescription = "Delete",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(18.dp),
                        )
                    }
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

                // Footer: deadline (if set)
                if (goal.deadline != null) {
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))
                    Text(
                        text = "Deadline: ${goal.deadline}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
