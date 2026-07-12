// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gamification

/**
 * A "near-win" — an achievement or streak the user is close to completing.
 *
 * Near-win feedback (#2211) surfaces progress that is *almost* there to create
 * genuine, earned anticipation. It is intentionally non-manipulative:
 * - Only real progress is shown (never fabricated "so close!" nudges).
 * - Language is encouraging, never loss-averse ("keep going", never "don't lose it").
 * - Streaks never imply punishment for stopping.
 *
 * @property id Stable identifier (achievement id or a synthetic streak id).
 * @property title Short headline.
 * @property message Encouraging, specific description of what's left.
 * @property progressFraction 0f..1f progress toward the win.
 * @property remainingLabel Human label for what remains (e.g. "2 to go").
 */
data class NearWin(
    val id: String,
    val title: String,
    val message: String,
    val progressFraction: Float,
    val remainingLabel: String,
)

/**
 * Pure, testable computation of near-win feedback for the gamification screen (#2211).
 *
 * No Android or Compose dependencies so it can be unit-tested directly.
 */
object NearWinCalculator {

    /** Achievements at or above this fraction (but not unlocked) count as near-wins. */
    const val NEAR_THRESHOLD = 0.5f

    /** Maximum number of near-wins to surface at once (avoids overwhelming the user). */
    const val MAX_NEAR_WINS = 3

    /**
     * Computes near-wins from the current achievement list and streak state.
     *
     * @param achievements All achievements with their progress.
     * @param currentStreakDays The user's current consecutive-day logging streak.
     * @param bestStreakDays The user's best-ever streak (for "beat your record" framing).
     * @return Up to [MAX_NEAR_WINS] near-wins, highest progress first.
     */
    fun compute(
        achievements: List<AchievementUi>,
        currentStreakDays: Int,
        bestStreakDays: Int,
    ): List<NearWin> {
        val achievementNearWins = achievements
            .asSequence()
            .filter { !it.isUnlocked }
            .filter { it.targetCount != null && it.targetCount > 0 }
            .filter { it.progressFraction >= NEAR_THRESHOLD && it.progressFraction < 1f }
            .sortedByDescending { it.progressFraction }
            .map { a ->
                val target = a.targetCount ?: 0
                val remaining = (target - a.currentCount).coerceAtLeast(1)
                NearWin(
                    id = a.id,
                    title = a.title,
                    message = "Just $remaining more to unlock \"${a.title}\"",
                    progressFraction = a.progressFraction,
                    remainingLabel = "$remaining to go",
                )
            }
            .toList()

        val streakNearWin = streakNearWin(currentStreakDays, bestStreakDays)

        return (listOfNotNull(streakNearWin) + achievementNearWins).take(MAX_NEAR_WINS)
    }

    /**
     * Builds an optional streak near-win.
     *
     * Only surfaces when the user is genuinely close to a meaningful milestone
     * (a full week) or to beating their own record. Never punitive.
     */
    private fun streakNearWin(currentStreakDays: Int, bestStreakDays: Int): NearWin? {
        if (currentStreakDays <= 0) return null

        // Close to beating personal best (within 2 days, and best is meaningful).
        if (bestStreakDays >= WEEK && currentStreakDays in (bestStreakDays - 2) until bestStreakDays) {
            val remaining = (bestStreakDays - currentStreakDays + 1).coerceAtLeast(1)
            return NearWin(
                id = "streak-record",
                title = "New record in reach",
                message = "$remaining more day(s) to beat your best streak of $bestStreakDays",
                progressFraction = currentStreakDays.toFloat() / (bestStreakDays + 1),
                remainingLabel = "$remaining to go",
            )
        }

        // Close to a full week.
        if (currentStreakDays in (WEEK - 2) until WEEK) {
            val remaining = WEEK - currentStreakDays
            return NearWin(
                id = "streak-week",
                title = "A week is close",
                message = "$remaining more day(s) for a full-week streak",
                progressFraction = currentStreakDays.toFloat() / WEEK,
                remainingLabel = "$remaining to go",
            )
        }
        return null
    }

    private const val WEEK = 7
}
