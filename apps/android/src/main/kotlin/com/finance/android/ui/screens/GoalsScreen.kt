@file:OptIn(ExperimentalMaterial3Api::class)

package com.finance.android.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.finance.android.ui.components.charts.ChartColors
import com.finance.android.ui.components.charts.TrendLine
import com.finance.android.ui.components.charts.TrendLineChart
import com.finance.android.ui.components.charts.TrendPoint
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.GoalUi
import com.finance.android.ui.viewmodel.GoalUiState
import com.finance.android.ui.viewmodel.GoalViewModel
import com.finance.models.GoalStatus

/**
 * Goal tracking screen (#45).
 *
 * Displays savings goals with linear progress bars,
 * projected completion dates, and days remaining.
 * Tap a goal for detail view with contribution history chart.
 */
@Composable
fun GoalsScreen(
    modifier: Modifier = Modifier,
    viewModel: GoalViewModel = viewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var showCreateSheet by rememberSaveable { mutableStateOf(false) }
    var selectedGoal by remember { mutableStateOf<GoalUi?>(null) }

    if (selectedGoal != null) {
        GoalDetailScreen(
            goal = selectedGoal!!,
            onNavigateBack = { selectedGoal = null },
        )
    } else {
        Scaffold(
            floatingActionButton = {
                FloatingActionButton(
                    onClick = { showCreateSheet = true },
                    modifier = Modifier.semantics { contentDescription = "Create new goal" },
                ) {
                    Icon(imageVector = Icons.Default.Add, contentDescription = null)
                }
            },
            modifier = modifier,
        ) { padding ->
            AnimatedVisibility(
                visible = !uiState.isLoading,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                if (uiState.goals.isEmpty()) {
                    GoalEmptyState(
                        modifier = Modifier.padding(padding),
                        onCreateClick = { showCreateSheet = true },
                    )
                } else {
                    GoalList(
                        uiState = uiState,
                        modifier = Modifier.padding(padding),
                        onGoalClick = { selectedGoal = it },
                    )
                }
            }
        }
    }

    if (showCreateSheet) {
        CreateEditGoalSheet(
            onDismiss = { showCreateSheet = false },
            onSave = { _, _, _ -> showCreateSheet = false },
        )
    }
}

// ── Goal List ──────────────────────────────────────────────────────────

@Composable
private fun GoalList(
    uiState: GoalUiState,
    modifier: Modifier = Modifier,
    onGoalClick: (GoalUi) -> Unit = {},
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(items = uiState.goals, key = { it.id }) { goal ->
            GoalCard(goal = goal, onClick = { onGoalClick(goal) })
        }
        item(key = "fab-spacer") { Spacer(modifier = Modifier.height(72.dp)) }
    }
}

// ── Goal Card ──────────────────────────────────────────────────────────

@Composable
private fun GoalCard(
    goal: GoalUi,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val animatedProgress by animateFloatAsState(
        targetValue = goal.progress,
        animationSpec = tween(durationMillis = 800, easing = FastOutSlowInEasing),
        label = "goal-progress",
    )

    val progressColor by animateColorAsState(
        targetValue = when {
            goal.status == GoalStatus.COMPLETED -> ChartColors.BudgetHealthy
            goal.progress >= 0.75f -> ChartColors.BudgetHealthy
            goal.progress >= 0.50f -> ChartColors.CategoryPalette[1]
            else -> MaterialTheme.colorScheme.primary
        },
        label = "goal-progress-color",
    )

    Card(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = goal.accessibilityLabel },
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
        ) {
            // Header: name + status + percentage
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = goal.name,
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.SemiBold,
                        ),
                    )
                    if (goal.status == GoalStatus.COMPLETED) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = ChartColors.BudgetHealthy,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Completed",
                                style = MaterialTheme.typography.labelSmall,
                                color = ChartColors.BudgetHealthy,
                            )
                        }
                    }
                }

                Text(
                    text = "${goal.progressPercent}%",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = progressColor,
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Progress bar
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .semantics {
                        contentDescription = "${goal.progressPercent}% progress towards ${goal.name}"
                    },
                color = progressColor,
                trackColor = ChartColors.BudgetTrack,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Amounts
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = goal.currentAmountFormatted,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    modifier = Modifier.semantics {
                        contentDescription = "Current amount: ${goal.currentAmountFormatted}"
                    },
                )
                Text(
                    text = goal.targetAmountFormatted,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics {
                        contentDescription = "Target amount: ${goal.targetAmountFormatted}"
                    },
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Projected completion + days remaining
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                if (goal.projectedCompletionDate.isNotEmpty()) {
                    Text(
                        text = "Projected: ${goal.projectedCompletionDate}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics {
                            contentDescription = "Projected completion: ${goal.projectedCompletionDate}"
                        },
                    )
                }
                if (goal.daysRemaining.isNotEmpty()) {
                    Text(
                        text = goal.daysRemaining,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics { contentDescription = goal.daysRemaining },
                    )
                }
            }
        }
    }
}

// ── Goal Detail Screen ─────────────────────────────────────────────────

