package com.finance.core.insights

import com.finance.core.TestFixtures
import com.finance.models.*
import com.finance.models.types.*
import kotlinx.datetime.*
import kotlin.test.*

class GamificationEngineTest {

    @Test
    fun calculateStreak_noBudgets_returnsZeroStreak() {
        val streak = GamificationEngine.calculateStreak(emptyList(), emptyList(), LocalDate(2024, 6, 15))
        assertEquals(0, streak.currentDays)
        assertEquals(0, streak.longestDays)
        assertEquals(StreakType.UNDER_BUDGET, streak.type)
    }

    @Test
    fun calculateStreak_noTransactions_maxStreak() {
        val budget = TestFixtures.createBudget(amount = Cents(50000), period = BudgetPeriod.MONTHLY)
        val streak = GamificationEngine.calculateStreak(emptyList(), listOf(budget), LocalDate(2024, 6, 15))
        assertTrue(streak.currentDays > 0)
        assertEquals(StreakType.UNDER_BUDGET, streak.type)
    }

    @Test
    fun calculateStreak_consistentUnderBudget_countsConsecutiveDays() {
        val budget = TestFixtures.createBudget(amount = Cents(30000), period = BudgetPeriod.MONTHLY)
        val transactions = (1..10).map { day -> TestFixtures.createExpense(amount = Cents(500), date = LocalDate(2024, 6, day)) }
        val streak = GamificationEngine.calculateStreak(transactions, listOf(budget), LocalDate(2024, 6, 10))
        assertTrue(streak.currentDays >= 10)
        assertEquals(StreakType.UNDER_BUDGET, streak.type)
    }

