// SPDX-License-Identifier: BUSL-1.1

// GoalsViewModelTests.swift
// FinanceTests
//
// Tests for GoalsViewModel — loading and state management.

import XCTest
@testable import FinanceApp

final class GoalsViewModelTests: XCTestCase {

    // MARK: - Test: loadGoals populates list

    @MainActor
    func testLoadGoalsPopulatesList() async {
        let repo = StubGoalRepository()
        repo.goalsToReturn = SampleData.allGoals
        let vm = GoalsViewModel(repository: repo)

        await vm.loadGoals()

        XCTAssertEqual(vm.goals.count, SampleData.allGoals.count,
                       "Should load all goals from the repository")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading")
    }

    // MARK: - Test: isLoading resets after load

    @MainActor
    func testLoadGoalsSetsIsLoading() async {
        let repo = StubGoalRepository()
        repo.goalsToReturn = []
        let vm = GoalsViewModel(repository: repo)

        XCTAssertFalse(vm.isLoading, "isLoading should be false initially")

        await vm.loadGoals()

        XCTAssertFalse(vm.isLoading, "isLoading should be false after loading completes")
    }

    // MARK: - Test: error clears goals

    @MainActor
    func testErrorHandlingClearsGoals() async {
        let repo = StubGoalRepository()
        repo.errorToThrow = TestError.simulated
        let vm = GoalsViewModel(repository: repo)

        await vm.loadGoals()

        XCTAssertTrue(vm.goals.isEmpty,
                      "Goals should be empty when repository throws")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }
}
