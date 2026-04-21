// SPDX-License-Identifier: BUSL-1.1

// GamificationService.swift
// Finance
//
// On-device gamification engine that tracks achievements, streaks,
// and milestones. State is persisted in UserDefaults (non-sensitive
// progress data). Achievement definitions are static; progress is
// computed from repository data.
//
// References: #242

import Foundation
import os

// MARK: - GamificationProviding Protocol

/// Abstraction for the gamification engine.
protocol GamificationProviding: Sendable {
    func loadProfile() -> GamificationProfile
    func evaluateAchievements(
        transactionCount: Int,
        budgetCount: Int,
        goalCount: Int,
        completedGoals: Int,
        onBudgetCount: Int,
        savingsRatePercent: Double
    ) -> GamificationProfile
    func recordActivity()
    func resetProfile()
}

// MARK: - GamificationService

/// Manages the gamification system — achievements, streaks, and points.
///
/// All data is stored in UserDefaults as non-sensitive progress metadata.
/// Achievement definitions are hard-coded; progress is evaluated against
/// current financial data from repositories.
final class GamificationService: GamificationProviding, @unchecked Sendable {

    static let shared = GamificationService()

    private static let profileKey = "gamification.profile"
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "GamificationService"
    )

    private let defaults: UserDefaults
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: - Public API

    /// Loads the current gamification profile from persistence.
    func loadProfile() -> GamificationProfile {
        guard let data = defaults.data(forKey: Self.profileKey),
              let profile = try? decoder.decode(GamificationProfile.self, from: data)
        else {
            return GamificationProfile(achievements: Self.allAchievements)
        }
        return profile
    }

    /// Evaluates achievements against current financial metrics and returns updated profile.
    func evaluateAchievements(
        transactionCount: Int,
        budgetCount: Int,
        goalCount: Int,
        completedGoals: Int,
        onBudgetCount: Int,
        savingsRatePercent: Double
    ) -> GamificationProfile {
        var profile = loadProfile()

        // Ensure all achievement definitions exist
        let existingIds = Set(profile.achievements.map(\.id))
        for achievement in Self.allAchievements where !existingIds.contains(achievement.id) {
            profile.achievements.append(achievement)
        }

        // Evaluate each achievement
        for i in profile.achievements.indices {
            let achievement = profile.achievements[i]
            guard !achievement.isUnlocked else { continue }

            let newCount: Int
            switch achievement.id {
            // Tracking achievements
            case "first_transaction": newCount = min(1, transactionCount)
            case "ten_transactions": newCount = min(10, transactionCount)
            case "hundred_transactions": newCount = min(100, transactionCount)
            case "thousand_transactions": newCount = min(1000, transactionCount)

            // Budget achievements
            case "first_budget": newCount = min(1, budgetCount)
            case "budget_keeper": newCount = min(3, onBudgetCount)
            case "budget_master": newCount = min(5, onBudgetCount)

            // Saving achievements
            case "first_goal": newCount = min(1, goalCount)
            case "goal_achiever": newCount = min(1, completedGoals)
            case "goal_crusher": newCount = min(5, completedGoals)
            case "saver_20": newCount = savingsRatePercent >= 20 ? 1 : 0
            case "saver_50": newCount = savingsRatePercent >= 50 ? 1 : 0

            // Streak achievements
            case "streak_7": newCount = min(7, profile.streak.currentDays)
            case "streak_30": newCount = min(30, profile.streak.currentDays)
            case "streak_100": newCount = min(100, profile.streak.currentDays)
            case "streak_365": newCount = min(365, profile.streak.currentDays)

            default: newCount = achievement.currentCount
            }

            profile.achievements[i].currentCount = newCount

            if newCount >= achievement.requiredCount && !achievement.isUnlocked {
                profile.achievements[i].isUnlocked = true
                profile.achievements[i].unlockedAt = Date()
                profile.totalPoints += achievement.tier.points
                Self.logger.info(
                    "Achievement unlocked: \(achievement.id, privacy: .public) (+\(achievement.tier.points, privacy: .public) pts)"
                )
            }
        }

        // Recalculate level
        profile.level = max(1, profile.totalPoints / 100 + 1)

        saveProfile(profile)
        return profile
    }

    /// Records daily activity for streak tracking.
    func recordActivity() {
        var profile = loadProfile()
        let calendar = Calendar.current
        let today = Date()

        if let lastActive = profile.streak.lastActiveDate {
            if calendar.isDateInToday(lastActive) {
                // Already active today — no change
                return
            } else if calendar.isDateInYesterday(lastActive) {
                // Consecutive day
                profile.streak.currentDays += 1
            } else {
                // Streak broken
                profile.streak.currentDays = 1
            }
        } else {
            profile.streak.currentDays = 1
        }

        profile.streak.lastActiveDate = today
        profile.streak.longestDays = max(
            profile.streak.longestDays,
            profile.streak.currentDays
        )

        saveProfile(profile)
        Self.logger.debug(
            "Activity recorded, streak: \(profile.streak.currentDays, privacy: .public) days"
        )
    }

    /// Resets the entire gamification profile.
    func resetProfile() {
        defaults.removeObject(forKey: Self.profileKey)
        Self.logger.info("Gamification profile reset")
    }

    // MARK: - Persistence

    private func saveProfile(_ profile: GamificationProfile) {
        guard let data = try? encoder.encode(profile) else { return }
        defaults.set(data, forKey: Self.profileKey)
    }

    // MARK: - Achievement Definitions

    static let allAchievements: [Achievement] = [
        // Tracking
        Achievement(
            id: "first_transaction", title: String(localized: "First Step"),
            description: String(localized: "Log your first transaction"),
            category: .tracking, tier: .bronze, systemImage: "pencil.line",
            requiredCount: 1
        ),
        Achievement(
            id: "ten_transactions", title: String(localized: "Getting Started"),
            description: String(localized: "Log 10 transactions"),
            category: .tracking, tier: .bronze, systemImage: "list.bullet",
            requiredCount: 10
        ),
        Achievement(
            id: "hundred_transactions", title: String(localized: "Committed Tracker"),
            description: String(localized: "Log 100 transactions"),
            category: .tracking, tier: .silver, systemImage: "star",
            requiredCount: 100
        ),
        Achievement(
            id: "thousand_transactions", title: String(localized: "Transaction Master"),
            description: String(localized: "Log 1,000 transactions"),
            category: .tracking, tier: .gold, systemImage: "star.fill",
            requiredCount: 1000
        ),

        // Budgeting
        Achievement(
            id: "first_budget", title: String(localized: "Budget Beginner"),
            description: String(localized: "Create your first budget"),
            category: .budgeting, tier: .bronze, systemImage: "chart.pie",
            requiredCount: 1
        ),
        Achievement(
            id: "budget_keeper", title: String(localized: "Budget Keeper"),
            description: String(localized: "Stay within budget for 3 categories"),
            category: .budgeting, tier: .silver, systemImage: "checkmark.shield",
            requiredCount: 3
        ),
        Achievement(
            id: "budget_master", title: String(localized: "Budget Master"),
            description: String(localized: "Stay within budget for 5 categories"),
            category: .budgeting, tier: .gold, systemImage: "crown",
            requiredCount: 5
        ),

        // Saving
        Achievement(
            id: "first_goal", title: String(localized: "Goal Setter"),
            description: String(localized: "Create your first savings goal"),
            category: .saving, tier: .bronze, systemImage: "target",
            requiredCount: 1
        ),
        Achievement(
            id: "goal_achiever", title: String(localized: "Goal Achiever"),
            description: String(localized: "Complete your first savings goal"),
            category: .saving, tier: .silver, systemImage: "checkmark.circle",
            requiredCount: 1
        ),
        Achievement(
            id: "goal_crusher", title: String(localized: "Goal Crusher"),
            description: String(localized: "Complete 5 savings goals"),
            category: .saving, tier: .gold, systemImage: "trophy",
            requiredCount: 5
        ),
        Achievement(
            id: "saver_20", title: String(localized: "Smart Saver"),
            description: String(localized: "Achieve a 20% savings rate"),
            category: .saving, tier: .silver, systemImage: "leaf",
            requiredCount: 1
        ),
        Achievement(
            id: "saver_50", title: String(localized: "Super Saver"),
            description: String(localized: "Achieve a 50% savings rate"),
            category: .saving, tier: .platinum, systemImage: "leaf.fill",
            requiredCount: 1
        ),

        // Streaks
        Achievement(
            id: "streak_7", title: String(localized: "Week Warrior"),
            description: String(localized: "7-day activity streak"),
            category: .streaks, tier: .bronze, systemImage: "flame",
            requiredCount: 7
        ),
        Achievement(
            id: "streak_30", title: String(localized: "Monthly Master"),
            description: String(localized: "30-day activity streak"),
            category: .streaks, tier: .silver, systemImage: "flame.fill",
            requiredCount: 30
        ),
        Achievement(
            id: "streak_100", title: String(localized: "Century Club"),
            description: String(localized: "100-day activity streak"),
            category: .streaks, tier: .gold, systemImage: "100.circle",
            requiredCount: 100
        ),
        Achievement(
            id: "streak_365", title: String(localized: "Year of Discipline"),
            description: String(localized: "365-day activity streak"),
            category: .streaks, tier: .platinum, systemImage: "calendar.badge.checkmark",
            requiredCount: 365
        ),
    ]
}
