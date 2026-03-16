// SPDX-License-Identifier: BUSL-1.1

// GoalCreateViewModelTests.swift
// FinanceTests
//
// Tests for GoalCreateViewModel — validation, create, edit, and error handling.

import XCTest
@testable import FinanceApp

final class GoalCreateViewModelTests: XCTestCase {

    // MARK: - Test: validation fails without name

    @MainActor
    func testSaveFailsWithoutName() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.targetAmountText = "10000.00"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when name is empty")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
        XCTAssertTrue(vm.validationMessage.contains("name"),
                      "Validation message should mention name")
        XCTAssertTrue(repo.createdGoals.isEmpty,
                      "Repository should not be called when validation fails")
    }

    // MARK: - Test: validation fails with whitespace-only name

    @MainActor
    func testSaveFailsWithWhitespaceName() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "   "
        vm.targetAmountText = "10000.00"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when name is only whitespace")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
    }

    // MARK: - Test: validation fails without valid target amount

    @MainActor
    func testSaveFailsWithZeroTarget() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "Emergency Fund"
        vm.targetAmountText = "0"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when target amount is zero")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
    }

    @MainActor
    func testSaveFailsWithEmptyTarget() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "Emergency Fund"
        vm.targetAmountText = ""

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when target amount is empty")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
    }

    // MARK: - Test: validation fails with negative current amount

    @MainActor
    func testSaveFailsWithNegativeCurrentAmount() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "Emergency Fund"
        vm.targetAmountText = "10000.00"
        vm.currentAmountText = "-500.00"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when current amount is negative")
        XCTAssertTrue(vm.showingValidationError, "Should show validation error")
    }

    // MARK: - Test: successful create

    @MainActor
    func testSaveSucceedsWithValidData() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "Emergency Fund"
        vm.targetAmountText = "10000.00"
        vm.currentAmountText = "2500.00"
        vm.notes = "6 months of expenses"

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed with valid data")
        XCTAssertEqual(repo.createdGoals.count, 1,
                       "Repository should have one created goal")

        let created = repo.createdGoals.first
        XCTAssertEqual(created?.name, "Emergency Fund")
        XCTAssertEqual(created?.targetMinorUnits, 1_000_000,
                       "Target should be 10000.00 in minor units")
        XCTAssertEqual(created?.currentMinorUnits, 250_000,
                       "Current should be 2500.00 in minor units")
        XCTAssertEqual(created?.notes, "6 months of expenses")
        XCTAssertEqual(created?.status, .active,
                       "New goals should have active status")
        XCTAssertTrue(vm.didSave, "didSave should be true after successful save")
    }

    // MARK: - Test: create without target date

    @MainActor
    func testSaveSucceedsWithoutTargetDate() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "Rainy Day Fund"
        vm.targetAmountText = "5000.00"
        vm.hasTargetDate = false

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed without target date")
        XCTAssertNil(repo.createdGoals.first?.targetDate,
                     "Target date should be nil when not set")
    }

    // MARK: - Test: create with target date

    @MainActor
    func testSaveSucceedsWithTargetDate() async {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "Vacation"
        vm.targetAmountText = "3000.00"
        vm.hasTargetDate = true

        let result = await vm.save()

        XCTAssertTrue(result, "Save should succeed with target date")
        XCTAssertNotNil(repo.createdGoals.first?.targetDate,
                        "Target date should be set when enabled")
    }

    // MARK: - Test: edit mode pre-fills fields

    @MainActor
    func testEditModePreFillsFields() {
        let repo = StubGoalRepository()
        let goal = SampleData.activeGoal
        let vm = GoalCreateViewModel(repository: repo, goal: goal)

        XCTAssertTrue(vm.isEditing, "Should be in edit mode")
        XCTAssertEqual(vm.name, "Emergency Fund",
                       "Name should be pre-filled")
        XCTAssertEqual(vm.targetAmountText, "100000.00",
                       "Target amount should be pre-filled from goal")
        XCTAssertEqual(vm.currentAmountText, "75000.00",
                       "Current amount should be pre-filled from goal")
        XCTAssertTrue(vm.hasTargetDate,
                      "Target date toggle should be on when goal has a date")
        XCTAssertEqual(vm.navigationTitle, "Edit Goal",
                       "Title should reflect edit mode")
        XCTAssertEqual(vm.saveButtonTitle, "Update",
                       "Save button should say Update in edit mode")
    }

    // MARK: - Test: edit mode calls updateGoal

    @MainActor
    func testEditModeSavesAsUpdate() async {
        let repo = StubGoalRepository()
        let goal = SampleData.activeGoal
        let vm = GoalCreateViewModel(repository: repo, goal: goal)

        vm.targetAmountText = "15000.00"

        let result = await vm.save()

        XCTAssertTrue(result, "Update should succeed")
        XCTAssertEqual(repo.updatedGoals.count, 1,
                       "Repository should have one updated goal")
        XCTAssertTrue(repo.createdGoals.isEmpty,
                      "Should not create when updating")
        XCTAssertEqual(repo.updatedGoals.first?.id, goal.id,
                       "Updated goal should retain the original ID")
    }

    // MARK: - Test: repository error shows alert

    @MainActor
    func testSaveHandlesRepositoryError() async {
        let repo = StubGoalRepository()
        repo.errorToThrow = TestError.simulated
        let vm = GoalCreateViewModel(repository: repo)

        vm.name = "Emergency Fund"
        vm.targetAmountText = "10000.00"

        let result = await vm.save()

        XCTAssertFalse(result, "Save should fail when repository throws")
        XCTAssertTrue(vm.showingValidationError, "Should show error alert")
        XCTAssertFalse(vm.didSave, "didSave should remain false on error")
    }

    // MARK: - Test: create mode defaults

    @MainActor
    func testCreateModeDefaults() {
        let repo = StubGoalRepository()
        let vm = GoalCreateViewModel(repository: repo)

        XCTAssertFalse(vm.isEditing, "Should not be in edit mode")
        XCTAssertEqual(vm.name, "", "Name should be empty")
        XCTAssertEqual(vm.targetAmountText, "", "Target amount should be empty")
        XCTAssertEqual(vm.currentAmountText, "", "Current amount should be empty")
        XCTAssertFalse(vm.hasTargetDate, "Target date should be off by default")
        XCTAssertEqual(vm.notes, "", "Notes should be empty")
        XCTAssertEqual(vm.navigationTitle, "Create Goal",
                       "Title should reflect create mode")
        XCTAssertEqual(vm.saveButtonTitle, "Save",
                       "Save button should say Save in create mode")
    }
}
