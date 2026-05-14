// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gamification

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Stars
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.finance.android.ui.theme.FinanceTheme
import com.finance.core.gamification.AchievementCategory
import com.finance.core.gamification.AchievementRarity
import com.finance.core.gamification.Streak
import kotlinx.datetime.LocalDate
import org.koin.compose.viewmodel.koinViewModel

/** Rarity-based color palette for achievement badges. */
private val rarityColors = mapOf(
    AchievementRarity.COMMON to Color(0xFF78909C),
    AchievementRarity.UNCOMMON to Color(0xFF4CAF50),
    AchievementRarity.RARE to Color(0xFF2196F3),
    AchievementRarity.EPIC to Color(0xFF9C27B0),
    AchievementRarity.LEGENDARY to Color(0xFFFF9800),
)

/**
 * Gamification screen (#242).
 *
 * Shows user level, achievement badges with animated reveal,
 * streak tracking, and level progression.
 */
@Composable
fun GamificationScreen(
    modifier: Modifier = Modifier,
    viewModel: GamificationViewModel = koinViewModel(),
) {
    val state by viewModel.uiState.collectAsState()

    if (state.isLoading) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .semantics { contentDescription = "Loading achievements" },
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.semantics { contentDescription = "Loading indicator" },
            )
        }
        return
    }

    GamificationContent(state = state, modifier = modifier)
}

@Composable
internal fun GamificationContent(
    state: GamificationUiState,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Level hero card
        item(key = "level") {
            LevelCard(
                level = state.level,
                totalPoints = state.totalPoints,
                pointsToNextLevel = state.pointsToNextLevel,
                progressFraction = state.levelProgressFraction,
                achievementsUnlocked = state.achievementsUnlocked,
                achievementsTotal = state.achievementsTotal,
            )
        }

        // Recently unlocked
        if (state.recentlyUnlocked.isNotEmpty()) {
            item(key = "recent-header") {
                Text(
                    text = "Recently Earned",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Recently Earned achievements section"
                    },
                )
            }
            item(key = "recent-row") {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp),
                ) {
                    items(state.recentlyUnlocked, key = { it.id }) { achievement ->
                        AnimatedVisibility(
                            visible = true,
                            enter = scaleIn(animationSpec = tween(500)) + fadeIn(),
                        ) {
                            AchievementBadge(achievement = achievement, compact = true)
                        }
                    }
                }
            }
        }

        // All achievements
        item(key = "all-header") {
            Text(
                text = "All Achievements",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.semantics {
                    heading()
                    contentDescription = "All Achievements section"
                },
            )
        }

        items(state.achievements, key = { it.id }) { achievement ->
            AchievementCard(achievement = achievement)
        }

        // Streaks
        if (state.activeStreaks.isNotEmpty()) {
            item(key = "streaks-header") {
                Text(
                    text = "Active Streaks",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.semantics {
                        heading()
                        contentDescription = "Active Streaks section"
                    },
                )
            }

            items(state.activeStreaks, key = { it.type }) { streak ->
                StreakCard(streak = streak)
            }
        }

        item(key = "spacer") { Spacer(Modifier.height(80.dp)) }
    }
}

// ── Level Card ───────────────────────────────────────────────────────

@Composable
private fun LevelCard(
    level: Int,
    totalPoints: Int,
    pointsToNextLevel: Int,
    progressFraction: Float,
    achievementsUnlocked: Int,
    achievementsTotal: Int,
) {
    val animatedProgress by animateFloatAsState(
        targetValue = progressFraction,
        animationSpec = tween(1000),
        label = "level-progress",
    )

    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "Level $level. $totalPoints total points. " +
                    "$pointsToNextLevel points to next level. " +
                    "$achievementsUnlocked of $achievementsTotal achievements unlocked."
            },
        colors = CardDefaults.elevatedCardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
    ) {
        Column(
            Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Filled.Stars,
                    contentDescription = null,
                    tint = Color(0xFFFFD700),
                    modifier = Modifier.size(32.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Level $level",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = "$totalPoints points",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
            )
            Spacer(Modifier.height(16.dp))
            LinearProgressIndicator(
                progress = { animatedProgress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
                color = Color(0xFFFFD700),
                trackColor = MaterialTheme.colorScheme.surfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "$pointsToNextLevel pts to Level ${level + 1}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.6f),
                )
                Text(
                    text = "$achievementsUnlocked/$achievementsTotal",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.6f),
                )
            }
        }
    }
}

// ── Achievement Badge (compact, for horizontal row) ──────────────────

