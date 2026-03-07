package com.finance.core.insights

import com.finance.models.*
import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.*

/**
 * Gamification engine that calculates streaks, milestones, and achievements
 * to keep users engaged with their financial health journey.
 *
 * All date arithmetic uses [kotlinx.datetime] for multiplatform compatibility.
 */
object GamificationEngine {

    // ── Streak calculation ───────────────────────────────────────────────

    /**
     * Calculates the current and longest streak of consecutive days where
     * the user stayed under budget across **all** active budgets.
     *
     * The algorithm walks backward from [referenceDate] counting consecutive
     * days where every budget's daily spending did not exceed its daily limit.
     *
     * @param transactions All non-deleted expense transactions.
     * @param budgets Active budgets to check against.
     * @param referenceDate The "today" anchor for the streak.
     * @return A [Streak] of type [StreakType.UNDER_BUDGET].
     */
    fun calculateStreak(
        transactions: List<Transaction>,
        budgets: List<Budget>,
        referenceDate: LocalDate = Clock.System.now()
            .toLocalDateTime(TimeZone.UTC).date,
    ): Streak {
        if (budgets.isEmpty()) {
            return Streak(currentDays = 0, longestDays = 0, type = StreakType.UNDER_BUDGET)
        }

        // Pre-compute daily spending totals
        val dailySpending = buildDailySpendingMap(transactions)

        // Compute a daily budget limit: sum of (budget.amount / period days) for all budgets.
        // This is a simplification — each budget's daily allowance based on its period.
        val dailyLimit = budgets.sumOf { budget ->
            val periodDays = periodToDays(budget.period)
            if (periodDays > 0) budget.amount.amount / periodDays else budget.amount.amount
        }

        var currentStreak = 0
        var longestStreak = 0
        var counting = true
        var day = referenceDate

        // Walk backward up to 365 days max to avoid unbounded iteration.
        repeat(365) {
            val daySpend = dailySpending[day] ?: 0L
            if (daySpend <= dailyLimit) {
                if (counting) currentStreak++
                longestStreak = maxOf(longestStreak, if (counting) currentStreak else 0)
            } else {
                if (counting) counting = false
            }
            day = day.minus(1, DateTimeUnit.DAY)
        }

        // If we never broke the streak, longest = current
        longestStreak = maxOf(longestStreak, if (counting) currentStreak else longestStreak)

        return Streak(
            currentDays = currentStreak,
            longestDays = maxOf(longestStreak, currentStreak),
            type = StreakType.UNDER_BUDGET,
        )
    }

    /**
     * Calculates a daily-tracking streak: consecutive days (backward from
     * [referenceDate]) where the user logged at least one transaction.
     */
    fun calculateTrackingStreak(
        transactions: List<Transaction>,
        referenceDate: LocalDate = Clock.System.now()
            .toLocalDateTime(TimeZone.UTC).date,
    ): Streak {
        val trackedDates = transactions
            .filter { it.deletedAt == null }
            .map { it.date }
            .toSet()

        var currentStreak = 0
        var day = referenceDate

        repeat(365) {
            if (day in trackedDates) {
                currentStreak++
            } else {
                return Streak(
                    currentDays = currentStreak,
                    longestDays = currentStreak,
                    type = StreakType.DAILY_TRACKING,
                )
            }
            day = day.minus(1, DateTimeUnit.DAY)
        }

        return Streak(
            currentDays = currentStreak,
            longestDays = currentStreak,
            type = StreakType.DAILY_TRACKING,
        )
    }

    // ── Milestone checking ───────────────────────────────────────────────

