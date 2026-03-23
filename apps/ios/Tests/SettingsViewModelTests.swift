// SPDX-License-Identifier: BUSL-1.1

// SettingsViewModelTests.swift
// FinanceTests
//
// Tests for SettingsViewModel — settings persistence via UserDefaults,
// data export orchestration, and sync status management. Refs #565

import XCTest
@testable import FinanceApp

final class SettingsViewModelTests: XCTestCase {

    /// Dedicated UserDefaults suite for test isolation — each test gets
    /// a clean slate without affecting the standard suite.
    private var testDefaults: UserDefaults!

    override func setUp() {
        super.setUp()
        testDefaults = UserDefaults(suiteName: "com.finance.tests.settings")!
        testDefaults.removePersistentDomain(forName: "com.finance.tests.settings")
    }

    override func tearDown() {
        testDefaults.removePersistentDomain(forName: "com.finance.tests.settings")
        testDefaults = nil
        super.tearDown()
    }

    // MARK: - Persistence: Defaults

    @MainActor
    func testDefaultValuesOnFirstLaunch() {
        let vm = makeViewModel()

        XCTAssertEqual(vm.selectedCurrency, "USD", "Currency should default to USD")
        XCTAssertTrue(vm.notificationsEnabled, "Notifications should default to enabled")
        XCTAssertTrue(vm.budgetAlertsEnabled, "Budget alerts should default to enabled")
        XCTAssertTrue(vm.goalMilestonesEnabled, "Goal milestones should default to enabled")
    }

    // MARK: - Persistence: Currency

    @MainActor
    func testCurrencyPersistsToUserDefaults() {
        let vm = makeViewModel()

        vm.selectedCurrency = "EUR"

        XCTAssertEqual(
            testDefaults.string(forKey: "finance_currency"), "EUR",
            "Currency selection should be written to UserDefaults"
        )
    }

    @MainActor
    func testCurrencyRestoredFromUserDefaults() {
        testDefaults.set("GBP", forKey: "finance_currency")

        let vm = makeViewModel()

        XCTAssertEqual(vm.selectedCurrency, "GBP",
                       "Currency should be restored from UserDefaults")
    }

    // MARK: - Persistence: Notifications

    @MainActor
    func testNotificationsTogglePersists() {
        let vm = makeViewModel()

        vm.notificationsEnabled = false

        XCTAssertFalse(
            testDefaults.bool(forKey: "finance_notifications"),
            "Notifications toggle should be written to UserDefaults"
        )
    }

    @MainActor
    func testNotificationsRestoredFromUserDefaults() {
        testDefaults.set(false, forKey: "finance_notifications")

        let vm = makeViewModel()

        XCTAssertFalse(vm.notificationsEnabled,
                       "Notifications state should be restored from UserDefaults")
    }

    // MARK: - Persistence: Budget Alerts

    @MainActor
    func testBudgetAlertsPersists() {
        let vm = makeViewModel()

        vm.budgetAlertsEnabled = false

        XCTAssertFalse(
            testDefaults.bool(forKey: "finance_budget_alerts"),
            "Budget alerts toggle should be written to UserDefaults"
        )
    }

    @MainActor
    func testBudgetAlertsRestoredFromUserDefaults() {
        testDefaults.set(false, forKey: "finance_budget_alerts")

        let vm = makeViewModel()

        XCTAssertFalse(vm.budgetAlertsEnabled,
                       "Budget alerts state should be restored from UserDefaults")
    }

    // MARK: - Persistence: Goal Milestones

    @MainActor
    func testGoalMilestonesPersists() {
        let vm = makeViewModel()

        vm.goalMilestonesEnabled = false

        XCTAssertFalse(
            testDefaults.bool(forKey: "finance_goal_milestones"),
            "Goal milestones toggle should be written to UserDefaults"
        )
    }

    @MainActor
    func testGoalMilestonesRestoredFromUserDefaults() {
        testDefaults.set(false, forKey: "finance_goal_milestones")

        let vm = makeViewModel()

        XCTAssertFalse(vm.goalMilestonesEnabled,
                       "Goal milestones state should be restored from UserDefaults")
    }

    // MARK: - Export: JSON

