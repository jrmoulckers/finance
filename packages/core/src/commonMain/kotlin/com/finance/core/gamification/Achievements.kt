// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.gamification

import com.finance.models.types.Cents

/**
 * Registry of all achievement definitions in the Finance app.
 *
 * Achievements are organized by [AchievementCategory]. Each definition
 * is a static, immutable value — the [GamificationEngine] evaluates
 * user data against these to determine unlock status.
 */
object Achievements {

    // ── Onboarding ───────────────────────────────────────────────────

    val FIRST_ACCOUNT = AchievementDefinition(
        id = "onboarding-first-account",
        title = "Getting Started",
        description = "Create your first account",
        icon = "wallet",
        category = AchievementCategory.ONBOARDING,
        rarity = AchievementRarity.COMMON,
        points = 10,
    )

    val FIRST_BUDGET = AchievementDefinition(
        id = "onboarding-first-budget",
        title = "Budget Boss",
        description = "Create your first budget",
        icon = "pie-chart",
        category = AchievementCategory.ONBOARDING,
        rarity = AchievementRarity.COMMON,
        points = 10,
    )

    val FIRST_GOAL = AchievementDefinition(
        id = "onboarding-first-goal",
        title = "Goal Setter",
        description = "Create your first savings goal",
        icon = "target",
        category = AchievementCategory.ONBOARDING,
        rarity = AchievementRarity.COMMON,
        points = 10,
    )

    // ── Tracking ─────────────────────────────────────────────────────

    val TRANSACTIONS_10 = AchievementDefinition(
        id = "tracking-transactions-10",
        title = "Tracker",
        description = "Record 10 transactions",
        icon = "list",
        category = AchievementCategory.TRACKING,
        rarity = AchievementRarity.COMMON,
        points = 15,
        targetCount = 10,
    )

    val TRANSACTIONS_100 = AchievementDefinition(
        id = "tracking-transactions-100",
        title = "Diligent Recorder",
        description = "Record 100 transactions",
        icon = "list-check",
        category = AchievementCategory.TRACKING,
        rarity = AchievementRarity.UNCOMMON,
        points = 30,
        targetCount = 100,
    )

    val TRANSACTIONS_1000 = AchievementDefinition(
        id = "tracking-transactions-1000",
        title = "Transaction Master",
        description = "Record 1,000 transactions",
        icon = "award",
        category = AchievementCategory.TRACKING,
        rarity = AchievementRarity.RARE,
        points = 75,
        targetCount = 1000,
    )

    // ── Budgeting ────────────────────────────────────────────────────

    val BUDGET_UNDER_3_MONTHS = AchievementDefinition(
        id = "budgeting-under-3-months",
        title = "Budget Keeper",
        description = "Stay under budget for 3 consecutive months",
        icon = "shield-check",
        category = AchievementCategory.BUDGETING,
        rarity = AchievementRarity.UNCOMMON,
        points = 40,
        targetCount = 3,
    )

    val BUDGET_UNDER_6_MONTHS = AchievementDefinition(
        id = "budgeting-under-6-months",
        title = "Budget Champion",
        description = "Stay under budget for 6 consecutive months",
        icon = "trophy",
        category = AchievementCategory.BUDGETING,
        rarity = AchievementRarity.RARE,
        points = 80,
        targetCount = 6,
    )

    val BUDGET_UNDER_12_MONTHS = AchievementDefinition(
        id = "budgeting-under-12-months",
        title = "Budget Legend",
        description = "Stay under budget for 12 consecutive months",
        icon = "crown",
        category = AchievementCategory.BUDGETING,
        rarity = AchievementRarity.LEGENDARY,
        points = 200,
        targetCount = 12,
    )

    // ── Saving ───────────────────────────────────────────────────────

    val SAVINGS_100 = AchievementDefinition(
        id = "saving-100",
        title = "First Hundred",
        description = "Save $100 toward any goal",
        icon = "piggy-bank",
        category = AchievementCategory.SAVING,
        rarity = AchievementRarity.COMMON,
        points = 15,
    )

    val SAVINGS_1000 = AchievementDefinition(
        id = "saving-1000",
        title = "Four-Digit Saver",
        description = "Save $1,000 toward any goal",
        icon = "trending-up",
        category = AchievementCategory.SAVING,
        rarity = AchievementRarity.UNCOMMON,
        points = 40,
    )

    val SAVINGS_10000 = AchievementDefinition(
        id = "saving-10000",
        title = "Five-Digit Saver",
        description = "Save $10,000 toward any goal",
        icon = "star",
        category = AchievementCategory.SAVING,
        rarity = AchievementRarity.RARE,
        points = 100,
    )

    val GOAL_COMPLETED = AchievementDefinition(
        id = "saving-goal-completed",
        title = "Goal Crusher",
        description = "Complete a savings goal",
        icon = "check-circle",
        category = AchievementCategory.SAVING,
        rarity = AchievementRarity.UNCOMMON,
        points = 50,
    )

    // ── Streaks ──────────────────────────────────────────────────────

    val STREAK_7_DAYS = AchievementDefinition(
        id = "streak-7-days",
        title = "Week Warrior",
        description = "Track transactions for 7 days in a row",
        icon = "flame",
        category = AchievementCategory.STREAKS,
        rarity = AchievementRarity.COMMON,
        points = 20,
        targetCount = 7,
    )

    val STREAK_30_DAYS = AchievementDefinition(
        id = "streak-30-days",
        title = "Monthly Master",
        description = "Track transactions for 30 days in a row",
        icon = "fire",
        category = AchievementCategory.STREAKS,
        rarity = AchievementRarity.UNCOMMON,
        points = 50,
        targetCount = 30,
    )

    val STREAK_90_DAYS = AchievementDefinition(
        id = "streak-90-days",
        title = "Quarterly Champion",
        description = "Track transactions for 90 days in a row",
        icon = "zap",
        category = AchievementCategory.STREAKS,
        rarity = AchievementRarity.RARE,
        points = 100,
        targetCount = 90,
    )

    val STREAK_365_DAYS = AchievementDefinition(
        id = "streak-365-days",
        title = "Year of Discipline",
        description = "Track transactions for 365 days in a row",
        icon = "medal",
        category = AchievementCategory.STREAKS,
        rarity = AchievementRarity.LEGENDARY,
        points = 500,
        targetCount = 365,
    )

    /** All defined achievements, used by the engine for evaluation. */
    val ALL: List<AchievementDefinition> = listOf(
        FIRST_ACCOUNT, FIRST_BUDGET, FIRST_GOAL,
        TRANSACTIONS_10, TRANSACTIONS_100, TRANSACTIONS_1000,
        BUDGET_UNDER_3_MONTHS, BUDGET_UNDER_6_MONTHS, BUDGET_UNDER_12_MONTHS,
        SAVINGS_100, SAVINGS_1000, SAVINGS_10000, GOAL_COMPLETED,
        STREAK_7_DAYS, STREAK_30_DAYS, STREAK_90_DAYS, STREAK_365_DAYS,
    )

    /** Savings milestone thresholds. */
    val SAVINGS_MILESTONES: List<Cents> = listOf(
        Cents(10000),   // $100
        Cents(50000),   // $500
        Cents(100000),  // $1,000
        Cents(500000),  // $5,000
        Cents(1000000), // $10,000
        Cents(5000000), // $50,000
    )
}
