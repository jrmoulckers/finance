// SPDX-License-Identifier: BUSL-1.1

// GamificationViewModel.swift
// Finance
//
// ViewModel for the Achievements/Gamification screen. Evaluates
// achievements against current financial data and exposes profile
// state for the view layer.
//
// Uses @Observable and structured concurrency.
//
// References: #242

import Observation
import os
import SwiftUI

@Observable
final class GamificationViewModel {
    private let gamificationService: GamificationProviding
    private let transactionRepository: TransactionRepository
    private let budgetRepository: BudgetRepository
    private let goalRepository: GoalRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "GamificationViewModel"
    )

    // MARK: - Published State

    var profile: GamificationProfile = GamificationProfile()
    var isLoading = false
    var errorMessage: String?
    var selectedCategory: AchievementCategory?
    var showUnlockAnimation = false
    var newlyUnlocked: Achievement?

    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    /// Filtered achievements based on selected category.
    var filteredAchievements: [Achievement] {
        guard let category = selectedCategory else {
            return profile.achievements
        }
        return profile.achievements.filter { $0.category == category }
    }

    /// Achievement completion percentage.
    var completionPercent: Double {
        guard !profile.achievements.isEmpty else { return 0 }
        return Double(profile.unlockedAchievements.count) / Double(profile.achievements.count) * 100
    }

    // MARK: - Init

    init(
        gamificationService: GamificationProviding = GamificationService.shared,
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions,
        budgetRepository: BudgetRepository = RepositoryProvider.shared.budgets,
        goalRepository: GoalRepository = RepositoryProvider.shared.goals
    ) {
        self.gamificationService = gamificationService
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        self.goalRepository = goalRepository
    }

    // MARK: - Data Loading

    func loadProfile() async {
        isLoading = true
        defer { isLoading = false }

        // Record daily activity
        gamificationService.recordActivity()

        do {
            async let transactions = transactionRepository.getTransactions()
            async let budgets = budgetRepository.getBudgets()
            async let goals = goalRepository.getGoals()

            let (txns, budgetList, goalList) = try await (transactions, budgets, goals)

            let previousUnlocked = Set(profile.unlockedAchievements.map(\.id))

            profile = gamificationService.evaluateAchievements(
                transactionCount: txns.count,
                budgetCount: budgetList.count,
                goalCount: goalList.count,
                completedGoals: goalList.filter { $0.isComplete }.count,
                onBudgetCount: budgetList.filter { $0.progress < 1.0 }.count,
                savingsRatePercent: computeSavingsRate(transactions: txns)
            )

            // Check for newly unlocked achievements
            let newUnlocked = profile.unlockedAchievements.filter {
                !previousUnlocked.contains($0.id)
            }
            if let first = newUnlocked.first {
                newlyUnlocked = first
                showUnlockAnimation = true
            }

            Self.logger.debug(
                "Profile loaded: level \(self.profile.level, privacy: .public), \(self.profile.totalPoints, privacy: .public) pts, \(self.profile.unlockedAchievements.count, privacy: .public) unlocked"
            )
        } catch {
            errorMessage = String(localized: "Failed to load achievements.")
            Self.logger.error("Gamification load failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Helpers

    private func computeSavingsRate(transactions: [TransactionItem]) -> Double {
        let calendar = Calendar.current
        let now = Date()
        let thisMonth = transactions.filter {
            calendar.isDate($0.date, equalTo: now, toGranularity: .month)
        }

        let income = thisMonth.filter { $0.type == .income }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
        let spending = thisMonth.filter { $0.type == .expense }
            .reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }

        guard income > 0 else { return 0 }
        return Double(income - spending) / Double(income) * 100
    }
}
