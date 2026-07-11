// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.learning

import android.content.SharedPreferences
import timber.log.Timber

/**
 * A durable snapshot of the user's learning journey (#2208).
 *
 * @property progress Per-path progress keyed by path ID.
 * @property lastActivePathId The path the user most recently studied, for
 *   the "pick up where you left off" entry point. `null` if none.
 * @property lastActiveModuleIndex The module index within [lastActivePathId].
 * @property streakDays Consecutive-day learning streak.
 * @property lastActiveEpochDay Epoch day of the last learning activity, used to
 *   advance or reset the streak. `0` means no activity recorded yet.
 */
data class LearningState(
    val progress: Map<String, LearningProgress> = emptyMap(),
    val lastActivePathId: String? = null,
    val lastActiveModuleIndex: Int = 0,
    val streakDays: Int = 0,
    val lastActiveEpochDay: Long = 0L,
)

/**
 * Reward summary derived from a [LearningState] (#2208).
 *
 * Turns raw progress into visible motivation — XP, a level, a learning streak,
 * and unlocked badges — so returning to learn feels like a series of small wins
 * instead of homework that restarts.
 *
 * @property xp Total experience points earned.
 * @property level Current learner level (starts at 1).
 * @property xpIntoLevel XP accumulated within the current level.
 * @property xpForNextLevel XP needed to reach the next level.
 * @property lessonsCompleted Total completed modules across all paths.
 * @property quizzesMastered Number of quizzes answered perfectly.
 * @property streakDays Consecutive-day learning streak.
 * @property badges Ordered list of badges with unlock state.
 */
data class LearningRewards(
    val xp: Int,
    val level: Int,
    val xpIntoLevel: Int,
    val xpForNextLevel: Int,
    val lessonsCompleted: Int,
    val quizzesMastered: Int,
    val streakDays: Int,
    val badges: List<LearningBadge>,
) {
    /** Progress toward the next level, 0f..1f. */
    val levelProgress: Float
        get() = if (xpForNextLevel > 0) (xpIntoLevel.toFloat() / xpForNextLevel).coerceIn(0f, 1f) else 0f

    companion object {
        /** XP awarded for finishing a single learning module. */
        const val XP_PER_LESSON = 10

        /** Bonus XP awarded for a perfect quiz score. */
        const val XP_PER_QUIZ_MASTERY = 5

        /** XP required to advance one level. */
        const val XP_PER_LEVEL = 100

        /**
         * Computes reward state from raw learning [progress] and a [streakDays]
         * count. Pure and deterministic so it is straightforward to unit test.
         */
        fun from(progress: Map<String, LearningProgress>, streakDays: Int): LearningRewards {
            val lessonsCompleted = progress.values.sumOf { it.completedModuleIds.size }
            val quizzesMastered = progress.values.sumOf { p ->
                p.quizScores.values.count { it >= 1f }
            }
            val xp = lessonsCompleted * XP_PER_LESSON + quizzesMastered * XP_PER_QUIZ_MASTERY
            val level = xp / XP_PER_LEVEL + 1
            val xpIntoLevel = xp % XP_PER_LEVEL

            val badges = listOf(
                LearningBadge(
                    id = "first-lesson",
                    title = "First Steps",
                    description = "Complete your first lesson",
                    icon = "🌱",
                    unlocked = lessonsCompleted >= 1,
                ),
                LearningBadge(
                    id = "five-lessons",
                    title = "Getting Serious",
                    description = "Complete five lessons",
                    icon = "📚",
                    unlocked = lessonsCompleted >= 5,
                ),
                LearningBadge(
                    id = "quiz-master",
                    title = "Quiz Master",
                    description = "Ace three quizzes",
                    icon = "🎯",
                    unlocked = quizzesMastered >= 3,
                ),
                LearningBadge(
                    id = "streak-3",
                    title = "On a Roll",
                    description = "Learn three days in a row",
                    icon = "🔥",
                    unlocked = streakDays >= 3,
                ),
            )

            return LearningRewards(
                xp = xp,
                level = level,
                xpIntoLevel = xpIntoLevel,
                xpForNextLevel = XP_PER_LEVEL,
                lessonsCompleted = lessonsCompleted,
                quizzesMastered = quizzesMastered,
                streakDays = streakDays,
                badges = badges,
            )
        }
    }
}

/**
 * A single unlockable learning badge.
 */
data class LearningBadge(
    val id: String,
    val title: String,
    val description: String,
    val icon: String,
    val unlocked: Boolean,
)

/**
 * Pure day-streak logic for learning activity (#2208).
 *
 * Extracted so it can be unit tested without Android or a clock.
 */
object LearningStreak {

    /**
     * Advances a learning streak given the [previousDay] of the last activity,
     * the [previousStreak] length, and [todayDay] (both as epoch days).
     *
     * - Same day → unchanged (still counts as active today).
     * - Next consecutive day → streak + 1.
     * - Gap of 2+ days, or first-ever activity → streak resets to 1.
     */
    fun advance(previousDay: Long, previousStreak: Int, todayDay: Long): Int = when {
        previousDay == todayDay && previousStreak > 0 -> previousStreak
        previousDay == todayDay -> 1
        todayDay - previousDay == 1L -> previousStreak + 1
        else -> 1
    }
}

/**
 * Persists and restores the user's [LearningState] across app restarts (#2208).
 *
 * Backed by [SharedPreferences] (encrypted app settings) and a plain-text codec
 * so no external serialization dependency is required. Learning progress is not
 * sensitive financial data.
 */
class LearningProgressRepository(
    private val prefs: SharedPreferences,
) {

    /** Loads the persisted [LearningState], or an empty state on first run. */
    fun load(): LearningState {
        val encoded = prefs.getString(KEY_STATE, null) ?: return LearningState()
        return runCatching { LearningProgressCodec.decode(encoded) }
            .getOrElse {
                Timber.w(it, "Failed to decode persisted learning state; starting fresh")
                LearningState()
            }
    }

    /** Persists [state]. */
    fun save(state: LearningState) {
        prefs.edit().putString(KEY_STATE, LearningProgressCodec.encode(state)).apply()
    }

    private companion object {
        const val KEY_STATE = "learning_state_v1"
    }
}