    @MainActor
    func testExportJSONSetsFileURL() async {
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = SampleData.allAccounts
        let txRepo = StubTransactionRepository()
        txRepo.transactionsToReturn = SampleData.allTransactions
        let budgetRepo = StubBudgetRepository()
        budgetRepo.budgetsToReturn = SampleData.allBudgets
        let goalRepo = StubGoalRepository()
        goalRepo.goalsToReturn = SampleData.allGoals

        let vm = makeViewModel(
            accountRepository: accountRepo,
            transactionRepository: txRepo,
            budgetRepository: budgetRepo,
            goalRepository: goalRepo
        )

        await vm.exportData(format: .json)

        XCTAssertNotNil(vm.exportedFileURL, "Exported file URL should be set after JSON export")
        XCTAssertTrue(vm.showingShareSheet, "Share sheet should be shown after export")
        XCTAssertFalse(vm.isExporting, "isExporting should be false after export completes")

        if let url = vm.exportedFileURL {
            XCTAssertEqual(url.pathExtension, "json", "Export file should have .json extension")
            // Clean up temp file
            try? FileManager.default.removeItem(at: url)
        }
    }

    // MARK: - Export: CSV

    @MainActor
    func testExportCSVSetsFileURL() async {
        let txRepo = StubTransactionRepository()
        txRepo.transactionsToReturn = SampleData.allTransactions

        let vm = makeViewModel(transactionRepository: txRepo)

        await vm.exportData(format: .csv)

        XCTAssertNotNil(vm.exportedFileURL, "Exported file URL should be set after CSV export")
        XCTAssertTrue(vm.showingShareSheet, "Share sheet should be shown after export")
        XCTAssertFalse(vm.isExporting, "isExporting should be false after export completes")

        if let url = vm.exportedFileURL {
            XCTAssertEqual(url.pathExtension, "csv", "Export file should have .csv extension")
            try? FileManager.default.removeItem(at: url)
        }
    }

    // MARK: - Export: Error Handling

    @MainActor
    func testExportCSVWithNoTransactionsShowsError() async {
        let txRepo = StubTransactionRepository()
        txRepo.transactionsToReturn = []

        let vm = makeViewModel(transactionRepository: txRepo)

        await vm.exportData(format: .csv)

        XCTAssertNil(vm.exportedFileURL, "File URL should be nil on export error")
        XCTAssertTrue(vm.showingExportError, "Export error alert should be shown")
        XCTAssertNotNil(vm.exportErrorMessage, "Error message should be populated")
    }

    @MainActor
    func testExportWithRepositoryErrorShowsError() async {
        let txRepo = StubTransactionRepository()
        txRepo.errorToThrow = TestError.simulated

        let vm = makeViewModel(transactionRepository: txRepo)

        await vm.exportData(format: .csv)

        XCTAssertNil(vm.exportedFileURL, "File URL should be nil when repository throws")
        XCTAssertTrue(vm.showingExportError, "Export error alert should be shown")
    }

    // MARK: - Sync

    @MainActor
    func testSyncNowUpdatesLastSyncDate() async {
        let vm = makeViewModel()

        XCTAssertNil(vm.lastSyncDate, "Last sync date should be nil before first sync")

        await vm.syncNow()

        XCTAssertNotNil(vm.lastSyncDate, "Last sync date should be set after sync")
        XCTAssertFalse(vm.isSyncing, "isSyncing should be false after sync completes")
        XCTAssertEqual(vm.pendingChangesCount, 0, "Pending changes should be 0 after sync")

        // Verify persistence
        let persisted = testDefaults.object(forKey: "finance_last_sync_date") as? Date
        XCTAssertNotNil(persisted, "Last sync date should be persisted to UserDefaults")
    }

    @MainActor
    func testSyncRestoredFromUserDefaults() {
        let syncDate = Date(timeIntervalSince1970: 1_700_000_000)
        testDefaults.set(syncDate, forKey: "finance_last_sync_date")
        testDefaults.set(3, forKey: "finance_pending_changes_count")

        let vm = makeViewModel()

        XCTAssertEqual(
            vm.lastSyncDate?.timeIntervalSince1970,
            syncDate.timeIntervalSince1970,
            accuracy: 1.0,
            "Sync date should be restored from UserDefaults"
        )
        XCTAssertEqual(vm.pendingChangesCount, 3,
                       "Pending changes count should be restored from UserDefaults")
    }

    // MARK: - Helpers

    @MainActor
    private func makeViewModel(
        accountRepository: AccountRepository = StubAccountRepository(),
        transactionRepository: TransactionRepository = StubTransactionRepository(),
        budgetRepository: BudgetRepository = StubBudgetRepository(),
        goalRepository: GoalRepository = StubGoalRepository()
    ) -> SettingsViewModel {
        SettingsViewModel(
            accountRepository: accountRepository,
            transactionRepository: transactionRepository,
            budgetRepository: budgetRepository,
            goalRepository: goalRepository,
            defaults: testDefaults
        )
    }
}
