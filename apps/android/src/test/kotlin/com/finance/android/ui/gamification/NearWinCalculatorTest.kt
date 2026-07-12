// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gamification

import com.finance.core.gamification.AchievementCategory
import com.finance.core.gamification.AchievementRarity
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests for [NearWinCalculator] — the "so close" feedback engine (#2211).
 *
 * Near-wins must reflect only genuine progress and never manipulate: no
 * fabricated urgency, no loss-aversion, capped count.
 */
class NearWinCalculatorTest {

    private fun achievement(
        id: String,
        unlocked: Boolean,
        progress: Float,
        current: Int,
        target: Int?,
    ) = AchievementUi(
        id = id,
        title = "Title $id",
        description = "Desc",
        icon = "Star",
        category = AchievementCategory.SAVING,
        rarity = AchievementRarity.COMMON,
        points = 10,
        isUnlocked = unlocked,
        progressFraction = progress,
        currentCount = current,
        targetCount = target,
    )

    @Test
    fun `achievements below threshold are not near-wins`() {
        val achievements = listOf(achievement("a", false, 0.3f, 3, 10))
        val nearWins = NearWinCalculator.compute(achievements, currentStreakDays = 0, bestStreakDays = 0)
        assertTrue(nearWins.isEmpty())
    }

    @Test
    fun `unlocked achievements are never near-wins`() {
        val achievements = listOf(achievement("a", true, 1.0f, 10, 10))
        val nearWins = NearWinCalculator.compute(achievements, currentStreakDays = 0, bestStreakDays = 0)
        assertTrue(nearWins.none { it.id == "a" })
    }

    @Test
    fun `achievement at or above threshold becomes a near-win with remaining count`() {
        val achievements = listOf(achievement("a", false, 0.8f, 8, 10))
        val nearWins = NearWinCalculator.compute(achievements, currentStreakDays = 0, bestStreakDays = 0)
        assertEquals(1, nearWins.size)
        assertEquals("a", nearWins.first().id)
        assertEquals("2 to go", nearWins.first().remainingLabel)
    }

    @Test
    fun `near-wins are sorted by progress descending`() {
        val achievements = listOf(
            achievement("low", false, 0.55f, 5, 9),
            achievement("high", false, 0.9f, 9, 10),
        )
        val nearWins = NearWinCalculator.compute(achievements, currentStreakDays = 0, bestStreakDays = 0)
        // Streak near-win (none here) then achievements by progress: high before low.
        assertEquals("high", nearWins.first().id)
    }

    @Test
    fun `result is capped at max near-wins`() {
        val achievements = (1..10).map { achievement("a$it", false, 0.9f, 9, 10) }
        val nearWins = NearWinCalculator.compute(achievements, currentStreakDays = 6, bestStreakDays = 0)
        assertTrue(nearWins.size <= NearWinCalculator.MAX_NEAR_WINS)
    }

    @Test
    fun `streak close to a week surfaces a streak near-win`() {
        val nearWins = NearWinCalculator.compute(
            achievements = emptyList(),
            currentStreakDays = 6,
            bestStreakDays = 0,
        )
        assertEquals(1, nearWins.size)
        assertEquals("streak-week", nearWins.first().id)
    }

    @Test
    fun `zero streak produces no streak near-win`() {
        val nearWins = NearWinCalculator.compute(
            achievements = emptyList(),
            currentStreakDays = 0,
            bestStreakDays = 10,
        )
        assertTrue(nearWins.isEmpty())
    }

    @Test
    fun `streak close to personal best surfaces a record near-win`() {
        val nearWins = NearWinCalculator.compute(
            achievements = emptyList(),
            currentStreakDays = 13,
            bestStreakDays = 14,
        )
        assertEquals("streak-record", nearWins.first().id)
    }
}
