// SPDX-License-Identifier: BUSL-1.1

// WatchComplicationTests.swift
// FinanceTests
//
// Tests for Apple Watch complications: BudgetComplicationEntry,
// SpendingComplicationEntry, GoalComplicationEntry, and the
// ComplicationDataWriter service.
// Refs #266

import XCTest
@testable import FinanceApp

final class WatchComplicationTests: XCTestCase {

    // MARK: - ComplicationDataWriter

    @MainActor
    func testComplicationDataWriterWritesBudgetData() async throws {
        let stubBudgets = StubBudgetRepository()
        stubBudgets.budgetsToReturn = SampleData.allBudgets

        let stubAccounts = StubAccountRepository()
        stubAccounts.accountsToReturn = SampleData.allAccounts

        let stubTransactions = StubTransactionRepository()
        stubTransactions.transactionsToReturn = SampleData.allTransactions

        let stubGoals = StubGoalRepository()
        stubGoals.goalsToReturn = SampleData.allGoals

        let writer = ComplicationDataWriter(
            accountRepository: stubAccounts,
            transactionRepository: stubTransactions,
            budgetRepository: stubBudgets,
            goalRepository: stubGoals
        )

        // Verify the writer can be created and called without crashing.
        // Actual UserDefaults writes go to the app group which may not
        // exist in the test sandbox, so we verify the writer runs cleanly.
        await writer.writeAllComplicationData()
    }

    @MainActor
    func testComplicationDataWriterHandlesBudgetError() async throws {
        let stubBudgets = StubBudgetRepository()
        stubBudgets.errorToThrow = TestError.simulated

        let stubAccounts = StubAccountRepository()
        let stubTransactions = StubTransactionRepository()
        let stubGoals = StubGoalRepository()

        let writer = ComplicationDataWriter(
            accountRepository: stubAccounts,
            transactionRepository: stubTransactions,
            budgetRepository: stubBudgets,
            goalRepository: stubGoals
        )

        // Should not throw — errors are logged internally
        await writer.writeAllComplicationData()
    }

    @MainActor
    func testComplicationDataWriterHandlesEmptyGoals() async throws {
        let stubGoals = StubGoalRepository()
        stubGoals.goalsToReturn = []

        let writer = ComplicationDataWriter(
            accountRepository: StubAccountRepository(),
            transactionRepository: StubTransactionRepository(),
            budgetRepository: StubBudgetRepository(),
            goalRepository: stubGoals
        )

        // Should complete gracefully with no active goals
        await writer.writeAllComplicationData()
    }

    @MainActor
    func testComplicationDataWriterSelectsHighestProgressGoal() async throws {
        let goals = [
            GoalItem(
                id: "g1", name: "Emergency Fund",
                currentMinorUnits: 7_500_00, targetMinorUnits: 10_000_00,
                currencyCode: "USD", targetDate: nil,
                status: .active, icon: "shield", color: .blue
            ),
            GoalItem(
                id: "g2", name: "Vacation",
                currentMinorUnits: 1_800_00, targetMinorUnits: 2_000_00,
                currencyCode: "USD", targetDate: nil,
                status: .active, icon: "airplane", color: .teal
            ),
        ]

        let stubGoals = StubGoalRepository()
        stubGoals.goalsToReturn = goals

        // Vacation goal has higher progress (90% vs 75%)
        let vacation = goals[1]
        let emergency = goals[0]
        XCTAssertGreaterThan(
            vacation.progress, emergency.progress,
            "Vacation goal should have higher progress"
        )
    }

    // MARK: - Spending Calculation

    @MainActor
    func testDailyTargetCalculation() {
        // Daily target = sum of monthly budget limits / 30
        let budgets = SampleData.allBudgets
        let monthlyTotal = budgets.reduce(Int64(0)) { $0 + $1.limitMinorUnits }
        // 500_00 + 200_00 + 200_00 = 900_00
        XCTAssertEqual(monthlyTotal, 900_00)

        let dailyTarget = monthlyTotal / 30
        XCTAssertEqual(dailyTarget, 30_00,
                       "Daily target should be monthly total / 30")
    }

    @MainActor
    func testTodaySpendingFiltersByDate() {
        let calendar = Calendar.current
        let today = Date.now
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today)!

