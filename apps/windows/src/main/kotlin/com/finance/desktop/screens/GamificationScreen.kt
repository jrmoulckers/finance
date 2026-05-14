// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.finance.desktop.di.koinGet
import com.finance.desktop.gamification.Achievement
import com.finance.desktop.gamification.BadgeCategory
import com.finance.desktop.gamification.StreakInfo
import com.finance.desktop.gamification.UserLevel
import com.finance.desktop.theme.FinanceDesktopTheme
import com.finance.desktop.viewmodel.GamificationViewModel

/**
 * Gamification screen showing achievements, streaks, and level progression.
 *
 * Layout:
 * - Top: Level card with XP progress ring
 * - Middle: Streak cards (daily tracking, budget adherence)
 * - Bottom: Achievement badge grid with category filters
 *
 * Narrator: all interactive elements and progress indicators have
 * content descriptions. Badge cards announce unlock status and progress.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
@Suppress("LongMethod") // Gamification UI composable
fun GamificationScreen(modifier: Modifier = Modifier) {
    val viewModel = koinGet<GamificationViewModel>()
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics {
                    contentDescription = "Loading achievements"
                },
            )
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(FinanceDesktopTheme.spacing.xxl)
            .semantics { contentDescription = "Gamification screen" },
    ) {
        // ── Header ──
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Filled.EmojiEvents,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
                Text(
                    text = "Achievements",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.semantics { heading() },
                )
            }
            IconButton(
                onClick = { viewModel.refresh() },
                modifier = Modifier.semantics {
                    contentDescription = "Refresh achievements"
                },
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null)
            }
        }

        Spacer(Modifier.height(FinanceDesktopTheme.spacing.xxl))

        Row(
            modifier = Modifier.fillMaxWidth().weight(1f),
            horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.xxl),
        ) {
            // ── Left column: Level + Streaks ──
            Column(
                modifier = Modifier.width(300.dp).fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.lg),
            ) {
                LevelCard(state.userLevel, state.totalXp)
                StreaksSection(state.streaks)

                // Recent unlocks
                if (state.recentUnlocks.isNotEmpty()) {
                    Text(
                        text = "Recently Unlocked",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                    state.recentUnlocks.forEach { achievement ->
                        RecentUnlockCard(achievement)
                    }
                }
            }

            // ── Right column: Achievement badges ──
            Column(modifier = Modifier.weight(1f).fillMaxHeight()) {
                // Category filter chips
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.sm),
                ) {
                    FilterChip(
                        selected = state.selectedCategory == null,
                        onClick = { viewModel.filterByCategory(null) },
                        label = { Text("All") },
                        modifier = Modifier.semantics {
                            contentDescription = "Filter: All categories"
                        },
                    )
                    BadgeCategory.entries.forEach { category ->
                        FilterChip(
                            selected = state.selectedCategory == category,
                            onClick = { viewModel.filterByCategory(category) },
                            label = {
                                Text(category.name.lowercase().replaceFirstChar { it.uppercase() })
                            },
                            modifier = Modifier.semantics {
                                contentDescription = "Filter: ${category.name} category"
                            },
                        )
                    }
                }

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.lg))

                val filteredAchievements = if (state.selectedCategory != null) {
                    state.achievements.filter { it.category == state.selectedCategory }
                } else {
                    state.achievements
                }

                val unlockedCount = filteredAchievements.count { it.isUnlocked }
                Text(
                    text = "$unlockedCount of ${filteredAchievements.size} unlocked",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(FinanceDesktopTheme.spacing.md),
                ) {
                    items(filteredAchievements, key = { it.id }) { achievement ->
                        AchievementCard(achievement)
                    }
                }
            }
        }
    }
}

// ── Sub-composables ──────────────────────────────────────────────────

@Composable
private fun LevelCard(level: UserLevel, totalXp: Int) {
    val animatedProgress by animateFloatAsState(
        targetValue = level.progress,
        animationSpec = tween(800),
        label = "level-progress",
    )

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Level ${level.level}, ${level.title}. " +
                    "${level.currentXp} of ${level.xpForNextLevel} XP to next level. " +
                    "Total XP: $totalXp"
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            modifier = Modifier.padding(FinanceDesktopTheme.spacing.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // XP progress ring
            Box(
                modifier = Modifier.size(100.dp),
                contentAlignment = Alignment.Center,
            ) {
                val primaryColor = MaterialTheme.colorScheme.primary
                val trackColor = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.15f)
                Canvas(Modifier.fillMaxSize()) {
                    val strokeWidth = 8.dp.toPx()
                    val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
                    val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)
                    drawArc(
                        trackColor, -90f, 360f, false,
                        topLeft, arcSize,
                        style = Stroke(strokeWidth, cap = StrokeCap.Round),
                    )
                    drawArc(
                        primaryColor, -90f, animatedProgress * 360f, false,
                        topLeft, arcSize,
                        style = Stroke(strokeWidth, cap = StrokeCap.Round),
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "${level.level}",
                        style = MaterialTheme.typography.headlineLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            }

            Spacer(Modifier.height(FinanceDesktopTheme.spacing.md))

            Text(
                text = level.title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            Text(
                text = "${level.currentXp} / ${level.xpForNextLevel} XP",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f),
            )
            Text(
                text = "Total: $totalXp XP",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.5f),
            )
        }
    }
}

@Composable
private fun StreaksSection(streaks: List<StreakInfo>) {
    Text(
        text = "Streaks",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.semantics { heading() },
    )
    Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
    streaks.forEach { streak ->
        StreakCard(streak)
        Spacer(Modifier.height(FinanceDesktopTheme.spacing.sm))
    }
}

@Composable
private fun StreakCard(streak: StreakInfo) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${streak.type}: ${streak.currentStreak} day streak. " +
                    "Longest: ${streak.longestStreak} days. " +
                    if (streak.isActiveToday) "Active today." else "Not active today."
            },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.LocalFireDepartment,
                contentDescription = null,
                tint = if (streak.isActiveToday) Color(0xFFFF6B35) else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = streak.type,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "Best: ${streak.longestStreak} days",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "${streak.currentStreak}",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (streak.isActiveToday) Color(0xFFFF6B35) else MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = "days",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AchievementCard(achievement: Achievement) {
    val alpha = if (achievement.isUnlocked) 1f else 0.5f
    val animatedProgress by animateFloatAsState(
        targetValue = achievement.progress,
        animationSpec = tween(600),
        label = "badge-progress-${achievement.id}",
    )

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = buildString {
                    append("${achievement.name}: ${achievement.description}. ")
                    append("${achievement.category.name} badge. ")
                    if (achievement.isUnlocked) {
                        append("Unlocked. ${achievement.xpReward} XP earned.")
                    } else {
                        append("Locked. ${(achievement.progress * 100).toInt()}% progress.")
                    }
                }
            },
        colors = CardDefaults.cardColors(
            containerColor = if (achievement.isUnlocked) {
                MaterialTheme.colorScheme.secondaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.lg),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Badge icon
            Surface(
                modifier = Modifier.size(48.dp),
                shape = RoundedCornerShape(12.dp),
                color = if (achievement.isUnlocked) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
                },
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        text = achievement.icon,
                        fontSize = 24.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(4.dp),
                    )
                }
            }

            Spacer(Modifier.width(FinanceDesktopTheme.spacing.lg))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = achievement.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = alpha),
                )
                Text(
                    text = achievement.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha),
                )
                if (!achievement.isUnlocked) {
                    Spacer(Modifier.height(FinanceDesktopTheme.spacing.xs))
                    LinearProgressIndicator(
                        progress = { animatedProgress },
                        modifier = Modifier.fillMaxWidth().height(4.dp),
                        trackColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                    )
                }
            }

            Spacer(Modifier.width(FinanceDesktopTheme.spacing.md))

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "+${achievement.xpReward}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (achievement.isUnlocked) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "XP",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun RecentUnlockCard(achievement: Achievement) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(FinanceDesktopTheme.spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = achievement.icon, fontSize = 20.sp)
            Spacer(Modifier.width(FinanceDesktopTheme.spacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = achievement.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "Just unlocked!",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.7f),
                )
            }
            Icon(
                imageVector = Icons.Filled.Star,
                contentDescription = null,
                tint = Color(0xFFFFD700),
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
