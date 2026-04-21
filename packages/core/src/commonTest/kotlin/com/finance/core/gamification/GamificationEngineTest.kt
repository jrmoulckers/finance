// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.gamification

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class GamificationEngineTest {

    private val now = Instant.parse("2024-06-15T12:00:00Z")
    private val today = LocalDate(2024, 6, 15)

    @BeforeTest
    fun setUp() {
        TestFixtures.reset()
    }

    // ═══════════════════════════════════════════════════════════════════
    // Achievement Evaluation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun evaluateAchievements_firstAccount_unlocksWhenAccountExists() {
        val accounts = listOf(TestFixtures.createAccount())

        val progress = GamificationEngine.evaluateAchievements(
            transactions = emptyList(),
            accounts = accounts,
            budgets = emptyList(),
            goals = emptyList(),
            now = now,
        )

        val firstAccount = progress.find { it.achievementId == Achievements.FIRST_ACCOUNT.id }
        assertNotNull(firstAccount)
        assertTrue(firstAccount.isUnlocked)
        assertEquals(now, firstAccount.unlockedAt)
    }

    @Test
    fun evaluateAchievements_firstAccount_lockedWhenNoAccounts() {
        val progress = GamificationEngine.evaluateAchievements(
            transactions = emptyList(),
            accounts = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
            now = now,
        )

        val firstAccount = progress.find { it.achievementId == Achievements.FIRST_ACCOUNT.id }
        assertNotNull(firstAccount)
        assertFalse(firstAccount.isUnlocked)
        assertNull(firstAccount.unlockedAt)
    }

    @Test
    fun evaluateAchievements_transactions10_unlocksAt10() {
        val transactions = (1..10).map {
            TestFixtures.createExpense(date = today)
        }

        val progress = GamificationEngine.evaluateAchievements(
            transactions = transactions,
            accounts = emptyList(),
            budgets = emptyList(),
            goals = emptyList(),
            now = now,
        )

        val txn10 = progress.find { it.achievementId == Achievements.TRANSACTIONS_10.id }
        assertNotNull(txn10)
        assertTrue(txn10.isUnlocked)
        assertEquals(10, txn10.currentCount)

        // 100 should not be unlocked yet
        val txn100 = progress.find { it.achievementId == Achievements.TRANSACTIONS_100.id }
        assertNotNull(txn100)
        assertFalse(txn100.isUnlocked)
        assertEquals(10, txn100.currentCount)
    }

    @Test
    fun evaluateAchievements_savings_unlocksAtThreshold() {
        val goals = listOf(
            Goal(
                id = SyncId("goal-1"),
                householdId = SyncId("hh-1"),
                ownerId = SyncId("owner-1"),
                name = "Emergency Fund",
                targetAmount = Cents(200000),
                currentAmount = Cents(100000), // $1,000 → unlocks SAVINGS_1000
                currency = Currency.USD,
                status = GoalStatus.ACTIVE,
                createdAt = now,
                updatedAt = now,
            ),
        )

        val progress = GamificationEngine.evaluateAchievements(
            transactions = emptyList(),
            accounts = emptyList(),
            budgets = emptyList(),
            goals = goals,
            now = now,
        )

        val s100 = progress.find { it.achievementId == Achievements.SAVINGS_100.id }
        assertNotNull(s100)
        assertTrue(s100.isUnlocked)

        val s1000 = progress.find { it.achievementId == Achievements.SAVINGS_1000.id }
        assertNotNull(s1000)
        assertTrue(s1000.isUnlocked)

        val s10000 = progress.find { it.achievementId == Achievements.SAVINGS_10000.id }
        assertNotNull(s10000)
        assertFalse(s10000.isUnlocked)
    }

    @Test
    fun evaluateAchievements_goalCompleted_unlocks() {
        val goals = listOf(
            Goal(
                id = SyncId("goal-1"),
                householdId = SyncId("hh-1"),
                ownerId = SyncId("owner-1"),
                name = "Vacation",
                targetAmount = Cents(100000),
                currentAmount = Cents(100000),
                currency = Currency.USD,
                status = GoalStatus.COMPLETED,
                createdAt = now,
                updatedAt = now,
            ),
        )

        val progress = GamificationEngine.evaluateAchievements(
            transactions = emptyList(),
            accounts = emptyList(),
            budgets = emptyList(),
            goals = goals,
            now = now,
        )

        val goalDone = progress.find { it.achievementId == Achievements.GOAL_COMPLETED.id }
        assertNotNull(goalDone)
        assertTrue(goalDone.isUnlocked)
    }

    @Test
    fun evaluateAchievements_preservesAlreadyUnlocked() {
        val existing = listOf(
            AchievementProgress(
                achievementId = Achievements.FIRST_ACCOUNT.id,
                currentCount = 1,
                isUnlocked = true,
                unlockedAt = Instant.parse("2024-01-01T00:00:00Z"),
            ),
        )

        val progress = GamificationEngine.evaluateAchievements(
            transactions = emptyList(),
            accounts = emptyList(), // No accounts now, but was unlocked before
            budgets = emptyList(),
            goals = emptyList(),
            existingProgress = existing,
            now = now,
        )

        val firstAccount = progress.find { it.achievementId == Achievements.FIRST_ACCOUNT.id }
        assertNotNull(firstAccount)
        assertTrue(firstAccount.isUnlocked) // Stays unlocked
        assertEquals(Instant.parse("2024-01-01T00:00:00Z"), firstAccount.unlockedAt)
    }

    // ═══════════════════════════════════════════════════════════════════
    // Streak Tracking
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun updateStreak_newStreak_startsAtOne() {
        val streak = GamificationEngine.updateStreak(null, "daily-tracking", today)

        assertEquals(1, streak.currentCount)
        assertEquals(1, streak.bestCount)
        assertEquals(today, streak.lastActivityDate)
    }

    @Test
    fun updateStreak_consecutiveDay_extends() {
        val existing = Streak("daily-tracking", 5, 5, today.minus(1, DateTimeUnit.DAY))

        val updated = GamificationEngine.updateStreak(existing, "daily-tracking", today)

        assertEquals(6, updated.currentCount)
        assertEquals(6, updated.bestCount)
        assertEquals(today, updated.lastActivityDate)
    }

    @Test
    fun updateStreak_sameDay_noChange() {
        val existing = Streak("daily-tracking", 5, 5, today)

        val updated = GamificationEngine.updateStreak(existing, "daily-tracking", today)

        assertEquals(5, updated.currentCount) // No change
    }

    @Test
    fun updateStreak_gap_resetsToOne() {
        val existing = Streak("daily-tracking", 10, 10, today.minus(3, DateTimeUnit.DAY))

        val updated = GamificationEngine.updateStreak(existing, "daily-tracking", today)

        assertEquals(1, updated.currentCount) // Reset
        assertEquals(10, updated.bestCount) // Best preserved
    }

    @Test
    fun updateStreak_newBestCount() {
        val existing = Streak("daily-tracking", 9, 9, today.minus(1, DateTimeUnit.DAY))

        val updated = GamificationEngine.updateStreak(existing, "daily-tracking", today)

        assertEquals(10, updated.currentCount)
        assertEquals(10, updated.bestCount) // New best
    }

    @Test
    fun updateStreak_pastDate_ignored() {
        val existing = Streak("daily-tracking", 5, 5, today)
        val pastDate = today.minus(2, DateTimeUnit.DAY)

        val updated = GamificationEngine.updateStreak(existing, "daily-tracking", pastDate)

        assertEquals(existing, updated) // No change
    }

    // ═══════════════════════════════════════════════════════════════════
    // Savings Milestones
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateSavingsMilestones_partiallyReached() {
        val milestones = GamificationEngine.calculateSavingsMilestones(
            currentAmount = Cents(75000), // $750
        )

        // $100 milestone reached
        assertTrue(milestones[0].isReached)
        // $500 milestone reached
        assertTrue(milestones[1].isReached)
        // $1,000 milestone not reached
        assertFalse(milestones[2].isReached)
    }

    @Test
    fun calculateSavingsMilestones_noneReached() {
        val milestones = GamificationEngine.calculateSavingsMilestones(
            currentAmount = Cents(5000), // $50
        )

        milestones.forEach { assertFalse(it.isReached) }
    }

    @Test
    fun calculateSavingsMilestones_allReached() {
        val milestones = GamificationEngine.calculateSavingsMilestones(
            currentAmount = Cents(10000000), // $100,000
        )

        milestones.forEach { assertTrue(it.isReached) }
    }

    // ═══════════════════════════════════════════════════════════════════
    // Level Calculation
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun calculateLevel_zeroPoints() {
        assertEquals(1, GamificationEngine.calculateLevel(0))
    }

    @Test
    fun calculateLevel_exactThreshold() {
        // Level 2 = 4 × 50 = 200 points
        assertEquals(2, GamificationEngine.calculateLevel(200))
    }

    @Test
    fun calculateLevel_betweenLevels() {
        // Level 2 = 200, Level 3 = 450
        assertEquals(2, GamificationEngine.calculateLevel(300))
    }

    @Test
    fun calculateLevel_highLevel() {
        // Level 10 = 100 × 50 = 5000
        assertEquals(10, GamificationEngine.calculateLevel(5000))
    }

    @Test
    fun pointsForLevel_level1() {
        assertEquals(50, GamificationEngine.pointsForLevel(1))
    }

    @Test
    fun pointsForLevel_level5() {
        assertEquals(1250, GamificationEngine.pointsForLevel(5))
    }

    @Test
    fun pointsToNextLevel_calculation() {
        // At 100 points → Level 1 (threshold 50), next level (2) = 200
        // So 200 - 100 = 100 points needed
        assertEquals(100, GamificationEngine.pointsToNextLevel(100))
    }

    // ═══════════════════════════════════════════════════════════════════
    // Profile Building
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun buildProfile_computesCorrectly() {
        val progress = listOf(
            AchievementProgress(Achievements.FIRST_ACCOUNT.id, 1, true, now),
            AchievementProgress(Achievements.FIRST_BUDGET.id, 1, true, now),
            AchievementProgress(Achievements.TRANSACTIONS_10.id, 15, true, now),
            AchievementProgress(Achievements.TRANSACTIONS_100.id, 15, false),
        )
        val streaks = listOf(
            Streak("daily-tracking", 5, 10, today),
        )

        val profile = GamificationEngine.buildProfile(progress, streaks)

        // 10 + 10 + 15 = 35 points
        assertEquals(35, profile.totalPoints)
        assertEquals(3, profile.achievementsUnlocked)
        assertEquals(Achievements.ALL.size, profile.achievementsTotal)
        assertEquals(1, profile.activeStreaks.size)
        assertTrue(profile.level >= 1)
    }

    @Test
    fun buildProfile_emptyProgress() {
        val profile = GamificationEngine.buildProfile(emptyList(), emptyList())

        assertEquals(0, profile.totalPoints)
        assertEquals(1, profile.level) // Minimum level
        assertEquals(0, profile.achievementsUnlocked)
        assertTrue(profile.activeStreaks.isEmpty())
    }

    // ═══════════════════════════════════════════════════════════════════
    // Type Validations
    // ═══════════════════════════════════════════════════════════════════

    @Test
    fun achievementDefinition_rejectsBlankId() {
        assertFailsWith<IllegalArgumentException> {
            AchievementDefinition(
                id = "", title = "T", description = "D", icon = "i",
                category = AchievementCategory.ONBOARDING,
                rarity = AchievementRarity.COMMON, points = 10,
            )
        }
    }

    @Test
    fun achievementDefinition_rejectsZeroPoints() {
        assertFailsWith<IllegalArgumentException> {
            AchievementDefinition(
                id = "test", title = "T", description = "D", icon = "i",
                category = AchievementCategory.ONBOARDING,
                rarity = AchievementRarity.COMMON, points = 0,
            )
        }
    }

    @Test
    fun achievementProgress_rejectsNegativeCount() {
        assertFailsWith<IllegalArgumentException> {
            AchievementProgress("test", -1, false)
        }
    }

    @Test
    fun achievementProgress_requiresUnlockedAtWhenUnlocked() {
        assertFailsWith<IllegalArgumentException> {
            AchievementProgress("test", 1, true, null)
        }
    }

    @Test
    fun streak_rejectsNegativeCount() {
        assertFailsWith<IllegalArgumentException> {
            Streak("test", -1, 0, today)
        }
    }

    @Test
    fun streak_rejectsBestLessThanCurrent() {
        assertFailsWith<IllegalArgumentException> {
            Streak("test", 5, 3, today)
        }
    }

    @Test
    fun achievementProgress_progressFraction() {
        val definition = Achievements.TRANSACTIONS_100
        val progress = AchievementProgress("test", 50, false)

        assertEquals(0.5, progress.progressFraction(definition), 0.001)
    }

    @Test
    fun achievementProgress_progressFraction_unlocked() {
        val definition = Achievements.TRANSACTIONS_10
        val progress = AchievementProgress("test", 10, true, now)

        assertEquals(1.0, progress.progressFraction(definition))
    }

    @Test
    fun allAchievements_haveUniqueIds() {
        val ids = Achievements.ALL.map { it.id }
        assertEquals(ids.size, ids.toSet().size, "Achievement IDs must be unique")
    }

    @Test
    fun allAchievements_havePositivePoints() {
        Achievements.ALL.forEach { achievement ->
            assertTrue(achievement.points > 0, "${achievement.id} must have positive points")
        }
    }
}