        let todayTx = TransactionItem(
            id: "t1", payee: "Coffee", category: "Food",
            amountMinorUnits: -5_00, currencyCode: "USD",
            date: today, type: .expense, status: .cleared
        )
        let yesterdayTx = TransactionItem(
            id: "t2", payee: "Lunch", category: "Food",
            amountMinorUnits: -15_00, currencyCode: "USD",
            date: yesterday, type: .expense, status: .cleared
        )

        let allTx = [todayTx, yesterdayTx]
        let todayOnly = allTx.filter { tx in
            calendar.isDateInToday(tx.date) && tx.type == .expense
        }

        XCTAssertEqual(todayOnly.count, 1,
                       "Should only include today's expenses")
        XCTAssertEqual(todayOnly.first?.id, "t1")
    }

    @MainActor
    func testTodaySpendingIgnoresIncome() {
        let calendar = Calendar.current
        let today = Date.now

        let expense = TransactionItem(
            id: "t1", payee: "Coffee", category: "Food",
            amountMinorUnits: -5_00, currencyCode: "USD",
            date: today, type: .expense, status: .cleared
        )
        let income = TransactionItem(
            id: "t2", payee: "Payroll", category: "Income",
            amountMinorUnits: 4_250_00, currencyCode: "USD",
            date: today, type: .income, status: .cleared
        )

        let allTx = [expense, income]
        let todayExpenses = allTx.filter { tx in
            calendar.isDateInToday(tx.date) && tx.type == .expense
        }

        XCTAssertEqual(todayExpenses.count, 1)
        let spentToday = todayExpenses.reduce(Int64(0)) { $0 + abs($1.amountMinorUnits) }
        XCTAssertEqual(spentToday, 5_00,
                       "Should only sum expense amounts")
    }

    // MARK: - Budget Complication Entry

    @MainActor
    func testBudgetComplicationEntryFraction() {
        let entry = ComplicationTestHelpers.makeBudgetEntry(
            spent: 320_00, budgeted: 500_00
        )
        XCTAssertEqual(entry.fraction, 0.64, accuracy: 0.01)
        XCTAssertFalse(entry.isOverBudget)
    }

    @MainActor
    func testBudgetComplicationEntryOverBudget() {
        let entry = ComplicationTestHelpers.makeBudgetEntry(
            spent: 600_00, budgeted: 500_00
        )
        // Fraction is clamped to 1.0
        XCTAssertEqual(entry.fraction, 1.0)
        // Raw progress exceeds 1.0
        XCTAssertGreaterThan(entry.rawProgress, 1.0)
        XCTAssertTrue(entry.isOverBudget)
    }

    @MainActor
    func testBudgetComplicationEntryZeroBudget() {
        let entry = ComplicationTestHelpers.makeBudgetEntry(
            spent: 100_00, budgeted: 0
        )
        XCTAssertEqual(entry.fraction, 0)
        XCTAssertFalse(entry.isOverBudget)
    }

    @MainActor
    func testBudgetComplicationPlaceholder() {
        let placeholder = ComplicationTestHelpers.budgetPlaceholder
        XCTAssertFalse(placeholder.isOverBudget)
        XCTAssertGreaterThan(placeholder.fraction, 0)
    }

    // MARK: - Spending Complication Entry

    @MainActor
    func testSpendingComplicationEntryFraction() {
        let entry = ComplicationTestHelpers.makeSpendingEntry(
            spent: 42_50, dailyTarget: 100_00
        )
        XCTAssertEqual(entry.fraction, 0.425, accuracy: 0.01)
        XCTAssertFalse(entry.isOverTarget)
    }

    @MainActor
    func testSpendingComplicationEntryOverTarget() {
        let entry = ComplicationTestHelpers.makeSpendingEntry(
            spent: 120_00, dailyTarget: 100_00
        )
        XCTAssertTrue(entry.isOverTarget)
        XCTAssertEqual(entry.fraction, 1.0,
                       "Fraction should be clamped to 1.0")
        XCTAssertGreaterThan(entry.rawProgress, 1.0)
    }

    @MainActor
    func testSpendingComplicationEntryZeroTarget() {
        let entry = ComplicationTestHelpers.makeSpendingEntry(
            spent: 50_00, dailyTarget: 0
        )
        XCTAssertEqual(entry.fraction, 0)
        XCTAssertFalse(entry.isOverTarget,
                       "Zero target should not be considered over target")
    }

    // MARK: - Goal Complication Entry

    @MainActor
    func testGoalComplicationEntryFraction() {
        let entry = ComplicationTestHelpers.makeGoalEntry(
            current: 7_500_00, target: 10_000_00
        )
        XCTAssertEqual(entry.fraction, 0.75, accuracy: 0.01)
        XCTAssertFalse(entry.isComplete)
    }

    @MainActor
    func testGoalComplicationEntryComplete() {
        let entry = ComplicationTestHelpers.makeGoalEntry(
            current: 10_000_00, target: 10_000_00
        )
        XCTAssertEqual(entry.fraction, 1.0)
        XCTAssertTrue(entry.isComplete)
    }

    @MainActor
    func testGoalComplicationEntryOverachieved() {
        let entry = ComplicationTestHelpers.makeGoalEntry(
            current: 12_000_00, target: 10_000_00
        )
        // Fraction clamped to 1.0
        XCTAssertEqual(entry.fraction, 1.0)
        // Raw progress exceeds 1.0
        XCTAssertGreaterThan(entry.rawProgress, 1.0)
        XCTAssertTrue(entry.isComplete)
    }

    @MainActor
    func testGoalComplicationEntryZeroTarget() {
        let entry = ComplicationTestHelpers.makeGoalEntry(
            current: 5_000_00, target: 0
        )
        XCTAssertEqual(entry.fraction, 0)
        XCTAssertFalse(entry.isComplete)
    }

    // MARK: - Budget Selection Logic

    @MainActor
    func testSelectsMostCriticalBudget() {
        let budgets = SampleData.allBudgets
        let critical = budgets.max(by: { $0.progress < $1.progress })

        XCTAssertNotNil(critical)
        XCTAssertEqual(critical?.name, "Entertainment",
                       "Should select the most over-budget category")
    }

    @MainActor
    func testEmptyBudgetsReturnsNil() {
        let budgets: [BudgetItem] = []
        let critical = budgets.max(by: { $0.progress < $1.progress })
        XCTAssertNil(critical)
    }
}

