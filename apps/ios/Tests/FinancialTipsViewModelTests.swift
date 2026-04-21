// SPDX-License-Identifier: BUSL-1.1

// FinancialTipsViewModelTests.swift
// FinanceTests
//
// Unit tests for FinancialTipsViewModel and FinancialTipService.
//
// References: #320

import Foundation
import SwiftUI
import Testing
@testable import FinanceApp

// MARK: - Stub Tip Service

/// Test double for FinancialTipProviding.
final class StubFinancialTipService: FinancialTipProviding, @unchecked Sendable {
    var tipsToReturn: [FinancialTip] = []
    var dismissedIds: Set<String> = []

    func tips(
        for context: TipContext,
        budgets: [BudgetItem],
        goals: [GoalItem],
        transactions: [TransactionItem]
    ) -> [FinancialTip] {
        tipsToReturn.filter { $0.applicableContexts.contains(context) && !dismissedIds.contains($0.id) }
    }

    func dismissTip(id: String) {
        dismissedIds.insert(id)
    }

    func isDismissed(id: String) -> Bool {
        dismissedIds.contains(id)
    }

    func resetDismissals() {
        dismissedIds.removeAll()
    }
}

// MARK: - FinancialTipsViewModel Tests

@Suite("FinancialTipsViewModel Tests")
struct FinancialTipsViewModelTests {

    private func makeViewModel(
        tips: [FinancialTip] = [],
        budgets: [BudgetItem] = [],
        goals: [GoalItem] = [],
        transactions: [TransactionItem] = []
    ) -> (FinancialTipsViewModel, StubFinancialTipService) {
        let tipService = StubFinancialTipService()
        tipService.tipsToReturn = tips

        let budgetRepo = StubBudgetRepository()
        budgetRepo.budgetsToReturn = budgets

        let goalRepo = StubGoalRepository()
        goalRepo.goalsToReturn = goals

        let transactionRepo = StubTransactionRepository()
        transactionRepo.transactionsToReturn = transactions

        let vm = FinancialTipsViewModel(
            tipService: tipService,
            transactionRepository: transactionRepo,
            budgetRepository: budgetRepo,
            goalRepository: goalRepo
        )
        return (vm, tipService)
    }

    @Test("Loads tips for given context")
    @MainActor
    func loadsTipsForContext() async {
        let tip = FinancialTip(
            id: "test_tip",
            title: "Test",
            body: "Body",
            category: .saving,
            applicableContexts: [.dashboard],
            priority: 5
        )
        let (vm, _) = makeViewModel(tips: [tip])

        await vm.loadTips(for: .dashboard)

        #expect(vm.tips.count == 1)
        #expect(vm.tips.first?.id == "test_tip")
        #expect(vm.context == .dashboard)
    }

    @Test("Filters tips by context")
    @MainActor
    func filtersByContext() async {
        let dashboardTip = FinancialTip(
            id: "dash",
            title: "D",
            body: "DB",
            category: .general,
            applicableContexts: [.dashboard],
            priority: 5
        )
        let goalTip = FinancialTip(
            id: "goal",
            title: "G",
            body: "GB",
            category: .saving,
            applicableContexts: [.goals],
            priority: 5
        )
        let (vm, _) = makeViewModel(tips: [dashboardTip, goalTip])

        await vm.loadTips(for: .goals)

        #expect(vm.tips.count == 1)
        #expect(vm.tips.first?.id == "goal")
    }

    @Test("Respects maxTips limit")
    @MainActor
    func respectsMaxTips() async {
        let tips = (0..<10).map { i in
            FinancialTip(
                id: "tip_\(i)",
                title: "Tip \(i)",
                body: "Body",
                category: .general,
                applicableContexts: [.dashboard],
                priority: i
            )
        }
        let (vm, _) = makeViewModel(tips: tips)
        vm.maxTips = 3

        await vm.loadTips(for: .dashboard)

        #expect(vm.tips.count == 3)
    }

