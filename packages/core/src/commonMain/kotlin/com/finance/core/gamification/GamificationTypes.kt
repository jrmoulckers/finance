// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.gamification

import com.finance.models.types.Cents
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/**
 * Category grouping for achievements.
 */
@Serializable
enum class AchievementCategory {
    /** Milestones related to transaction tracking. */
    TRACKING,

    /** Budget-related accomplishments. */
    BUDGETING,

    /** Savings and goal milestones. */
    SAVING,

    /** Streak-based achievements. */
    STREAKS,

    /** Account and setup milestones. */
    ONBOARDING,
}

/**
 * Rarity tier affects display prominence and celebration UI.
 */
@Serializable
enum class AchievementRarity {
    COMMON,
    UNCOMMON,
    RARE,
    EPIC,
    LEGENDARY,
}

/**
 * Defines an achievement that can be earned by the user.
 *
 * Achievement definitions are static — the engine evaluates current
 * financial data against these definitions to determine unlock status.
 */
@Serializable
data class AchievementDefinition(
    /** Unique identifier (e.g., "first-transaction", "savings-1000"). */
    val id: String,
    /** Display title. */
    val title: String,
    /** Description of how to earn this achievement. */
    val description: String,
    /** Icon identifier for the client to render. */
    val icon: String,
    /** Classification category. */
    val category: AchievementCategory,
    /** Rarity tier. */
    val rarity: AchievementRarity,
    /** Points awarded on unlock (for leaderboard / level calculation). */
    val points: Int,
    /** For progressive achievements, the target count to unlock. Null for boolean triggers. */
    val targetCount: Int? = null,
) {
    init {
        require(id.isNotBlank()) { "Achievement id cannot be blank" }
        require(points > 0) { "Points must be positive" }
    }
}

/**
 * Represents the user's progress toward or completion of an achievement.
 */
@Serializable
data class AchievementProgress(
    /** References [AchievementDefinition.id]. */
    val achievementId: String,
    /** Current progress count (0 for locked, target for unlocked). */
    val currentCount: Int,
    /** Whether the achievement has been unlocked. */
    val isUnlocked: Boolean,
    /** Timestamp when unlocked. Null if still locked. */
    val unlockedAt: Instant? = null,
) {
    init {
        require(currentCount >= 0) { "currentCount cannot be negative" }
        if (isUnlocked) require(unlockedAt != null) { "unlockedAt required when unlocked" }
    }

    /**
     * Progress fraction 0.0–1.0 for display. Returns 1.0 if unlocked.
     */
    @Suppress("ReturnCount")
    fun progressFraction(definition: AchievementDefinition): Double {
        if (isUnlocked) return 1.0
        val target = definition.targetCount ?: 1
        if (target <= 0) return 0.0
        return (currentCount.toDouble() / target).coerceIn(0.0, 1.0)
    }
}

/**
 * A streak tracking record.
 */
@Serializable
data class Streak(
    /** Type of streak (e.g., "daily-tracking", "budget-adherence"). */
    val type: String,
    /** Current consecutive count. */
    val currentCount: Int,
    /** All-time best streak for this type. */
    val bestCount: Int,
    /** Date of the last activity that extended the streak. */
    val lastActivityDate: LocalDate,
) {
    init {
        require(currentCount >= 0) { "currentCount cannot be negative" }
        require(bestCount >= currentCount) { "bestCount must be >= currentCount" }
    }
}

/**
 * Milestone for savings goal progress.
 */
@Serializable
data class SavingsMilestone(
    /** Target amount in cents. */
    val targetCents: Cents,
    /** Display label (e.g., "$100", "$1,000"). */
    val label: String,
    /** Whether this milestone has been reached. */
    val isReached: Boolean,
)

/**
 * User's overall gamification profile summary.
 */
@Serializable
data class GamificationProfile(
    /** Total points earned from all achievements. */
    val totalPoints: Int,
    /** Current level derived from total points. */
    val level: Int,
    /** Points needed to reach the next level. */
    val pointsToNextLevel: Int,
    /** Number of achievements unlocked. */
    val achievementsUnlocked: Int,
    /** Total achievements available. */
    val achievementsTotal: Int,
    /** Active streaks summary. */
    val activeStreaks: List<Streak>,
)