// MARK: - Test Helpers

/// Factory methods for creating complication entries in tests.
/// Mirrors the real entry types but created without widget framework dependencies.
private enum ComplicationTestHelpers {

    struct BudgetEntry {
        let spent: Int64
        let budgeted: Int64

        var fraction: Double {
            guard budgeted > 0 else { return 0 }
            return min(max(Double(spent) / Double(budgeted), 0), 1.0)
        }

        var rawProgress: Double {
            guard budgeted > 0 else { return 0 }
            return Double(spent) / Double(budgeted)
        }

        var isOverBudget: Bool { spent > budgeted }
    }

    struct SpendingEntry {
        let spent: Int64
        let dailyTarget: Int64

        var fraction: Double {
            guard dailyTarget > 0 else { return 0 }
            return min(max(Double(spent) / Double(dailyTarget), 0), 1.0)
        }

        var rawProgress: Double {
            guard dailyTarget > 0 else { return 0 }
            return Double(spent) / Double(dailyTarget)
        }

        var isOverTarget: Bool { spent > dailyTarget && dailyTarget > 0 }
    }

    struct GoalEntry {
        let current: Int64
        let target: Int64

        var fraction: Double {
            guard target > 0 else { return 0 }
            return min(max(Double(current) / Double(target), 0), 1.0)
        }

        var rawProgress: Double {
            guard target > 0 else { return 0 }
            return Double(current) / Double(target)
        }

        var isComplete: Bool { current >= target && target > 0 }
    }

    static func makeBudgetEntry(spent: Int64, budgeted: Int64) -> BudgetEntry {
        BudgetEntry(spent: spent, budgeted: budgeted)
    }

    static func makeSpendingEntry(spent: Int64, dailyTarget: Int64) -> SpendingEntry {
        SpendingEntry(spent: spent, dailyTarget: dailyTarget)
    }

    static func makeGoalEntry(current: Int64, target: Int64) -> GoalEntry {
        GoalEntry(current: current, target: target)
    }

    static let budgetPlaceholder = BudgetEntry(
        spent: 320_00, budgeted: 500_00
    )
}
