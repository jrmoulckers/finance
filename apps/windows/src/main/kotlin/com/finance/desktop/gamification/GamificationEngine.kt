// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.gamification

import com.finance.models.Transaction
import com.finance.models.TransactionType
import com.finance.models.Budget
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime

// ── Achievement definitions ──────────────────────────────────────────

/**
 * Badge category for visual grouping.
 */
enum class BadgeCategory { TRACKING, BUDGETING, SAVING, MILESTONE, STREAK }

/**
 * An achievement badge that the user can earn.
 */
data class Achievement(
    val id: String,
    val name: String,
    val description: String,
    val icon: String,
    val category: BadgeCategory,
    val isUnlocked: Boolean,
    val progress: Float = if (isUnlocked) 1f else 0f,
    val unlockedDate: LocalDate? = null,
    val xpReward: Int = 10,
)

/**
 * User level and XP progress.
 */
data class UserLevel(
    val level: Int,
    val currentXp: Int,
    val xpForNextLevel: Int,
    val title: String,
) {
    val progress: Float get() = if (xpForNextLevel > 0) {
        currentXp.toFloat() / xpForNextLevel
    } else 1f
}

/**
 * Streak tracking for consecutive days/actions.
 */
data class StreakInfo(
    val type: String,
    val currentStreak: Int,
    val longestStreak: Int,
    val isActiveToday: Boolean,
)

/**
 * Full gamification state.
 */
data class GamificationState(
    val userLevel: UserLevel,
    val achievements: List<Achievement>,
    val streaks: List<StreakInfo>,
    val totalXp: Int,
    val recentUnlocks: List<Achievement>,
)

// ── Engine ────────────────────────────────────────────────────────────

/**
 * Pure-logic gamification engine.
 *
 * Evaluates transaction history, budget performance, and user activity
 * to compute achievements, streaks, and level progression. Stateless —
 * all data is provided as parameters.
 *
 * In a future iteration, consume a KMP shared gamification engine from
 * `packages/core/gamification/` when available.
 */
object GamificationEngine {

    private val levelTitles = listOf(
        "Beginner", "Tracker", "Budgeteer", "Saver",
        "Planner", "Strategist", "Expert", "Master",
        "Guru", "Legend",
    )

    /**
     * Compute the full gamification state from user data.
     */
    fun evaluate(
        transactions: List<Transaction>,
        budgets: List<Budget>,
        today: LocalDate = Clock.System.now()
            .toLocalDateTime(TimeZone.currentSystemDefault()).date,
    ): GamificationState {
        val achievements = evaluateAchievements(transactions, budgets, today)
        val streaks = evaluateStreaks(transactions, today)
        val totalXp = achievements.filter { it.isUnlocked }.sumOf { it.xpReward }
        val level = computeLevel(totalXp)
        val recentUnlocks = achievements.filter {
            it.isUnlocked && it.unlockedDate != null &&
                it.unlockedDate >= today.minus(7, DateTimeUnit.DAY)
        }

        return GamificationState(
            userLevel = level,
            achievements = achievements,
            streaks = streaks,
            totalXp = totalXp,
            recentUnlocks = recentUnlocks,
        )
    }

