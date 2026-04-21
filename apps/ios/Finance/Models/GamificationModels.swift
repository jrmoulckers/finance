// SPDX-License-Identifier: BUSL-1.1

// GamificationModels.swift
// Finance
//
// Data models for the gamification system — achievements, badges,
// streaks, milestones, and progress tracking.
//
// References: #242

import SwiftUI

// MARK: - Achievement Category

/// Broad grouping for achievements.
enum AchievementCategory: String, CaseIterable, Sendable, Codable {
    case tracking
    case budgeting
    case saving
    case streaks
    case milestones

    var displayName: String {
        switch self {
        case .tracking: String(localized: "Tracking")
        case .budgeting: String(localized: "Budgeting")
        case .saving: String(localized: "Saving")
        case .streaks: String(localized: "Streaks")
        case .milestones: String(localized: "Milestones")
        }
    }

    var systemImage: String {
        switch self {
        case .tracking: "list.bullet.clipboard"
        case .budgeting: "chart.pie"
        case .saving: "leaf"
        case .streaks: "flame"
        case .milestones: "flag.checkered"
        }
    }

    var color: Color {
        switch self {
        case .tracking: FinanceColors.interactive
        case .budgeting: Color(hex: "#805AD5") ?? .purple
        case .saving: FinanceColors.statusPositive
        case .streaks: FinanceColors.statusWarning
        case .milestones: Color(hex: "#DD6B20") ?? .orange
        }
    }
}

// MARK: - Achievement Tier

/// Rarity/difficulty tier for achievements.
enum AchievementTier: String, CaseIterable, Sendable, Codable {
    case bronze
    case silver
    case gold
    case platinum

    var displayName: String {
        switch self {
        case .bronze: String(localized: "Bronze")
        case .silver: String(localized: "Silver")
        case .gold: String(localized: "Gold")
        case .platinum: String(localized: "Platinum")
        }
    }

    var color: Color {
        switch self {
        case .bronze: Color(hex: "#CD7F32") ?? .brown
        case .silver: Color(hex: "#C0C0C0") ?? .gray
        case .gold: Color(hex: "#FFD700") ?? .yellow
        case .platinum: Color(hex: "#E5E4E2") ?? .white
        }
    }

    var points: Int {
        switch self {
        case .bronze: 10
        case .silver: 25
        case .gold: 50
        case .platinum: 100
        }
    }
}

// MARK: - Achievement

/// A single unlockable achievement/badge.
struct Achievement: Identifiable, Sendable, Codable {
    let id: String
    let title: String
    let description: String
    let category: AchievementCategory
    let tier: AchievementTier
    let systemImage: String
    let requiredCount: Int
    var currentCount: Int
    var isUnlocked: Bool
    var unlockedAt: Date?

    /// Progress toward unlocking (0.0–1.0).
    var progress: Double {
        guard requiredCount > 0 else { return isUnlocked ? 1.0 : 0.0 }
        return min(1.0, Double(currentCount) / Double(requiredCount))
    }

    init(
        id: String,
        title: String,
        description: String,
        category: AchievementCategory,
        tier: AchievementTier,
        systemImage: String,
        requiredCount: Int,
        currentCount: Int = 0,
        isUnlocked: Bool = false,
        unlockedAt: Date? = nil
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.category = category
        self.tier = tier
        self.systemImage = systemImage
        self.requiredCount = requiredCount
        self.currentCount = currentCount
        self.isUnlocked = isUnlocked
        self.unlockedAt = unlockedAt
    }
}

// MARK: - Streak

/// Tracks consecutive-day activity.
struct ActivityStreak: Sendable, Codable {
    var currentDays: Int
    var longestDays: Int
    var lastActiveDate: Date?

    var isActiveToday: Bool {
        guard let last = lastActiveDate else { return false }
        return Calendar.current.isDateInToday(last)
    }

    init(currentDays: Int = 0, longestDays: Int = 0, lastActiveDate: Date? = nil) {
        self.currentDays = currentDays
        self.longestDays = longestDays
        self.lastActiveDate = lastActiveDate
    }
}

// MARK: - Gamification Profile

/// Aggregate gamification state for a user.
struct GamificationProfile: Sendable, Codable {
    var totalPoints: Int
    var level: Int
    var achievements: [Achievement]
    var streak: ActivityStreak

    /// Points needed for next level.
    var pointsForNextLevel: Int { (level + 1) * 100 }

    /// Progress toward the next level (0.0–1.0).
    var levelProgress: Double {
        let threshold = pointsForNextLevel
        guard threshold > 0 else { return 0 }
        let pointsInLevel = totalPoints - (level * 100)
        return min(1.0, Double(pointsInLevel) / Double(100))
    }

    /// Achievements that have been unlocked.
    var unlockedAchievements: [Achievement] {
        achievements.filter(\.isUnlocked)
    }

    /// Achievements still locked.
    var lockedAchievements: [Achievement] {
        achievements.filter { !$0.isUnlocked }
    }

    init(
        totalPoints: Int = 0,
        level: Int = 1,
        achievements: [Achievement] = [],
        streak: ActivityStreak = ActivityStreak()
    ) {
        self.totalPoints = totalPoints
        self.level = level
        self.achievements = achievements
        self.streak = streak
    }
}
