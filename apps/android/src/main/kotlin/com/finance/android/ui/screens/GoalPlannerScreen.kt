// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.domain.goals.GoalPace
import com.finance.android.domain.goals.GoalPlanUi
import com.finance.android.ui.theme.FinanceTheme
import com.finance.android.ui.viewmodel.GoalPlannerUiState
import com.finance.android.ui.viewmodel.GoalPlannerViewModel
import com.finance.models.types.SyncId
import org.koin.compose.viewmodel.koinViewModel

/**
 * Goal Planner screen — the teen-friendly "save $X/week, buy by [date]" view (#2207).
 *
 * Highlights the saver's most relevant goal with a plain-language headline,
 * weekly / paycheck / monthly save targets, a projected buy-by date, milestone
 * checkpoints, and a catch-up message when behind pace. Pace is conveyed with
 * both an icon and text — never colour alone — and every element exposes a
 * TalkBack content description.
 */
@Composable
fun GoalPlannerScreen(
    modifier: Modifier = Modifier,
    viewModel: GoalPlannerViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    GoalPlannerContent(state = state, modifier = modifier)
}

@Composable
internal fun GoalPlannerContent(
    state: GoalPlannerUiState,
    modifier: Modifier = Modifier,
) {
    when {
        state.isLoading -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .semantics { contentDescription = "Building your savings plan" },
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.semantics { contentDescription = "Loading indicator" },
                )
            }
        }

        state.errorMessage != null -> {
            GoalPlannerMessage(
                title = "Something went wrong",
                body = state.errorMessage,
                icon = Icons.Filled.Warning,
                modifier = modifier,
            )
        }

        state.plan == null || !state.hasGoal -> {
            GoalPlannerMessage(
                title = "No goal to plan yet",
                body = "Create a savings goal with a target amount and date, and we'll " +
                    "show you how much to save each week.",
                icon = Icons.Filled.Flag,
                modifier = modifier,
            )
        }

        else -> GoalPlanDetail(plan = state.plan, modifier = modifier)
    }
}

@Composable
@Suppress("LongMethod") // Compose UI function with cohesive layout logic
private fun GoalPlanDetail(
    plan: GoalPlanUi,
    modifier: Modifier = Modifier,
) {
    val animatedProgress by animateFloatAsState(
        targetValue = plan.progressPercent,
        animationSpec = tween(durationMillis = 800),
        label = "plan-progress",
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // ── Title ───────────────────────────────────────────────────────
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (plan.icon != null) {
                Text(
                    text = plan.icon,
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.semantics { contentDescription = "Goal icon" },
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(
                text = plan.goalName,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() },
            )
        }

        // ── Hero headline ───────────────────────────────────────────────
        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
                    .semantics { contentDescription = plan.headline },
            ) {
                Text(
                    text = plan.headline,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
        }

        // ── Save targets ────────────────────────────────────────────────
        if (plan.hasPlan) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SaveTargetCell(
                    label = "Per week",
                    value = plan.perWeekFormatted,
                    modifier = Modifier.weight(1f),
                )
                SaveTargetCell(
                    label = "Per paycheck",
                    value = plan.perPaycheckFormatted,
                    modifier = Modifier.weight(1f),
                )
                SaveTargetCell(
                    label = "Per month",
                    value = plan.perMonthFormatted,
                    modifier = Modifier.weight(1f),
                )
            }
        }

        // ── Progress + milestone ────────────────────────────────────────
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "${plan.progressPercentInt} percent saved. " +
                        "${plan.currentFormatted} of ${plan.targetFormatted}. " +
                        plan.milestoneLabel
                },
        ) {
            Text(
                text = plan.milestoneLabel,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clearAndSetSemantics { },
            )
            Spacer(Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(10.dp)
                    .clearAndSetSemantics { },
                strokeCap = StrokeCap.Round,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "${plan.currentFormatted} saved",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.clearAndSetSemantics { },
                )
                Text(
                    text = "${plan.remainingFormatted} to go",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
        }

        // ── Milestone checkpoints ───────────────────────────────────────
        MilestoneRow(reachedPercent = plan.milestonePercent)

        // ── Pace / catch-up message ─────────────────────────────────────
        PaceBanner(plan = plan)

        // ── Buy-by date ─────────────────────────────────────────────────
        if (plan.buyByLabel != null && !plan.isComplete) {
            Text(
                text = "🎯 Target: ${plan.buyByLabel}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics {
                    contentDescription = "Target date ${plan.buyByLabel}"
                },
            )
        }
    }
}

