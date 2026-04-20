// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateIntAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.finance.desktop.di.koinGet
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.HealthDimension
import com.finance.desktop.viewmodel.HealthScoreUiState
import com.finance.desktop.viewmodel.HealthScoreViewModel
import com.finance.desktop.viewmodel.HistoryPoint

// =============================================================================
// Health Score Screen — Financial health dashboard with benchmarking
// =============================================================================

/**
 * Financial Health Score screen for the desktop Finance application.
 *
 * Displays a composite health score computed from multiple dimensions
 * (savings rate, budget adherence, emergency fund, debt management,
 * goal progress) with benchmark comparisons and actionable tips.
 *
 * Layout (Fluent Design, desktop-optimized):
 * ```
 * ┌─────────────────────────┬──────────────────┐
 * │  Overall Score Ring     │  Score History    │
 * │  Grade + Percentile     │  (bar chart)      │
 * ├─────────────────────────┴──────────────────┤
 * │  Dimension Cards (scrollable grid)          │
 * │  Each with score, grade, benchmark, tip     │
 * └─────────────────────────────────────────────┘
 * ```
 *
 * Narrator reads overall score, grade, percentile, and each dimension
 * with its score and improvement tip.
 */
@Composable
fun HealthScoreScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<HealthScoreViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading health score"
                },
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Financial Health Score screen" },
    ) {
        // ── Header ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text(
                    text = "Financial Health Score",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Financial Health Score heading"
                    },
                )
                Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = "A comprehensive assessment of your financial wellness",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = { viewModel.refresh() },
                modifier = Modifier.semantics {
                    contentDescription = "Refresh health score"
                },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text("Recalculate")
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        // ── Error banner ──
        state.errorMessage?.let { error ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.errorContainer,
            ) {
                Text(
                    text = error,
                    modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))
        }

        // ── Top section: Score ring + History ──
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(240.dp),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
        ) {
            OverallScoreCard(state, modifier = Modifier.weight(1f))
            ScoreHistoryCard(state.scoreHistory, modifier = Modifier.weight(1f))
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

        // ── Dimension cards ──
        Text(
            text = "Score Breakdown",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics {
                heading()
                contentDescription = "Score Breakdown section"
            },
        )
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
        ) {
            items(state.dimensions, key = { it.name }) { dimension ->
                DimensionCard(dimension)
            }
        }
    }
}

// =============================================================================
// Sub-composables
// =============================================================================