@Composable
private fun GoalDetailScreen(
    goal: GoalUi,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val milestoneReached = when {
        goal.progress >= 1.0f -> "🎉 Goal achieved! Congratulations!"
        goal.progress >= 0.75f -> "🎉 75% milestone reached!"
        goal.progress >= 0.50f -> "🎉 Halfway there!"
        goal.progress >= 0.25f -> "🎉 25% milestone reached!"
        else -> null
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = goal.name,
                        modifier = Modifier.semantics {
                            contentDescription = "${goal.name} details"
                            heading()
                        },
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.semantics { contentDescription = "Go back to goals list" },
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Large progress visualization
            item(key = "progress-header") {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "${goal.progressPercent}%",
                        style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.semantics {
                            contentDescription = "${goal.progressPercent}% complete"
                        },
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    val animatedProgress by animateFloatAsState(
                        targetValue = goal.progress,
                        animationSpec = tween(durationMillis = 1000, easing = FastOutSlowInEasing),
                        label = "detail-progress",
                    )

                    LinearProgressIndicator(
                        progress = { animatedProgress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(12.dp)
                            .padding(horizontal = 32.dp)
                            .semantics { contentDescription = "${goal.progressPercent}% progress bar" },
                        color = if (goal.status == GoalStatus.COMPLETED)
                            ChartColors.BudgetHealthy else MaterialTheme.colorScheme.primary,
                        trackColor = ChartColors.BudgetTrack,
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "${goal.currentAmountFormatted} of ${goal.targetAmountFormatted}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.semantics {
                            contentDescription = "${goal.currentAmountFormatted} saved of ${goal.targetAmountFormatted} target"
                        },
                    )
                }
            }

            // Milestone celebration
            if (milestoneReached != null) {
                item(key = "milestone") {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                        ),
                    ) {
                        Text(
                            text = milestoneReached,
                            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp)
                                .semantics { contentDescription = milestoneReached },
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }

            // Details card
            item(key = "details") {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                    ) {
                        Text(
                            text = "Details",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                            modifier = Modifier.semantics {
                                contentDescription = "Goal details section"
                                heading()
                            },
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        DetailRow("Status", goal.status.name.lowercase().replaceFirstChar { it.uppercase() })

                        if (goal.projectedCompletionDate.isNotEmpty()) {
                            DetailRow("Projected Completion", goal.projectedCompletionDate)
                        }
                        if (goal.daysRemaining.isNotEmpty()) {
                            DetailRow("Time Remaining", goal.daysRemaining)
                        }
                    }
                }
            }

            // Contribution history chart
            if (goal.contributionHistory.isNotEmpty()) {
                item(key = "contribution-header") {
                    Text(
                        text = "Contribution History",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                        modifier = Modifier.semantics {
                            contentDescription = "Contribution history chart"
                            heading()
                        },
                    )
                }

                item(key = "contribution-chart") {
                    TrendLineChart(
                        lines = listOf(
                            TrendLine(
                                points = goal.contributionHistory.map { (label, value) ->
                                    TrendPoint(label, value, "$${value.toInt()}")
                                },
                                color = ChartColors.CategoryPalette[0],
                                label = "Monthly Contributions",
                            ),
                        ),
                        modifier = Modifier.height(180.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.semantics { contentDescription = label },
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
            modifier = Modifier.semantics { contentDescription = "$label: $value" },
        )
    }
}

// ── Create/Edit Bottom Sheet ───────────────────────────────────────────

@Composable
private fun CreateEditGoalSheet(
    onDismiss: () -> Unit,
    onSave: (name: String, targetAmount: String, targetDate: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var nameText by remember { mutableStateOf("") }
    var targetAmountText by remember { mutableStateOf("") }
    var targetDateText by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
        ) {
            Text(
                text = "Create Goal",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.semantics {
                    contentDescription = "Create goal form"
                    heading()
                },
            )

            Spacer(modifier = Modifier.height(24.dp))

            OutlinedTextField(
                value = nameText,
                onValueChange = { nameText = it },
                label = { Text("Goal Name") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Goal name input field" },
            )

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = targetAmountText,
                onValueChange = { targetAmountText = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("Target Amount ($)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Target amount input field" },
            )

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedTextField(
                value = targetDateText,
                onValueChange = { targetDateText = it },
                label = { Text("Target Date (YYYY-MM-DD)") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Target date input field" },
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (nameText.isNotBlank() && targetAmountText.isNotBlank()) {
                        onSave(nameText, targetAmountText, targetDateText)
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Save goal button" },
                enabled = nameText.isNotBlank() && targetAmountText.isNotBlank(),
            ) {
                Text(text = "Save Goal")
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

// ── Empty State ────────────────────────────────────────────────────────

@Composable
private fun GoalEmptyState(
    modifier: Modifier = Modifier,
    onCreateClick: () -> Unit = {},
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp),
        ) {
            Text(
                text = "No goals yet",
                style = MaterialTheme.typography.headlineSmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    contentDescription = "No goals yet — set your first savings goal"
                    heading()
                },
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Set your first savings goal to start tracking progress",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = "Set your first savings goal to start tracking progress"
                },
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = onCreateClick,
                modifier = Modifier.semantics {
                    contentDescription = "Set your first savings goal"
                },
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "Create Goal")
            }
        }
    }
}

// ── Previews ───────────────────────────────────────────────────────────

@Preview(showBackground = true, name = "Goal Empty State")
@Composable
private fun GoalEmptyStatePreview() {
    FinanceTheme(dynamicColor = false) {
        GoalEmptyState()
    }
}

@Preview(showBackground = true, name = "Goals")
@Composable
private fun GoalsScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalsScreen()
    }
}
