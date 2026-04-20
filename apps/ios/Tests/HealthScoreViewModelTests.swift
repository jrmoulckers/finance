// SPDX-License-Identifier: BUSL-1.1

// HealthScoreViewModelTests.swift
// FinanceTests
//
// Tests for HealthScoreViewModel and HealthScoreEngine — score computation,
// component calculations, grade assignment, tips, and benchmarks.
//
// References: #299

import XCTest
@testable import FinanceApp

// MARK: - Stub Health Score Engine

private final class StubHealthScoreEngine: HealthScoreEngineProtocol, @unchecked Sendable {
    var scoreToReturn: FinancialHealthScore?

    func computeScore(
        accounts: [AccountItem],
        transactions: [TransactionItem],
        budgets: [BudgetItem],
        goals: [GoalItem]
    ) async -> FinancialHealthScore {
        scoreToReturn ?? FinancialHealthScore(
            overallScore: 72,
            components: [
                HealthScoreComponent(
                    id: "savings_rate", name: "Savings Rate",
                    score: 70, maxScore: 100, weight: 0.25,
                    description: "20% savings rate", systemImage: "leaf"
                ),
                HealthScoreComponent(
                    id: "budget_adherence", name: "Budget Adherence",
                    score: 80, maxScore: 100, weight: 0.20,
                    description: "2 of 3 budgets on track", systemImage: "chart.pie"
                ),
            ],
            tips: [
                HealthTip(
                    title: "Boost Savings",
                    description: "Try to save more",
                    impact: .high,
                    systemImage: "leaf"
                ),
            ],
            benchmark: HealthBenchmark(
                percentile: 65,
                averageScore: 62,
                medianScore: 58,
                groupLabel: "All Users"
            )
        )
    }
}

// MARK: - ViewModel Tests

final class HealthScoreViewModelTests: XCTestCase {

    @MainActor
    private func makeViewModel(
        accounts: [AccountItem] = SampleData.allAccounts,
        transactions: [TransactionItem] = SampleData.allTransactions,
        budgets: [BudgetItem] = SampleData.allBudgets,
        goals: [GoalItem] = SampleData.allGoals,
        accountError: Error? = nil,
        engine: StubHealthScoreEngine = StubHealthScoreEngine()
    ) -> (HealthScoreViewModel, StubHealthScoreEngine) {
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = accounts
        accountRepo.errorToThrow = accountError

        let transactionRepo = StubTransactionRepository()
        transactionRepo.transactionsToReturn = transactions

        let budgetRepo = StubBudgetRepository()
        budgetRepo.budgetsToReturn = budgets

        let goalRepo = StubGoalRepository()
        goalRepo.goalsToReturn = goals

        let vm = HealthScoreViewModel(
            accountRepository: accountRepo,
            transactionRepository: transactionRepo,
            budgetRepository: budgetRepo,
            goalRepository: goalRepo,
            engine: engine
        )
        return (vm, engine)
    }

    @MainActor
    func testLoadHealthScorePopulatesData() async {
        let (vm, _) = makeViewModel()

        await vm.loadHealthScore()

        XCTAssertNotNil(vm.healthScore)
        XCTAssertEqual(vm.healthScore?.overallScore, 72)
        XCTAssertFalse(vm.isLoading)
        XCTAssertNil(vm.errorMessage)
    }

    @MainActor
    func testScoreProgressCalculation() async {
        let (vm, _) = makeViewModel()

        await vm.loadHealthScore()

        XCTAssertEqual(vm.scoreProgress, 0.72, accuracy: 0.01)
    }

    @MainActor
    func testScoreColorMatchesGrade() async {
        let (vm, _) = makeViewModel()

        await vm.loadHealthScore()

        XCTAssertEqual(vm.scoreColor, HealthGrade.b.color)
    }

    @MainActor
    func testErrorSetsMessage() async {
        let (vm, _) = makeViewModel(accountError: TestError.simulated)

        await vm.loadHealthScore()

        XCTAssertNotNil(vm.errorMessage)
        XCTAssertNil(vm.healthScore)
    }

    @MainActor
    func testDismissError() {
        let (vm, _) = makeViewModel()
        vm.errorMessage = "Test"
        XCTAssertTrue(vm.showError)

        vm.dismissError()
        XCTAssertFalse(vm.showError)
    }

    @MainActor
    func testScoreHistoryGenerated() async {
        let (vm, _) = makeViewModel()

        await vm.loadHealthScore()

        XCTAssertEqual(vm.scoreHistory.count, 6)
    }

    @MainActor
    func testInitialScoreProgressIsZero() {
        let (vm, _) = makeViewModel()
        XCTAssertEqual(vm.scoreProgress, 0)
    }
}