    @Test("Dismiss removes tip from list")
    @MainActor
    func dismissRemovesTip() async {
        let tip = FinancialTip(
            id: "dismissable",
            title: "Bye",
            body: "Gone",
            category: .general,
            applicableContexts: [.dashboard],
            priority: 5
        )
        let (vm, service) = makeViewModel(tips: [tip])

        await vm.loadTips(for: .dashboard)
        #expect(vm.tips.count == 1)

        vm.dismissTip(tip)

        #expect(vm.tips.isEmpty)
        #expect(service.isDismissed(id: "dismissable"))
    }

    @Test("Reset dismissals restores tips")
    @MainActor
    func resetRestoresTips() async {
        let tip = FinancialTip(
            id: "reset_test",
            title: "Reset",
            body: "Me",
            category: .general,
            applicableContexts: [.dashboard],
            priority: 5
        )
        let (vm, _) = makeViewModel(tips: [tip])

        await vm.loadTips(for: .dashboard)
        vm.dismissTip(tip)
        #expect(vm.tips.isEmpty)

        await vm.resetAllDismissals()
        #expect(vm.tips.count == 1)
    }

    @Test("Handles repository errors gracefully")
    @MainActor
    func handlesErrors() async {
        let tipService = StubFinancialTipService()
        let budgetRepo = StubBudgetRepository()
        budgetRepo.errorToThrow = TestError.simulated
        let goalRepo = StubGoalRepository()
        let transactionRepo = StubTransactionRepository()

        let vm = FinancialTipsViewModel(
            tipService: tipService,
            transactionRepository: transactionRepo,
            budgetRepository: budgetRepo,
            goalRepository: goalRepo
        )

        await vm.loadTips(for: .dashboard)

        #expect(vm.tips.isEmpty)
        #expect(vm.errorMessage != nil)
    }
}

// MARK: - FinancialTipService Tests

@Suite("FinancialTipService Tests")
struct FinancialTipServiceTests {

    @Test("Generates tips for dashboard context")
    func generatesForDashboard() {
        let service = FinancialTipService(defaults: UserDefaults(suiteName: "test.tips.dash")!)
        defer { UserDefaults(suiteName: "test.tips.dash")?.removePersistentDomain(forName: "test.tips.dash") }

        let tips = service.tips(
            for: .dashboard,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals,
            transactions: SampleData.allTransactions
        )

        #expect(!tips.isEmpty)
    }

    @Test("Generates dynamic over-budget tip")
    func generatesOverBudgetTip() {
        let service = FinancialTipService(defaults: UserDefaults(suiteName: "test.tips.ob")!)
        defer { UserDefaults(suiteName: "test.tips.ob")?.removePersistentDomain(forName: "test.tips.ob") }

        let tips = service.tips(
            for: .budgets,
            budgets: [SampleData.overBudget],
            goals: [],
            transactions: []
        )

        let overBudgetTip = tips.first { $0.id == "tip_dynamic_over_budget" }
        #expect(overBudgetTip != nil)
    }

    @Test("Dismissal persists")
    func dismissalPersists() {
        let defaults = UserDefaults(suiteName: "test.tips.dismiss")!
        defer { defaults.removePersistentDomain(forName: "test.tips.dismiss") }
        let service = FinancialTipService(defaults: defaults)

        #expect(!service.isDismissed(id: "some_tip"))

        service.dismissTip(id: "some_tip")
        #expect(service.isDismissed(id: "some_tip"))
    }

    @Test("Reset clears all dismissals")
    func resetClearsAll() {
        let defaults = UserDefaults(suiteName: "test.tips.reset")!
        defer { defaults.removePersistentDomain(forName: "test.tips.reset") }
        let service = FinancialTipService(defaults: defaults)

        service.dismissTip(id: "tip_a")
        service.dismissTip(id: "tip_b")
        service.resetDismissals()

        #expect(!service.isDismissed(id: "tip_a"))
        #expect(!service.isDismissed(id: "tip_b"))
    }
}
