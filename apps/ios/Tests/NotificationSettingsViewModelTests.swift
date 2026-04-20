// SPDX-License-Identifier: BUSL-1.1

// NotificationSettingsViewModelTests.swift
// FinanceTests
//
// Tests for NotificationSettingsViewModel — permission handling,
// schedule management, smart alert generation, and error handling.
//
// References: #305

import XCTest
import UserNotifications
@testable import FinanceApp

// MARK: - Stub Notification Scheduler

private final class StubNotificationScheduler: NotificationSchedulerProtocol, @unchecked Sendable {
    var permissionToReturn = true
    var authStatusToReturn: UNAuthorizationStatus = .notDetermined
    var errorToThrow: Error?
    private(set) var scheduledNotifications: [NotificationSchedule] = []
    private(set) var cancelledIds: [String] = []
    private(set) var allCancelled = false
    var smartAlertsToReturn: [SmartAlert] = []

    func requestPermission() async throws -> Bool {
        if let error = errorToThrow { throw error }
        return permissionToReturn
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        authStatusToReturn
    }

    func scheduleNotification(_ schedule: NotificationSchedule) async throws {
        if let error = errorToThrow { throw error }
        scheduledNotifications.append(schedule)
    }

    func cancelNotification(id: String) async {
        cancelledIds.append(id)
    }

    func cancelAllNotifications() async {
        allCancelled = true
    }

    func generateSmartAlerts(
        budgets: [BudgetItem],
        transactions: [TransactionItem],
        goals: [GoalItem]
    ) -> [SmartAlert] {
        smartAlertsToReturn
    }
}

// MARK: - Tests

final class NotificationSettingsViewModelTests: XCTestCase {

    @MainActor
    private func makeViewModel(
        scheduler: StubNotificationScheduler = StubNotificationScheduler(),
        budgets: [BudgetItem] = SampleData.allBudgets,
        transactions: [TransactionItem] = SampleData.allTransactions,
        goals: [GoalItem] = SampleData.allGoals
    ) -> (NotificationSettingsViewModel, StubNotificationScheduler) {
        let budgetRepo = StubBudgetRepository()
        budgetRepo.budgetsToReturn = budgets

        let transactionRepo = StubTransactionRepository()
        transactionRepo.transactionsToReturn = transactions

        let goalRepo = StubGoalRepository()
        goalRepo.goalsToReturn = goals

        let vm = NotificationSettingsViewModel(
            scheduler: scheduler,
            budgetRepository: budgetRepo,
            transactionRepository: transactionRepo,
            goalRepository: goalRepo
        )
        return (vm, scheduler)
    }

    @MainActor
    func testCheckPermissionUpdatesStatus() async {
        let scheduler = StubNotificationScheduler()
        scheduler.authStatusToReturn = .authorized
        let (vm, _) = makeViewModel(scheduler: scheduler)

        await vm.checkPermission()

        XCTAssertTrue(vm.permissionGranted)
        XCTAssertEqual(vm.permissionStatus, .authorized)
    }

    @MainActor
    func testCheckPermissionDenied() async {
        let scheduler = StubNotificationScheduler()
        scheduler.authStatusToReturn = .denied
        let (vm, _) = makeViewModel(scheduler: scheduler)

        await vm.checkPermission()

        XCTAssertFalse(vm.permissionGranted)
        XCTAssertEqual(vm.permissionStatus, .denied)
    }

    @MainActor
    func testRequestPermissionGranted() async {
        let scheduler = StubNotificationScheduler()
        scheduler.permissionToReturn = true
        let (vm, _) = makeViewModel(scheduler: scheduler)

        await vm.requestPermission()

        XCTAssertTrue(vm.permissionGranted)
    }

    @MainActor
    func testRequestPermissionDenied() async {
        let scheduler = StubNotificationScheduler()
        scheduler.permissionToReturn = false
        let (vm, _) = makeViewModel(scheduler: scheduler)

        await vm.requestPermission()

        XCTAssertFalse(vm.permissionGranted)
    }

    @MainActor
    func testRequestPermissionError() async {
        let scheduler = StubNotificationScheduler()
        scheduler.errorToThrow = TestError.simulated
        let (vm, _) = makeViewModel(scheduler: scheduler)

        await vm.requestPermission()

        XCTAssertNotNil(vm.errorMessage)
    }

    @MainActor
    func testToggleScheduleEnables() async {
        let (vm, scheduler) = makeViewModel()
        let schedule = vm.schedules.first { !$0.isEnabled }!

        await vm.toggleSchedule(schedule)

        let updated = vm.schedules.first { $0.id == schedule.id }
        XCTAssertTrue(updated?.isEnabled ?? false)
        XCTAssertFalse(scheduler.scheduledNotifications.isEmpty)
    }

    @MainActor
    func testToggleScheduleDisables() async {
        let (vm, scheduler) = makeViewModel()
        let schedule = vm.schedules.first { $0.isEnabled }!

        await vm.toggleSchedule(schedule)

        let updated = vm.schedules.first { $0.id == schedule.id }
        XCTAssertFalse(updated?.isEnabled ?? true)
        XCTAssertTrue(scheduler.cancelledIds.contains(schedule.id))
    }

    @MainActor
    func testDefaultSchedulesHaveAllTypes() {
        let defaults = NotificationSettingsViewModel.defaultSchedules
        let types = Set(defaults.map(\.type))

        XCTAssertEqual(types.count, NotificationType.allCases.count)
        for type in NotificationType.allCases {
            XCTAssertTrue(types.contains(type), "\(type) missing from defaults")
        }
    }

    @MainActor
    func testLoadSmartAlertsPopulates() async {
        let scheduler = StubNotificationScheduler()
        scheduler.smartAlertsToReturn = [
            SmartAlert(
                type: .budgetAlert,
                title: "Test Alert",
                body: "Test body",
                priority: .high
            ),
        ]
        let (vm, _) = makeViewModel(scheduler: scheduler)

        await vm.loadSmartAlerts()

        XCTAssertEqual(vm.smartAlerts.count, 1)
        XCTAssertEqual(vm.smartAlerts.first?.title, "Test Alert")
        XCTAssertFalse(vm.isLoading)
    }

    @MainActor
    func testDismissErrorClearsMessage() {
        let (vm, _) = makeViewModel()
        vm.errorMessage = "Test"
        XCTAssertTrue(vm.showError)

        vm.dismissError()
        XCTAssertFalse(vm.showError)
    }
}

// MARK: - Notification Model Tests

final class NotificationModelTests: XCTestCase {

    func testAlertPriorityComparable() {
        XCTAssertTrue(AlertPriority.low < .normal)
        XCTAssertTrue(AlertPriority.normal < .high)
        XCTAssertTrue(AlertPriority.high < .urgent)
    }

    func testNotificationTypeProperties() {
        for type in NotificationType.allCases {
            XCTAssertFalse(type.displayName.isEmpty)
            XCTAssertFalse(type.description.isEmpty)
            XCTAssertFalse(type.systemImage.isEmpty)
            XCTAssertTrue(type.categoryIdentifier.hasPrefix("finance."))
        }
    }

    func testNotificationFrequencyDisplayNames() {
        for freq in NotificationFrequency.allCases {
            XCTAssertFalse(freq.displayName.isEmpty)
        }
    }

    func testScheduleDefaultValues() {
        let schedule = NotificationSchedule(type: .budgetAlert)
        XCTAssertTrue(schedule.isEnabled)
        XCTAssertEqual(schedule.frequency, .daily)
        XCTAssertEqual(schedule.scheduledHour, 9)
        XCTAssertEqual(schedule.scheduledMinute, 0)
    }
}