    @Suppress("LongMethod") // Score calculation with many rule evaluations
    private fun evaluateAchievements(
        transactions: List<Transaction>,
        budgets: List<Budget>,
        today: LocalDate,
    ): List<Achievement> {
        val achievements = mutableListOf<Achievement>()
        val expenses = transactions.filter { it.type == TransactionType.EXPENSE }

        // ── Tracking achievements ──
        achievements.add(
            Achievement(
                id = "first-transaction",
                name = "First Steps",
                description = "Log your first transaction",
                icon = "🎯",
                category = BadgeCategory.TRACKING,
                isUnlocked = transactions.isNotEmpty(),
                unlockedDate = transactions.minByOrNull { it.date }?.date,
                xpReward = 10,
            ),
        )

        achievements.add(
            Achievement(
                id = "ten-transactions",
                name = "Getting Started",
                description = "Log 10 transactions",
                icon = "📝",
                category = BadgeCategory.TRACKING,
                isUnlocked = transactions.size >= 10,
                progress = (transactions.size.toFloat() / 10).coerceAtMost(1f),
                xpReward = 25,
            ),
        )

        achievements.add(
            Achievement(
                id = "fifty-transactions",
                name = "Dedicated Tracker",
                description = "Log 50 transactions",
                icon = "📊",
                category = BadgeCategory.TRACKING,
                isUnlocked = transactions.size >= 50,
                progress = (transactions.size.toFloat() / 50).coerceAtMost(1f),
                xpReward = 50,
            ),
        )

        achievements.add(
            Achievement(
                id = "hundred-transactions",
                name = "Century Club",
                description = "Log 100 transactions",
                icon = "💯",
                category = BadgeCategory.MILESTONE,
                isUnlocked = transactions.size >= 100,
                progress = (transactions.size.toFloat() / 100).coerceAtMost(1f),
                xpReward = 100,
            ),
        )

        // ── Budgeting achievements ──
        achievements.add(
            Achievement(
                id = "first-budget",
                name = "Budget Beginner",
                description = "Create your first budget",
                icon = "💰",
                category = BadgeCategory.BUDGETING,
                isUnlocked = budgets.isNotEmpty(),
                xpReward = 15,
            ),
        )

        val healthyBudgets = budgets.count { budget ->
            val catTxns = transactions.filter { it.categoryId == budget.categoryId }
            val status = BudgetCalculator.calculateStatus(budget, catTxns, today)
            status.healthLevel == BudgetHealth.HEALTHY
        }

        achievements.add(
            Achievement(
                id = "all-budgets-healthy",
                name = "Budget Master",
                description = "Keep all budgets in healthy status",
                icon = "🏆",
                category = BadgeCategory.BUDGETING,
                isUnlocked = budgets.isNotEmpty() && healthyBudgets == budgets.size,
                progress = if (budgets.isNotEmpty()) healthyBudgets.toFloat() / budgets.size else 0f,
                xpReward = 75,
            ),
        )

        // ── Saving achievements ──
        val incomeThisMonth = transactions.filter {
            it.type == TransactionType.INCOME &&
                it.date.month == today.month && it.date.year == today.year
        }.sumOf { it.amount.abs().amount }

        val expenseThisMonth = expenses.filter {
            it.date.month == today.month && it.date.year == today.year
        }.sumOf { it.amount.abs().amount }

        val savingsRate = if (incomeThisMonth > 0) {
            ((incomeThisMonth - expenseThisMonth).toFloat() / incomeThisMonth)
        } else 0f

        achievements.add(
            Achievement(
                id = "saver-10pct",
                name = "Saver",
                description = "Save at least 10% of monthly income",
                icon = "🐖",
                category = BadgeCategory.SAVING,
                isUnlocked = savingsRate >= 0.10f,
                progress = (savingsRate / 0.10f).coerceAtMost(1f),
                xpReward = 30,
            ),
        )

        achievements.add(
            Achievement(
                id = "saver-20pct",
                name = "Super Saver",
                description = "Save at least 20% of monthly income",
                icon = "🌟",
                category = BadgeCategory.SAVING,
                isUnlocked = savingsRate >= 0.20f,
                progress = (savingsRate / 0.20f).coerceAtMost(1f),
                xpReward = 60,
            ),
        )

        // ── Streak achievements ──
        val streaks = evaluateStreaks(transactions, today)
        val trackingStreak = streaks.find { it.type == "Daily Tracking" }

        achievements.add(
            Achievement(
                id = "streak-7",
                name = "Week Warrior",
                description = "Track expenses 7 days in a row",
                icon = "🔥",
                category = BadgeCategory.STREAK,
                isUnlocked = (trackingStreak?.longestStreak ?: 0) >= 7,
                progress = ((trackingStreak?.longestStreak ?: 0).toFloat() / 7).coerceAtMost(1f),
                xpReward = 40,
            ),
        )

        achievements.add(
            Achievement(
                id = "streak-30",
                name = "Monthly Champion",
                description = "Track expenses 30 days in a row",
                icon = "⭐",
                category = BadgeCategory.STREAK,
                isUnlocked = (trackingStreak?.longestStreak ?: 0) >= 30,
                progress = ((trackingStreak?.longestStreak ?: 0).toFloat() / 30).coerceAtMost(1f),
                xpReward = 100,
            ),
        )

        return achievements
    }

    private fun evaluateStreaks(
        transactions: List<Transaction>,
        today: LocalDate,
    ): List<StreakInfo> {
        // Daily tracking streak
        val txnDates = transactions
            .filter { it.type == TransactionType.EXPENSE }
            .map { it.date }
            .distinct()
            .sorted()

        var currentStreak = 0
        var longestStreak = 0
        var tempStreak = 0
        var lastDate: LocalDate? = null

        for (date in txnDates) {
            if (lastDate != null && date.toEpochDays() - lastDate.toEpochDays() == 1) {
                tempStreak++
            } else {
                tempStreak = 1
            }
            longestStreak = maxOf(longestStreak, tempStreak)
            lastDate = date
        }

        // Check if today is part of the current streak
        val isActiveToday = txnDates.contains(today)
        currentStreak = if (isActiveToday || txnDates.contains(today.minus(1, DateTimeUnit.DAY))) {
            var streak = 0
            var checkDate = if (isActiveToday) today else today.minus(1, DateTimeUnit.DAY)
            while (txnDates.contains(checkDate)) {
                streak++
                checkDate = checkDate.minus(1, DateTimeUnit.DAY)
            }
            streak
        } else 0

        // Budget adherence streak (weeks staying under budget)
        val budgetStreakWeeks = 0 // Simplified - would need budget history

        return listOf(
            StreakInfo(
                type = "Daily Tracking",
                currentStreak = currentStreak,
                longestStreak = longestStreak,
                isActiveToday = isActiveToday,
            ),
            StreakInfo(
                type = "Budget Adherence",
                currentStreak = budgetStreakWeeks,
                longestStreak = budgetStreakWeeks,
                isActiveToday = true,
            ),
        )
    }

    private fun computeLevel(totalXp: Int): UserLevel {
        // Each level requires progressively more XP
        var xpRemaining = totalXp
        var level = 1
        var xpForLevel = 50

        while (xpRemaining >= xpForLevel && level < levelTitles.size) {
            xpRemaining -= xpForLevel
            level++
            xpForLevel = 50 + (level - 1) * 25
        }

        val title = levelTitles.getOrElse(level - 1) { "Legend" }

        return UserLevel(
            level = level,
            currentXp = xpRemaining,
            xpForNextLevel = xpForLevel,
            title = title,
        )
    }
}
