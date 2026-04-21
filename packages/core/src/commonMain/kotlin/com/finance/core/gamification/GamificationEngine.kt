// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.gamification

import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*

/**
 * Evaluates user financial data against achievement definitions, streak rules,
 * and milestone thresholds to produce gamification state.
 *
 * Pure commonMain — no platform dependencies.
 * All monetary values use [Cents] (Long-backed) for exact precision.
 * All date/time operations use kotlinx-datetime exclusively.
 *
 * ## Level Calculation
 * Points thresholds follow a quadratic curve:
 * Level N requires `N * N * 50` total points.
 * Level 1 = 50 pts, Level 5 = 1,250 pts, Level 10 = 5,000 pts.
 */
object GamificationEngine {

    /** Points per level = level² × this multiplier. */
    private const val LEVEL_POINTS_MULTIPLIER = 50

    // ── Achievement Evaluation ───────────────────────────────────────

    /**
     * Evaluate all achievements against current user data.
     *
     * @param transactions All transactions (used for count-based and streak achievements).
     * @param accounts All accounts (used for onboarding achievements).
     * @param budgets All budgets (used for budget achievements).
     * @param goals All goals (used for savings achievements).
     * @param existingProgress Previously earned/tracked progress (for idempotency).
     * @param now Current instant for timestamps.
     * @return Updated list of [AchievementProgress] for all defined achievements.
     */
    fun evaluateAchievements(
        transactions: List<Transaction>,
        accounts: List<Account>,
        budgets: List<Budget>,
        goals: List<Goal>,
        existingProgress: List<AchievementProgress> = emptyList(),
        now: Instant = Clock.System.now(),
    ): List<AchievementProgress> {
        val progressMap = existingProgress.associateBy { it.achievementId }.toMutableMap()
        val activeTransactions = transactions.filter { it.deletedAt == null }
        val activeAccounts = accounts.filter { it.deletedAt == null }
        val activeBudgets = budgets.filter { it.deletedAt == null }
        val activeGoals = goals.filter { it.deletedAt == null }

        for (definition in Achievements.ALL) {
            val existing = progressMap[definition.id]
            if (existing?.isUnlocked == true) continue // Already unlocked

            val progress = evaluateAchievement(
                definition, activeTransactions, activeAccounts,
                activeBudgets, activeGoals, now,
            )
            progressMap[definition.id] = progress
        }

        return progressMap.values.toList()
    }

    internal fun evaluateAchievement(
        definition: AchievementDefinition,
        transactions: List<Transaction>,
        accounts: List<Account>,
        budgets: List<Budget>,
        goals: List<Goal>,
        now: Instant,
    ): AchievementProgress {
        return when (definition.id) {
            // Onboarding
            Achievements.FIRST_ACCOUNT.id -> booleanAchievement(
                definition, accounts.isNotEmpty(), now,
            )
            Achievements.FIRST_BUDGET.id -> booleanAchievement(
                definition, budgets.isNotEmpty(), now,
            )
            Achievements.FIRST_GOAL.id -> booleanAchievement(
                definition, goals.isNotEmpty(), now,
            )

            // Transaction count
            Achievements.TRANSACTIONS_10.id,
            Achievements.TRANSACTIONS_100.id,
            Achievements.TRANSACTIONS_1000.id -> countAchievement(
                definition, transactions.size, now,
            )

            // Savings milestones
            Achievements.SAVINGS_100.id -> savingsThresholdAchievement(
                definition, goals, Cents(10000), now,
            )
            Achievements.SAVINGS_1000.id -> savingsThresholdAchievement(
                definition, goals, Cents(100000), now,
            )
            Achievements.SAVINGS_10000.id -> savingsThresholdAchievement(
                definition, goals, Cents(1000000), now,
            )

            // Goal completed
            Achievements.GOAL_COMPLETED.id -> booleanAchievement(
                definition, goals.any { it.status == GoalStatus.COMPLETED }, now,
            )

            // Budget adherence and streaks are tracked externally
            else -> AchievementProgress(
                achievementId = definition.id,
                currentCount = 0,
                isUnlocked = false,
            )
        }
    }

    private fun booleanAchievement(
        definition: AchievementDefinition,
        condition: Boolean,
        now: Instant,
    ): AchievementProgress {
        return if (condition) {
            AchievementProgress(
                achievementId = definition.id,
                currentCount = 1,
                isUnlocked = true,
                unlockedAt = now,
            )
        } else {
            AchievementProgress(
                achievementId = definition.id,
                currentCount = 0,
                isUnlocked = false,
            )
        }
    }

    private fun countAchievement(
        definition: AchievementDefinition,
        count: Int,
        now: Instant,
    ): AchievementProgress {
        val target = definition.targetCount ?: 1
        return if (count >= target) {
            AchievementProgress(
                achievementId = definition.id,
                currentCount = count,
                isUnlocked = true,
                unlockedAt = now,
            )
        } else {
            AchievementProgress(
                achievementId = definition.id,
                currentCount = count,
                isUnlocked = false,
            )
        }
    }

