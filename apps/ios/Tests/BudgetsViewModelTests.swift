// SPDX-License-Identifier: BUSL-1.1

// BudgetsViewModelTests.swift
// FinanceTests
//
// Tests for BudgetsViewModel — loading, aggregate computations, and error handling.

import XCTest
@testable import FinanceApp

final class BudgetsViewModelTests: XCTestCase {

    // MARK: - Test: loadBudgets populates list

    @MainActor
    func testLoadBudgetsPopulatesList() async {
        let repo = StubBudgetRepository()
        repo.budgetsToReturn = SampleData.allBudgets
        let vm = BudgetsViewModel(repository: repo)

        await vm.loadBudgets()

        XCTAssertEqual(vm.budgets.count, SampleData.allBudgets.count,
                       "Should load all budgets from the repository")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading")
    }

    // MARK: - Test: totalBudgeted sums all budget limits

    @MainActor
    func testTotalBudgeted() async {
        let repo = StubBudgetRepository()
        repo.budgetsToReturn = SampleData.allBudgets
        let vm = BudgetsViewModel(repository: repo)

        await vm.loadBudgets()

        // 500_00 + 200_00 + 200_00 = 900_00
        let expected = SampleData.allBudgets.reduce(Int64(0)) { $0 + $1.limitMinorUnits }
        XCTAssertEqual(vm.totalBudgeted, expected,
                       "totalBudgeted should be the sum of all budget limits")
    }

    // MARK: - Test: totalSpent sums all budget spending

    @MainActor
    func testTotalSpent() async {
        let repo = StubBudgetRepository()
        repo.budgetsToReturn = SampleData.allBudgets
        let vm = BudgetsViewModel(repository: repo)

        await vm.loadBudgets()

        // 320_00 + 180_00 + 210_00 = 710_00
        let expected = SampleData.allBudgets.reduce(Int64(0)) { $0 + $1.spentMinorUnits }
        XCTAssertEqual(vm.totalSpent, expected,
                       "totalSpent should be the sum of all budget spending")
    }

    // MARK: - Test: error clears budgets

    @MainActor
    func testErrorHandlingClearsBudgets() async {
        let repo = StubBudgetRepository()
        repo.errorToThrow = TestError.simulated
        let vm = BudgetsViewModel(repository: repo)

        await vm.loadBudgets()

        XCTAssertTrue(vm.budgets.isEmpty,
                      "Budgets should be empty when repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }
}
