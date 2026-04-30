// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gamification

import com.finance.core.gamification.AchievementCategory
import com.finance.core.gamification.AchievementRarity
import com.finance.core.gamification.Achievements
import com.finance.core.gamification.Streak
import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests for [GamificationUiState] and [AchievementUi].
 */
class GamificationUiStateTest {

    @Test
    fun `default state is loading with level 1`() {
        val state = GamificationUiState()
        assertTrue(state.isLoading)
        assertEquals(1, state.level)
        assertEquals(0, state.totalPoints)
        assertEquals(Achievements.ALL.size, state.achievementsTotal)
    }

    @Test
    fun `AchievementUi unlocked has progress 1`() {
        val achievement = AchievementUi(
            id = "test",
            title = "Test",
            description = "Test achievement",
            icon = "star",
            category = AchievementCategory.TRACKING,
            rarity = AchievementRarity.COMMON,
            points = 10,
            isUnlocked = true,
            progressFraction = 1f,
            currentCount = 10,
            targetCount = 10,
        )
        assertTrue(achievement.isUnlocked)
        assertEquals(1f, achievement.progressFraction)
    }

    @Test
    fun `AchievementUi locked has partial progress`() {
        val achievement = AchievementUi(
            id = "test",
            title = "Test",
            description = "Track 100 transactions",
            icon = "list",
            category = AchievementCategory.TRACKING,
            rarity = AchievementRarity.UNCOMMON,
            points = 30,
            isUnlocked = false,
            progressFraction = 0.42f,
            currentCount = 42,
            targetCount = 100,
        )
        assertFalse(achievement.isUnlocked)
        assertEquals(42, achievement.currentCount)
        assertEquals(100, achievement.targetCount)
    }

    @Test
    fun `AchievementUi boolean achievement has null target`() {
        val achievement = AchievementUi(
            id = "onboarding-first-account",
            title = "Getting Started",
            description = "Create first account",
            icon = "wallet",
            category = AchievementCategory.ONBOARDING,
            rarity = AchievementRarity.COMMON,
            points = 10,
            isUnlocked = false,
            progressFraction = 0f,
            currentCount = 0,
            targetCount = null,
        )
        assertNull(achievement.targetCount)
    }

    @Test
    fun `loaded state preserves achievements list`() {
        val achievements = listOf(
            AchievementUi("a1", "Test", "Desc", "star",
                AchievementCategory.TRACKING, AchievementRarity.COMMON, 10, true, 1f, 1, null),
        )
        val state = GamificationUiState(
            isLoading = false,
            level = 2,
            totalPoints = 100,
            achievements = achievements,
            recentlyUnlocked = achievements,
        )
        assertEquals(1, state.achievements.size)
        assertEquals(1, state.recentlyUnlocked.size)
        assertEquals(2, state.level)
    }
}