    private fun savingsThresholdAchievement(
        definition: AchievementDefinition,
        goals: List<Goal>,
        threshold: Cents,
        now: Instant,
    ): AchievementProgress {
        val maxSaved = goals.maxOfOrNull { it.currentAmount.amount } ?: 0L
        return if (maxSaved >= threshold.amount) {
            AchievementProgress(
                achievementId = definition.id,
                currentCount = 1,
                isUnlocked = true,
                unlockedAt = now,
            )
        } else {
            AchievementProgress(
                achievementId = definition.id,
                currentCount = 0,
                isUnlocked = false,
            )
        }
    }

    // ── Streak Tracking ──────────────────────────────────────────────

    /**
     * Update a streak based on a new activity date.
     *
     * If the activity date is the day after the last activity, the streak
     * extends. If it's the same day, no change. If there's a gap, the
     * streak resets to 1.
     *
     * @param existing The current streak state (null for new streaks).
     * @param type Streak type identifier.
     * @param activityDate Date of the new activity.
     * @return Updated [Streak].
     */
    fun updateStreak(
        existing: Streak?,
        type: String,
        activityDate: LocalDate,
    ): Streak {
        if (existing == null) {
            return Streak(
                type = type,
                currentCount = 1,
                bestCount = 1,
                lastActivityDate = activityDate,
            )
        }

        val daysSinceLast = existing.lastActivityDate.daysUntil(activityDate)

        return when {
            daysSinceLast == 0 -> existing // Same day, no change
            daysSinceLast == 1 -> {
                // Consecutive day — extend streak
                val newCount = existing.currentCount + 1
                Streak(
                    type = type,
                    currentCount = newCount,
                    bestCount = maxOf(existing.bestCount, newCount),
                    lastActivityDate = activityDate,
                )
            }
            daysSinceLast < 0 -> existing // Activity in the past, ignore
            else -> {
                // Gap — reset streak
                Streak(
                    type = type,
                    currentCount = 1,
                    bestCount = existing.bestCount,
                    lastActivityDate = activityDate,
                )
            }
        }
    }

    // ── Milestone Calculation ────────────────────────────────────────

    /**
     * Calculate savings milestones for a goal.
     *
     * @param currentAmount Current savings amount.
     * @param milestones Threshold amounts to check against.
     * @return List of [SavingsMilestone] with reached/unreached status.
     */
    fun calculateSavingsMilestones(
        currentAmount: Cents,
        milestones: List<Cents> = Achievements.SAVINGS_MILESTONES,
    ): List<SavingsMilestone> {
        return milestones.map { threshold ->
            SavingsMilestone(
                targetCents = threshold,
                label = formatCents(threshold),
                isReached = currentAmount.amount >= threshold.amount,
            )
        }
    }

    // ── Level Calculation ────────────────────────────────────────────

    /**
     * Calculate user level from total points.
     * Level N requires N² × [LEVEL_POINTS_MULTIPLIER] total points.
     */
    fun calculateLevel(totalPoints: Int): Int {
        if (totalPoints <= 0) return 1
        var level = 1
        while (pointsForLevel(level + 1) <= totalPoints) {
            level++
        }
        return level
    }

    /**
     * Points required to reach a specific level.
     */
    fun pointsForLevel(level: Int): Int {
        require(level >= 1) { "Level must be >= 1" }
        return level * level * LEVEL_POINTS_MULTIPLIER
    }

    /**
     * Points remaining to reach the next level.
     */
    fun pointsToNextLevel(totalPoints: Int): Int {
        val currentLevel = calculateLevel(totalPoints)
        val nextLevelPoints = pointsForLevel(currentLevel + 1)
        return (nextLevelPoints - totalPoints).coerceAtLeast(0)
    }

    // ── Profile Summary ──────────────────────────────────────────────

    /**
     * Build a complete gamification profile from achievement progress and streaks.
     */
    fun buildProfile(
        progress: List<AchievementProgress>,
        streaks: List<Streak>,
    ): GamificationProfile {
        val unlocked = progress.filter { it.isUnlocked }
        val totalPoints = unlocked.sumOf { ap ->
            Achievements.ALL.find { it.id == ap.achievementId }?.points ?: 0
        }

        return GamificationProfile(
            totalPoints = totalPoints,
            level = calculateLevel(totalPoints),
            pointsToNextLevel = pointsToNextLevel(totalPoints),
            achievementsUnlocked = unlocked.size,
            achievementsTotal = Achievements.ALL.size,
            activeStreaks = streaks.filter { it.currentCount > 0 },
        )
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private fun formatCents(cents: Cents): String {
        val dollars = cents.amount / 100
        return if (dollars >= 1000) {
            "$${dollars / 1000},${(dollars % 1000).toString().padStart(3, '0')}"
        } else {
            "$$dollars"
        }
    }
}