@Composable
private fun SaveTargetCell(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.semantics {
            contentDescription = "$label, $value"
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clearAndSetSemantics { },
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

@Composable
private fun MilestoneRow(
    reachedPercent: Int,
    modifier: Modifier = Modifier,
) {
    val checkpoints = listOf(25, 50, 75, 100)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Milestones: reached $reachedPercent percent of the " +
                    "25, 50, 75, 100 percent checkpoints"
            },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        checkpoints.forEach { checkpoint ->
            val reached = reachedPercent >= checkpoint
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .clearAndSetSemantics { },
                shape = CircleShape,
                color = if (reached) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
            ) {
                Row(
                    modifier = Modifier.padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (reached) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(14.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        text = "$checkpoint%",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (reached) FontWeight.Bold else FontWeight.Normal,
                        color = if (reached) {
                            MaterialTheme.colorScheme.onPrimaryContainer
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun PaceBanner(
    plan: GoalPlanUi,
    modifier: Modifier = Modifier,
) {
    val container: androidx.compose.ui.graphics.Color
    val content: androidx.compose.ui.graphics.Color
    val icon: ImageVector
    when (plan.pace) {
        GoalPace.COMPLETE, GoalPace.AHEAD -> {
            container = MaterialTheme.colorScheme.tertiaryContainer
            content = MaterialTheme.colorScheme.onTertiaryContainer
            icon = Icons.Filled.CheckCircle
        }
        GoalPace.ON_TRACK, GoalPace.NO_DEADLINE -> {
            container = MaterialTheme.colorScheme.secondaryContainer
            content = MaterialTheme.colorScheme.onSecondaryContainer
            icon = Icons.Filled.Info
        }
        GoalPace.BEHIND, GoalPace.OVERDUE -> {
            container = MaterialTheme.colorScheme.errorContainer
            content = MaterialTheme.colorScheme.onErrorContainer
            icon = Icons.Filled.Warning
        }
    }
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = plan.paceMessage },
        colors = CardDefaults.cardColors(containerColor = container),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = content,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = plan.paceMessage,
                style = MaterialTheme.typography.bodyMedium,
                color = content,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

@Composable
private fun GoalPlannerMessage(
    title: String,
    body: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp)
            .semantics { contentDescription = "$title. $body" },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(56.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clearAndSetSemantics { },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Previews
// ═══════════════════════════════════════════════════════════════════════

private fun previewPlan(
    pace: GoalPace = GoalPace.ON_TRACK,
    milestonePercent: Int = 50,
    catchUp: String? = null,
) = GoalPlanUi(
    goalId = SyncId("preview"),
    goalName = "Car",
    icon = "🚗",
    progressPercent = milestonePercent / 100f,
    progressPercentInt = milestonePercent,
    currentFormatted = "$2,500.00",
    targetFormatted = "$5,000.00",
    remainingFormatted = "$2,500.00",
    perWeekFormatted = "$25.00",
    perPaycheckFormatted = "$50.00",
    perMonthFormatted = "$108.00",
    buyByLabel = "Aug 2027",
    headline = "Save $25.00/week to get your Car by Aug 2027",
    paceMessage = "Right on track for Aug 2027. Keep it up!",
    milestoneLabel = "Halfway there! 🚗",
    milestonePercent = milestonePercent,
    pace = pace,
    isBehind = pace == GoalPace.BEHIND || pace == GoalPace.OVERDUE,
    isComplete = pace == GoalPace.COMPLETE,
    catchUpPerWeekFormatted = catchUp,
    hasPlan = true,
)

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Planner – on track")
@Preview(
    showBackground = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Planner – dark",
)
@Composable
private fun GoalPlannerOnTrackPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalPlannerContent(state = GoalPlannerUiState(isLoading = false, hasGoal = true, plan = previewPlan()))
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Planner – behind")
@Composable
private fun GoalPlannerBehindPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalPlannerContent(
            state = GoalPlannerUiState(
                isLoading = false,
                hasGoal = true,
                plan = previewPlan(
                    pace = GoalPace.BEHIND,
                    milestonePercent = 25,
                    catchUp = "$40.00",
                ).copy(
                    paceMessage = "A little behind — bump it to $40.00/week to stay on time.",
                    milestoneLabel = "25% there — nice start!",
                ),
            ),
        )
    }
}

@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
@Preview(showBackground = true, name = "Planner – empty")
@Composable
private fun GoalPlannerEmptyPreview() {
    FinanceTheme(dynamicColor = false) {
        GoalPlannerContent(state = GoalPlannerUiState(isLoading = false, hasGoal = false, plan = null))
    }
}