@Composable
private fun OverallScoreCard(state: HealthScoreUiState, modifier: Modifier = Modifier) {
    val animatedScore by animateIntAsState(
        targetValue = state.overallScore,
        animationSpec = tween(1000),
        label = "overall-score",
    )
    val animatedProgress by animateFloatAsState(
        targetValue = state.overallScore / 100f,
        animationSpec = tween(1000),
        label = "score-ring",
    )

    val scoreColor = scoreToColor(state.overallScore)

    ElevatedCard(
        modifier = modifier
            .fillMaxHeight()
            .semantics {
                contentDescription =
                    "Overall health score: ${state.overallScore} out of 100, grade ${state.overallGrade}, " +
                        "top ${state.benchmarkPercentile} percentile"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(FinanceDesktopTheme.spacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Score ring
            Box(
                modifier = Modifier.size(120.dp),
                contentAlignment = Alignment.Center,
            ) {
                val trackColor = MaterialTheme.colorScheme.surfaceVariant
                Canvas(Modifier.size(120.dp)) {
                    val strokeWidth = 10.dp.toPx()
                    val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
                    val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)
                    drawArc(
                        trackColor, -90f, 360f, false,
                        topLeft, arcSize,
                        style = Stroke(strokeWidth, cap = StrokeCap.Round),
                    )
                    drawArc(
                        scoreColor, -90f, animatedProgress * 360f, false,
                        topLeft, arcSize,
                        style = Stroke(strokeWidth, cap = StrokeCap.Round),
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "$animatedScore",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = scoreColor,
                    )
                    Text(
                        text = state.overallGrade,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = scoreColor,
                    )
                }
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

            // Benchmark percentile
            Row(
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Filled.Favorite,
                    contentDescription = null,
                    tint = scoreColor,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.xs))
                Text(
                    text = "Top ${state.benchmarkPercentile}% of users",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun ScoreHistoryCard(history: List<HistoryPoint>, modifier: Modifier = Modifier) {
    ElevatedCard(
        modifier = modifier
            .fillMaxHeight()
            .semantics {
                contentDescription = "Score history over the last 6 months"
            },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(FinanceDesktopTheme.spacing.lg),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.AutoMirrored.Filled.TrendingUp,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
                Text(
                    text = "Score Trend",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

            // Bar chart visualization
            if (history.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    history.forEach { point ->
                        val barHeight by animateFloatAsState(
                            targetValue = point.score / 100f,
                            animationSpec = tween(800),
                            label = "history-bar-${point.label}",
                        )
                        Column(
                            modifier = Modifier.weight(1f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                text = "${point.score}",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Medium,
                            )
                            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                            val barColor = scoreToColor(point.score)
                            Canvas(
                                modifier = Modifier
                                    .fillMaxWidth(0.6f)
                                    .weight(1f),
                            ) {
                                val barWidth = size.width
                                val maxBarHeight = size.height
                                val actualHeight = maxBarHeight * barHeight
                                drawRoundRect(
                                    color = barColor,
                                    topLeft = Offset(0f, maxBarHeight - actualHeight),
                                    size = Size(barWidth, actualHeight),
                                )
                            }
                            Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                            Text(
                                text = point.label,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DimensionCard(dimension: HealthDimension) {
    val scoreColor = scoreToColor(dimension.score)
    val animatedProgress by animateFloatAsState(
        targetValue = dimension.score / 100f,
        animationSpec = tween(800),
        label = "dimension-${dimension.name}",
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("${dimension.name}: score ${dimension.score}, grade ${dimension.grade}. ")
                    append("${dimension.description}. ")
                    append("Benchmark average: ${dimension.benchmarkAverage}. ")
                    append("Tip: ${dimension.tip}")
                }
            },
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.lg),
        ) {
            // Header: name + score + grade
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = dimension.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                    Text(
                        text = dimension.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${dimension.score}/100",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = scoreColor,
                    )
                    Text(
                        text = dimension.grade,
                        style = MaterialTheme.typography.labelLarge,
                        color = scoreColor,
                    )
                }
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

            // Progress bar with benchmark marker
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp),
                color = scoreColor,
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
                strokeCap = StrokeCap.Round,
            )

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

            // Benchmark comparison + tip
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "Benchmark avg: ${dimension.benchmarkAverage}/100",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val comparison = dimension.score - dimension.benchmarkAverage
                val compLabel = if (comparison >= 0) "+$comparison above" else "${comparison} below"
                Text(
                    text = compLabel,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (comparison >= 0) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))

            // Tip
            Surface(
                shape = MaterialTheme.shapes.small,
                color = MaterialTheme.colorScheme.secondaryContainer,
            ) {
                Text(
                    text = "💡 ${dimension.tip}",
                    modifier = Modifier.padding(
                        horizontal = FinanceDesktopTheme.spacing.md,
                        vertical = FinanceDesktopTheme.spacing.sm,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
        }
    }
}

/**
 * Maps a score (0–100) to an appropriate color for visual feedback.
 */
@Composable
private fun scoreToColor(score: Int): Color = when {
    score >= 80 -> Color(0xFF2E7D32) // Green
    score >= 60 -> MaterialTheme.colorScheme.primary // Blue
    score >= 40 -> Color(0xFFFF9800) // Amber
    else -> MaterialTheme.colorScheme.error // Red
}