    @Test
    fun calculateStreak_overBudgetDayBreaksStreak() {
        val budget = TestFixtures.createBudget(amount = Cents(30000), period = BudgetPeriod.MONTHLY)
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(500), date = LocalDate(2024, 6, 8)),
            TestFixtures.createExpense(amount = Cents(500), date = LocalDate(2024, 6, 9)),
            TestFixtures.createExpense(amount = Cents(500), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(50000), date = LocalDate(2024, 6, 7)),
        )
        val streak = GamificationEngine.calculateStreak(transactions, listOf(budget), LocalDate(2024, 6, 10))
        assertEquals(3, streak.currentDays)
    }

    @Test
    fun trackingStreak_noTransactions_returnsZero() {
        val streak = GamificationEngine.calculateTrackingStreak(emptyList(), LocalDate(2024, 6, 15))
        assertEquals(0, streak.currentDays)
        assertEquals(StreakType.DAILY_TRACKING, streak.type)
    }

    @Test
    fun trackingStreak_consecutiveDays_countsCorrectly() {
        val transactions = (10..15).map { day -> TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, day)) }
        val streak = GamificationEngine.calculateTrackingStreak(transactions, LocalDate(2024, 6, 15))
        assertEquals(6, streak.currentDays)
    }

    @Test
    fun trackingStreak_gapBreaksStreak() {
        val transactions = listOf(
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 10)),
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 12)),
            TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 13)),
        )
        val streak = GamificationEngine.calculateTrackingStreak(transactions, LocalDate(2024, 6, 13))
        assertEquals(2, streak.currentDays)
    }

    @Test
    fun trackingStreak_deletedTransactionsIgnored() {
        val transactions = listOf(TestFixtures.createExpense(amount = Cents(1000), date = LocalDate(2024, 6, 15), deletedAt = TestFixtures.fixedInstant))
        val streak = GamificationEngine.calculateTrackingStreak(transactions, LocalDate(2024, 6, 15))
        assertEquals(0, streak.currentDays)
    }

    @Test fun checkMilestones_emptyGoals_returnsEmptyList() { assertTrue(GamificationEngine.checkMilestones(emptyList()).isEmpty()) }

    @Test
    fun checkMilestones_goalAt50Percent_firstTwoMilestonesReached() {
        val goal = Goal(id = SyncId("goal-1"), householdId = SyncId("household-1"), name = "Emergency Fund",
            targetAmount = Cents(1000000), currentAmount = Cents(500000), currency = Currency.USD,
            status = GoalStatus.ACTIVE, createdAt = Instant.parse("2024-01-01T00:00:00Z"), updatedAt = Instant.parse("2024-06-15T00:00:00Z"))
        val milestones = GamificationEngine.checkMilestones(listOf(goal))
        assertEquals(4, milestones.size)
        assertEquals(listOf(25, 50), milestones.filter { it.reached }.map { it.percent })
        assertEquals(listOf(75, 100), milestones.filter { !it.reached }.map { it.percent })
    }

    @Test
    fun checkMilestones_goalAt100Percent_allMilestonesReached() {
        val goal = Goal(id = SyncId("goal-2"), householdId = SyncId("household-1"), name = "Vacation",
            targetAmount = Cents(200000), currentAmount = Cents(200000), currency = Currency.USD,
            status = GoalStatus.COMPLETED, createdAt = Instant.parse("2024-01-01T00:00:00Z"), updatedAt = Instant.parse("2024-06-15T00:00:00Z"))
        assertTrue(GamificationEngine.checkMilestones(listOf(goal)).all { it.reached })
    }

    @Test
    fun checkMilestones_goalAtZero_noMilestonesReached() {
        val goal = Goal(id = SyncId("goal-3"), householdId = SyncId("household-1"), name = "New Car",
            targetAmount = Cents(3000000), currentAmount = Cents.ZERO, currency = Currency.USD,
            status = GoalStatus.ACTIVE, createdAt = Instant.parse("2024-01-01T00:00:00Z"), updatedAt = Instant.parse("2024-06-15T00:00:00Z"))
        assertTrue(GamificationEngine.checkMilestones(listOf(goal)).none { it.reached })
    }

    @Test
    fun checkMilestones_multipleGoals_returnsFourMilestonesEach() {
        val goals = listOf(
            Goal(id = SyncId("g1"), householdId = SyncId("h1"), name = "Goal A", targetAmount = Cents(10000),
                currentAmount = Cents(5000), currency = Currency.USD, status = GoalStatus.ACTIVE,
                createdAt = Instant.parse("2024-01-01T00:00:00Z"), updatedAt = Instant.parse("2024-06-15T00:00:00Z")),
            Goal(id = SyncId("g2"), householdId = SyncId("h1"), name = "Goal B", targetAmount = Cents(20000),
                currentAmount = Cents(20000), currency = Currency.USD, status = GoalStatus.COMPLETED,
                createdAt = Instant.parse("2024-01-01T00:00:00Z"), updatedAt = Instant.parse("2024-06-15T00:00:00Z")),
        )
        assertEquals(8, GamificationEngine.checkMilestones(goals).size)
    }

    @Test
    fun getAchievements_zeroStats_noneUnlocked() {
        val stats = UserStats(totalTransactions = 0, totalBudgets = 0, totalGoals = 0, completedGoals = 0,
            longestUnderBudgetStreak = 0, currentSavingsRate = 0.0, evaluatedAt = Instant.parse("2024-06-15T12:00:00Z"))
        val achievements = GamificationEngine.getAchievements(stats)
        assertTrue(achievements.isNotEmpty())
        assertTrue(achievements.none { it.isUnlocked })
    }

    @Test
    fun getAchievements_firstTransaction_unlocksFirstStep() {
        val stats = UserStats(totalTransactions = 1, totalBudgets = 0, totalGoals = 0, completedGoals = 0,
            longestUnderBudgetStreak = 0, currentSavingsRate = 0.0, evaluatedAt = Instant.parse("2024-06-15T12:00:00Z"))
        val firstStep = GamificationEngine.getAchievements(stats).first { it.id == "first_transaction" }
        assertTrue(firstStep.isUnlocked)
        assertNotNull(firstStep.unlockedAt)
    }

    @Test
    fun getAchievements_allCriteriaMet_allUnlocked() {
        val stats = UserStats(totalTransactions = 150, totalBudgets = 3, totalGoals = 2, completedGoals = 1,
            longestUnderBudgetStreak = 45, currentSavingsRate = 25.0, evaluatedAt = Instant.parse("2024-06-15T12:00:00Z"))
        assertTrue(GamificationEngine.getAchievements(stats).all { it.isUnlocked })
    }

    @Test
    fun getAchievements_weekStreak_unlocksWeekWarrior() {
        val stats = UserStats(totalTransactions = 10, totalBudgets = 1, totalGoals = 0, completedGoals = 0,
            longestUnderBudgetStreak = 7, currentSavingsRate = 10.0, evaluatedAt = Instant.parse("2024-06-15T12:00:00Z"))
        val achievements = GamificationEngine.getAchievements(stats)
        assertTrue(achievements.first { it.id == "week_warrior" }.isUnlocked)
        assertFalse(achievements.first { it.id == "monthly_master" }.isUnlocked)
    }

    @Test
    fun getAchievements_savingsRateExactly20_doesNotUnlockSuperSaver() {
        val stats = UserStats(totalTransactions = 10, totalBudgets = 1, totalGoals = 0, completedGoals = 0,
            longestUnderBudgetStreak = 0, currentSavingsRate = 20.0, evaluatedAt = Instant.parse("2024-06-15T12:00:00Z"))
        assertFalse(GamificationEngine.getAchievements(stats).first { it.id == "super_saver" }.isUnlocked)
    }

    @Test fun streak_negativeCurrentDays_throws() { assertFailsWith<IllegalArgumentException> { Streak(currentDays = -1, longestDays = 0, type = StreakType.UNDER_BUDGET) } }
    @Test fun streak_longestLessThanCurrent_throws() { assertFailsWith<IllegalArgumentException> { Streak(currentDays = 10, longestDays = 5, type = StreakType.UNDER_BUDGET) } }
    @Test fun milestone_invalidPercent_throws() { assertFailsWith<IllegalArgumentException> { Milestone(goalId = SyncId("g1"), goalName = "Test", percent = 33, reached = false, currentAmount = Cents.ZERO, targetAmount = Cents(10000)) } }
}