// MARK: - Health Score Engine Tests

final class HealthScoreEngineTests: XCTestCase {

    func testComputeScoreWithSampleData() async {
        let engine = HealthScoreEngine.shared

        let score = await engine.computeScore(
            accounts: SampleData.allAccounts,
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals
        )

        XCTAssertGreaterThanOrEqual(score.overallScore, 0)
        XCTAssertLessThanOrEqual(score.overallScore, 100)
        XCTAssertEqual(score.components.count, 5)
    }

    func testComputeScoreWithEmptyData() async {
        let engine = HealthScoreEngine.shared

        let score = await engine.computeScore(
            accounts: [],
            transactions: [],
            budgets: [],
            goals: []
        )

        XCTAssertGreaterThanOrEqual(score.overallScore, 0)
        XCTAssertLessThanOrEqual(score.overallScore, 100)
    }

    func testComponentsHaveValidScores() async {
        let engine = HealthScoreEngine.shared

        let score = await engine.computeScore(
            accounts: SampleData.allAccounts,
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals
        )

        for component in score.components {
            XCTAssertGreaterThanOrEqual(component.score, 0,
                "\(component.name) score should be >= 0")
            XCTAssertLessThanOrEqual(component.score, component.maxScore,
                "\(component.name) score should be <= maxScore")
            XCTAssertGreaterThan(component.weight, 0,
                "\(component.name) should have positive weight")
        }
    }

    func testTipsGeneratedForWeakComponents() async {
        let engine = HealthScoreEngine.shared

        let score = await engine.computeScore(
            accounts: [],
            transactions: [],
            budgets: [],
            goals: []
        )

        // With no budgets and no goals, tips should suggest creating them
        XCTAssertFalse(score.tips.isEmpty, "Tips should be generated for empty data")
    }

    func testBenchmarkPercentile() async {
        let engine = HealthScoreEngine.shared

        let score = await engine.computeScore(
            accounts: SampleData.allAccounts,
            transactions: SampleData.allTransactions,
            budgets: SampleData.allBudgets,
            goals: SampleData.allGoals
        )

        XCTAssertGreaterThanOrEqual(score.benchmark.percentile, 0)
        XCTAssertLessThanOrEqual(score.benchmark.percentile, 100)
    }
}

// MARK: - Health Grade Tests

final class HealthGradeTests: XCTestCase {

    func testGradeFromScore() {
        XCTAssertEqual(HealthGrade.from(score: 97), .aPlus)
        XCTAssertEqual(HealthGrade.from(score: 90), .a)
        XCTAssertEqual(HealthGrade.from(score: 82), .bPlus)
        XCTAssertEqual(HealthGrade.from(score: 72), .b)
        XCTAssertEqual(HealthGrade.from(score: 65), .cPlus)
        XCTAssertEqual(HealthGrade.from(score: 58), .c)
        XCTAssertEqual(HealthGrade.from(score: 45), .d)
        XCTAssertEqual(HealthGrade.from(score: 30), .f)
        XCTAssertEqual(HealthGrade.from(score: 0), .f)
    }

    func testGradeDescriptions() {
        for grade in [HealthGrade.aPlus, .a, .bPlus, .b, .cPlus, .c, .d, .f] {
            XCTAssertFalse(grade.description.isEmpty, "\(grade.rawValue) should have description")
            XCTAssertFalse(grade.rawValue.isEmpty, "\(grade) should have raw value")
        }
    }

    func testComponentPercentage() {
        let component = HealthScoreComponent(
            id: "test", name: "Test", score: 75, maxScore: 100,
            weight: 0.2, description: "Test", systemImage: "star"
        )
        XCTAssertEqual(component.percentage, 75.0)

        let zero = HealthScoreComponent(
            id: "test", name: "Test", score: 0, maxScore: 0,
            weight: 0.2, description: "Test", systemImage: "star"
        )
        XCTAssertEqual(zero.percentage, 0)
    }

    func testComponentColor() {
        let green = HealthScoreComponent(
            id: "t", name: "T", score: 85, maxScore: 100,
            weight: 0.1, description: "", systemImage: "star"
        )
        XCTAssertEqual(green.color, .green)

        let red = HealthScoreComponent(
            id: "t", name: "T", score: 20, maxScore: 100,
            weight: 0.1, description: "", systemImage: "star"
        )
        XCTAssertEqual(red.color, .red)
    }

    func testTipImpactProperties() {
        XCTAssertFalse(TipImpact.low.displayName.isEmpty)
        XCTAssertFalse(TipImpact.medium.displayName.isEmpty)
        XCTAssertFalse(TipImpact.high.displayName.isEmpty)
    }
}