@Composable
private fun AchievementBadge(
    achievement: AchievementUi,
    compact: Boolean = false,
) {
    val rarityColor = rarityColors[achievement.rarity] ?: MaterialTheme.colorScheme.primary

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(if (compact) 80.dp else 100.dp)
            .semantics {
                contentDescription = "${achievement.title}. ${achievement.description}. " +
                    "${achievement.rarity.name.lowercase()} rarity. ${achievement.points} points."
            },
    ) {
        Box(
            modifier = Modifier
                .size(if (compact) 48.dp else 64.dp)
                .clip(CircleShape)
                .background(rarityColor.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = achievementIcon(achievement.icon),
                contentDescription = null,
                tint = rarityColor,
                modifier = Modifier.size(if (compact) 24.dp else 32.dp),
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = achievement.title,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// ── Achievement Card (full, for vertical list) ───────────────────────

@Composable
private fun AchievementCard(achievement: AchievementUi) {
    val rarityColor = rarityColors[achievement.rarity] ?: MaterialTheme.colorScheme.primary
    val rarityLabel = achievement.rarity.name.lowercase()
        .replaceFirstChar { it.uppercase() }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${achievement.title}: ${achievement.description}. " +
                    "$rarityLabel rarity, ${achievement.points} points. " +
                    if (achievement.isUnlocked) "Unlocked." else
                        "Locked. Progress: ${(achievement.progressFraction * 100).toInt()}%."
            },
        colors = if (achievement.isUnlocked) {
            CardDefaults.cardColors(containerColor = rarityColor.copy(alpha = 0.1f))
        } else {
            CardDefaults.cardColors()
        },
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Badge icon
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(
                        if (achievement.isUnlocked) rarityColor.copy(alpha = 0.15f)
                        else MaterialTheme.colorScheme.surfaceVariant,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (achievement.isUnlocked) {
                    Icon(
                        achievementIcon(achievement.icon),
                        contentDescription = null,
                        tint = rarityColor,
                        modifier = Modifier.size(24.dp),
                    )
                } else {
                    Icon(
                        Icons.Filled.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = achievement.title,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (achievement.isUnlocked) rarityColor
                        else MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = "$rarityLabel · ${achievement.points}pts",
                        style = MaterialTheme.typography.labelSmall,
                        color = rarityColor.copy(alpha = 0.7f),
                    )
                }
                Text(
                    text = achievement.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!achievement.isUnlocked && achievement.targetCount != null) {
                    Spacer(Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { achievement.progressFraction },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp)),
                        color = rarityColor,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    )
                    Text(
                        text = "${achievement.currentCount}/${achievement.targetCount}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

// ── Streak Card ──────────────────────────────────────────────────────

@Composable
private fun StreakCard(streak: Streak) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                contentDescription = "${streak.type} streak: ${streak.currentCount} days. " +
                    "Best: ${streak.bestCount} days."
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.tertiaryContainer,
        ),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.LocalFireDepartment,
                contentDescription = null,
                tint = Color(0xFFFF5722),
                modifier = Modifier.size(28.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = streak.type.replaceFirstChar { it.uppercase() }.replace("-", " "),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                )
                Text(
                    text = "Best: ${streak.bestCount} days",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.7f),
                )
            }
            Text(
                text = "${streak.currentCount}",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = Color(0xFFFF5722),
            )
            Spacer(Modifier.width(4.dp))
            Text(
                text = "days",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onTertiaryContainer,
            )
        }
    }
}

// ── Icon Mapping ─────────────────────────────────────────────────────

/** Maps KMP achievement icon identifiers to Material Icons. */
private fun achievementIcon(icon: String): ImageVector = when (icon) {
    "wallet" -> Icons.Filled.Star
    "pie-chart" -> Icons.Filled.Star
    "target" -> Icons.Filled.Star
    "list" -> Icons.Filled.Star
    "list-check" -> Icons.Filled.Star
    "award" -> Icons.Filled.EmojiEvents
    "shield-check" -> Icons.Filled.Star
    "trophy" -> Icons.Filled.EmojiEvents
    "crown" -> Icons.Filled.WorkspacePremium
    "piggy-bank" -> Icons.Filled.Star
    "trending-up" -> Icons.Filled.Star
    "star" -> Icons.Filled.Star
    "check-circle" -> Icons.Filled.Star
    "flame", "fire" -> Icons.Filled.LocalFireDepartment
    "zap" -> Icons.Filled.Star
    "medal" -> Icons.Filled.WorkspacePremium
    else -> Icons.Filled.Star
}

// ── Previews ─────────────────────────────────────────────────────────

@Preview(showBackground = true, showSystemUi = true, name = "Gamification - Light")
@Preview(
    showBackground = true,
    showSystemUi = true,
    uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES,
    name = "Gamification - Dark",
)
@Composable
@Suppress("UnusedPrivateMember") // Compose Preview function used by IDE
private fun GamificationScreenPreview() {
    FinanceTheme(dynamicColor = false) {
        GamificationContent(
            state = GamificationUiState(
                isLoading = false,
                level = 3,
                totalPoints = 135,
                pointsToNextLevel = 665,
                levelProgressFraction = 0.35f,
                achievementsUnlocked = 5,
                achievementsTotal = 17,
                recentlyUnlocked = listOf(
                    AchievementUi("a1", "Getting Started", "Create your first account", "wallet",
                        AchievementCategory.ONBOARDING, AchievementRarity.COMMON, 10, true, 1f, 1, null),
                    AchievementUi("a2", "Tracker", "Record 10 transactions", "list",
                        AchievementCategory.TRACKING, AchievementRarity.COMMON, 15, true, 1f, 10, 10),
                ),
                achievements = listOf(
                    AchievementUi("a1", "Getting Started", "Create your first account", "wallet",
                        AchievementCategory.ONBOARDING, AchievementRarity.COMMON, 10, true, 1f, 1, null),
                    AchievementUi("a2", "Tracker", "Record 10 transactions", "list",
                        AchievementCategory.TRACKING, AchievementRarity.COMMON, 15, true, 1f, 10, 10),
                    AchievementUi("a3", "Diligent Recorder", "Record 100 transactions", "list-check",
                        AchievementCategory.TRACKING, AchievementRarity.UNCOMMON, 30, false, 0.42f, 42, 100),
                    AchievementUi("a4", "Budget Legend", "Stay under budget for 12 months", "crown",
                        AchievementCategory.BUDGETING, AchievementRarity.LEGENDARY, 200, false, 0.0f, 0, 12),
                ),
                activeStreaks = listOf(
                    Streak("daily-tracking", 7, 14, LocalDate(2025, 4, 20)),
                ),
            ),
        )
    }
}