    /**
     * Checks each goal against the standard milestone thresholds
     * (25%, 50%, 75%, 100%) and returns all milestones with their
     * reached status.
     *
     * @param goals Active savings goals to evaluate.
     * @return A flat list of [Milestone] entries — four per goal.
     */
    fun checkMilestones(goals: List<Goal>): List<Milestone> {
        return goals.flatMap { goal ->
            Milestone.THRESHOLDS.map { threshold ->
                val progressPercent = (goal.progress * 100).toInt()
                Milestone(
                    goalId = goal.id,
                    goalName = goal.name,
                    percent = threshold,
                    reached = progressPercent >= threshold,
                    currentAmount = goal.currentAmount,
                    targetAmount = goal.targetAmount,
                )
            }
        }
    }

    // ── Achievements ─────────────────────────────────────────────────────

    /**
     * Evaluates which achievements the user has unlocked based on
     * aggregate statistics.
     *
     * @param userStats Aggregate stats about the user's financial activity.
     * @return All achievements with [Achievement.unlockedAt] populated for earned ones.
     */
    fun getAchievements(userStats: UserStats): List<Achievement> {
        val now = userStats.evaluatedAt
        return buildList {
            add(Achievement(id = "first_transaction", title = "First Step",
                description = "Log your first transaction.", icon = "receipt",
                unlockedAt = if (userStats.totalTransactions >= 1) now else null))

            add(Achievement(id = "century_tracker", title = "Century Tracker",
                description = "Log 100 transactions.", icon = "century",
                unlockedAt = if (userStats.totalTransactions >= 100) now else null))

            add(Achievement(id = "budget_beginner", title = "Budget Beginner",
                description = "Create your first budget.", icon = "budget",
                unlockedAt = if (userStats.totalBudgets >= 1) now else null))

            add(Achievement(id = "goal_setter", title = "Goal Setter",
                description = "Create your first savings goal.", icon = "target",
                unlockedAt = if (userStats.totalGoals >= 1) now else null))

            add(Achievement(id = "goal_crusher", title = "Goal Crusher",
                description = "Complete a savings goal.", icon = "trophy",
                unlockedAt = if (userStats.completedGoals >= 1) now else null))

            add(Achievement(id = "week_warrior", title = "Week Warrior",
                description = "Stay under budget for 7 consecutive days.", icon = "streak_fire",
                unlockedAt = if (userStats.longestUnderBudgetStreak >= 7) now else null))

            add(Achievement(id = "monthly_master", title = "Monthly Master",
                description = "Stay under budget for 30 consecutive days.", icon = "streak_fire_gold",
                unlockedAt = if (userStats.longestUnderBudgetStreak >= 30) now else null))

            add(Achievement(id = "super_saver", title = "Super Saver",
                description = "Achieve a savings rate above 20%.", icon = "piggy_bank",
                unlockedAt = if (userStats.currentSavingsRate > 20.0) now else null))
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────

    /** Build a map of date → total absolute expense cents for that day. */
    private fun buildDailySpendingMap(
        transactions: List<Transaction>,
    ): Map<LocalDate, Long> = transactions
        .filter { it.type == TransactionType.EXPENSE && it.deletedAt == null }
        .groupBy { it.date }
        .mapValues { (_, txns) -> txns.sumOf { it.amount.abs().amount } }

    /** Rough day count for a budget period — used for daily limit calculation. */
    private fun periodToDays(period: BudgetPeriod): Long = when (period) {
        BudgetPeriod.WEEKLY -> 7L
        BudgetPeriod.BIWEEKLY -> 14L
        BudgetPeriod.MONTHLY -> 30L
        BudgetPeriod.QUARTERLY -> 90L
        BudgetPeriod.YEARLY -> 365L
    }
}

/**
 * Aggregate user statistics fed into [GamificationEngine.getAchievements].
 *
 * Computed by the repository / use-case layer and passed in — the engine
 * itself is stateless and deterministic.
 */
data class UserStats(
    val totalTransactions: Int,
    val totalBudgets: Int,
    val totalGoals: Int,
    val completedGoals: Int,
    val longestUnderBudgetStreak: Int,
    val currentSavingsRate: Double,
    val evaluatedAt: Instant,
)
