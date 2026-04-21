// SPDX-License-Identifier: BUSL-1.1

// GamificationViewModelTests.swift
// FinanceTests
//
// Unit tests for GamificationViewModel and GamificationService.
//
// References: #242

import Foundation
import SwiftUI
import Testing
@testable import FinanceApp

// MARK: - Stub Gamification Service

final class StubGamificationService: GamificationProviding, @unchecked Sendable {
    var profileToReturn = GamificationProfile(achievements: GamificationService.allAchievements)
    var activityRecorded = false
    var resetCalled = false

    func loadProfile() -> GamificationProfile {
        profileToReturn
    }

    func evaluateAchievements(
        transactionCount: Int,
        budgetCount: Int,
        goalCount: Int,
        completedGoals: Int,
        onBudgetCount: Int,
        savingsRatePercent: Double
    ) -> GamificationProfile {
        // Simulate unlocking first_transaction when count >= 1
        var profile = profileToReturn
        if transactionCount >= 1 {
            if let idx = profile.achievements.firstIndex(where: { $0.id == "first_transaction" }) {
                profile.achievements[idx].isUnlocked = true
                profile.achievements[idx].unlockedAt = Date()
                profile.achievements[idx].currentCount = 1
                profile.totalPoints += profile.achievements[idx].tier.points
            }
        }
        return profile
    }

    func recordActivity() {
        activityRecorded = true
    }

    func resetProfile() {
        resetCalled = true
    }
}

// MARK: - GamificationViewModel Tests

@Suite("GamificationViewModel Tests")
struct GamificationViewModelTests {

    @Test("Loads profile and records activity")
    @MainActor
    func loadsProfile() async {
        let service = StubGamificationService()
        let vm = GamificationViewModel(
            gamificationService: service,
            transactionRepository: StubTransactionRepository(),
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository()
        )

        await vm.loadProfile()

        #expect(service.activityRecorded)
        #expect(!vm.isLoading)
    }

    @Test("Detects newly unlocked achievement")
    @MainActor
    func detectsNewUnlock() async {
        let service = StubGamificationService()
        let txnRepo = StubTransactionRepository()
        txnRepo.transactionsToReturn = [SampleData.expenseTransaction]

        let vm = GamificationViewModel(
            gamificationService: service,
            transactionRepository: txnRepo,
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository()
        )

        await vm.loadProfile()

        #expect(vm.profile.unlockedAchievements.contains { $0.id == "first_transaction" })
    }

    @Test("Filters by category")
    @MainActor
    func filtersByCategory() async {
        let service = StubGamificationService()
        let vm = GamificationViewModel(
            gamificationService: service,
            transactionRepository: StubTransactionRepository(),
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository()
        )

        await vm.loadProfile()

        vm.selectedCategory = nil
        #expect(vm.filteredAchievements.count == vm.profile.achievements.count)

        vm.selectedCategory = .tracking
        #expect(vm.filteredAchievements.allSatisfy { $0.category == .tracking })
    }

    @Test("Handles repository errors gracefully")
    @MainActor
    func handlesErrors() async {
        let service = StubGamificationService()
        let repo = StubTransactionRepository()
        repo.errorToThrow = TestError.simulated

        let vm = GamificationViewModel(
            gamificationService: service,
            transactionRepository: repo,
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository()
        )

        await vm.loadProfile()

        #expect(vm.errorMessage != nil)
    }

    @Test("Calculates completion percentage")
    @MainActor
    func completionPercent() async {
        let service = StubGamificationService()
        var profile = GamificationProfile(achievements: [
            Achievement(id: "a", title: "A", description: "A", category: .tracking,
                       tier: .bronze, systemImage: "star", requiredCount: 1,
                       currentCount: 1, isUnlocked: true),
            Achievement(id: "b", title: "B", description: "B", category: .tracking,
                       tier: .bronze, systemImage: "star", requiredCount: 10),
        ])
        service.profileToReturn = profile

        let vm = GamificationViewModel(
            gamificationService: service,
            transactionRepository: StubTransactionRepository(),
            budgetRepository: StubBudgetRepository(),
            goalRepository: StubGoalRepository()
        )

        await vm.loadProfile()

        // After evaluation, first_transaction might be unlocked too
        // but we know at least 'a' is unlocked out of total
        #expect(vm.completionPercent > 0)
    }
}

// MARK: - GamificationService Tests

@Suite("GamificationService Tests")
struct GamificationServiceTests {

    @Test("Records activity and starts streak")
    func recordsActivity() {
        let defaults = UserDefaults(suiteName: "test.gamification.streak")!
        defer { defaults.removePersistentDomain(forName: "test.gamification.streak") }
        let service = GamificationService(defaults: defaults)

        service.recordActivity()
        let profile = service.loadProfile()

        #expect(profile.streak.currentDays == 1)
        #expect(profile.streak.isActiveToday)
    }

    @Test("Evaluates and unlocks first transaction achievement")
    func unlocksFirstTransaction() {
        let defaults = UserDefaults(suiteName: "test.gamification.unlock")!
        defer { defaults.removePersistentDomain(forName: "test.gamification.unlock") }
        let service = GamificationService(defaults: defaults)

        let profile = service.evaluateAchievements(
            transactionCount: 1,
            budgetCount: 0,
            goalCount: 0,
            completedGoals: 0,
            onBudgetCount: 0,
            savingsRatePercent: 0
        )

        let achievement = profile.achievements.first { $0.id == "first_transaction" }
        #expect(achievement?.isUnlocked == true)
        #expect(profile.totalPoints > 0)
    }

    @Test("Reset clears profile")
    func resetClearsProfile() {
        let defaults = UserDefaults(suiteName: "test.gamification.reset")!
        defer { defaults.removePersistentDomain(forName: "test.gamification.reset") }
        let service = GamificationService(defaults: defaults)

        _ = service.evaluateAchievements(
            transactionCount: 100,
            budgetCount: 5,
            goalCount: 3,
            completedGoals: 1,
            onBudgetCount: 3,
            savingsRatePercent: 30
        )

        service.resetProfile()
        let profile = service.loadProfile()

        #expect(profile.totalPoints == 0)
    }
}
