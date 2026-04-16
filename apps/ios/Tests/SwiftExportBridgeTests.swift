// SPDX-License-Identifier: BUSL-1.1
// SwiftExportBridgeTests.swift — Unit tests for the Swift Export bridge layer.
//
// Tests cover:
//   - Bridge provider initialisation and module availability
//   - Stub module CRUD operations for all domain types
//   - Aggregator module calculations
//   - Formatter module output correctness
//   - Bridged repository adapters delegating correctly
//   - Transaction validation and category suggestion
//   - Sync module stub behaviour
//
// References: #414

import Foundation
import Testing
@testable import FinanceApp

// MARK: - Bridge Provider Tests

@Suite("SwiftExportBridgeProvider")
struct SwiftExportBridgeProviderTests {

    @Test("shared instance is available")
    func sharedInstanceAvailable() {
        let provider = SwiftExportBridgeProvider.shared
        #expect(provider.bridge is StubSwiftExportBridge)
    }

    @Test("all modules are accessible via provider")
    func allModulesAccessible() {
        let provider = SwiftExportBridgeProvider.shared
        // Verify each module is non-nil and of expected type
        #expect(provider.accounts is StubAccountModule)
        #expect(provider.transactions is StubTransactionModule)
        #expect(provider.budgets is StubBudgetModule)
        #expect(provider.goals is StubGoalModule)
        #expect(provider.categories is StubCategoryModule)
        #expect(provider.aggregator is StubAggregatorModule)
        #expect(provider.formatter is StubFormatterModule)
        #expect(provider.sync is StubSyncModule)
    }

    @Test("custom bridge injection works")
    func customBridgeInjection() {
        let stubBridge = StubSwiftExportBridge()
        let provider = SwiftExportBridgeProvider(bridge: stubBridge)
        #expect(!provider.bridge.isKMPAvailable)
    }
}

// MARK: - Stub Bridge Tests

@Suite("StubSwiftExportBridge")
struct StubSwiftExportBridgeTests {

    @Test("isKMPAvailable returns false")
    func kmpNotAvailable() {
        let bridge = StubSwiftExportBridge()
        #expect(!bridge.isKMPAvailable)
    }
}

// MARK: - Account Module Tests

@Suite("StubAccountModule")
struct StubAccountModuleTests {

    @Test("getAccounts returns seeded data")
    @MainActor func getAccountsReturnsData() async throws {
        let store = LocalDataStore()
        let module = StubAccountModule(store: store)
        let accounts = try await module.getAccounts()
        #expect(!accounts.isEmpty)
    }

    @Test("getAllAccounts includes archived")
    @MainActor func getAllAccountsIncludesArchived() async throws {
        let store = LocalDataStore()
        let module = StubAccountModule(store: store)
        _ = try await module.getAccounts() // seed

        let account = AccountItem(
            id: "test-archived",
            name: "Archived Account",
            balanceMinorUnits: 10000,
            currencyCode: "USD",
            type: .savings,
            icon: "banknote",
            isArchived: true
        )
        try await module.createAccount(account)

        let all = try await module.getAllAccounts()
        #expect(all.contains { $0.id == "test-archived" })
    }

    @Test("CRUD cycle: create, read, update, delete")
    @MainActor func crudCycle() async throws {
        let store = LocalDataStore()
        let module = StubAccountModule(store: store)

        let account = AccountItem(
            id: "crud-test",
            name: "Test Checking",
            balanceMinorUnits: 50000,
            currencyCode: "USD",
            type: .checking,
            icon: "building.columns",
            isArchived: false
        )

        // Create
        try await module.createAccount(account)
        let fetched = try await module.getAccount(id: "crud-test")
        #expect(fetched?.name == "Test Checking")

        // Update
        let updated = AccountItem(
            id: "crud-test",
            name: "Updated Checking",
            balanceMinorUnits: 60000,
            currencyCode: "USD",
            type: .checking,
            icon: "building.columns",
            isArchived: false
        )
        try await module.updateAccount(updated)
        let reFetched = try await module.getAccount(id: "crud-test")
        #expect(reFetched?.name == "Updated Checking")

        // Archive / Unarchive
        try await module.archiveAccount(id: "crud-test")
        let archived = try await module.getAccount(id: "crud-test")
        #expect(archived?.isArchived == true)

        try await module.unarchiveAccount(id: "crud-test")
        let unarchived = try await module.getAccount(id: "crud-test")
        #expect(unarchived?.isArchived == false)

        // Delete
        try await module.deleteAccount(id: "crud-test")
        let deleted = try await module.getAccount(id: "crud-test")
        #expect(deleted == nil)
    }

    @Test("deleteAllAccounts clears all data")
    @MainActor func deleteAllAccounts() async throws {
        let store = LocalDataStore()
        let module = StubAccountModule(store: store)

        // Seed data first
        _ = try await module.getAccounts()
        try await module.deleteAllAccounts()

        let remaining = try await module.getAllAccounts()
        #expect(remaining.isEmpty)
    }
}

// MARK: - Transaction Module Tests

@Suite("StubTransactionModule")
struct StubTransactionModuleTests {

    @Test("getTransactions returns seeded data")
    @MainActor func getTransactionsReturnsData() async throws {
        let store = LocalDataStore()
        let module = StubTransactionModule(store: store)
        let txns = try await module.getTransactions()
        #expect(!txns.isEmpty)
    }

    @Test("paginated transactions respect offset and limit")
    @MainActor func paginatedTransactions() async throws {
        let store = LocalDataStore()
        let module = StubTransactionModule(store: store)

        let page = try await module.getTransactions(offset: 0, limit: 2)
        #expect(page.count <= 2)
    }

    @Test("recent transactions respect limit")
    @MainActor func recentTransactions() async throws {
        let store = LocalDataStore()
        let module = StubTransactionModule(store: store)

        let recent = try await module.getRecentTransactions(limit: 3)
        #expect(recent.count <= 3)
    }

    @Test("validate detects zero amount")
    @MainActor func validateZeroAmount() async throws {
        let store = LocalDataStore()
        let module = StubTransactionModule(store: store)

        let txn = TransactionItem(
            id: "val-test",
            payee: "Test",
            category: "food",
            accountName: "Checking",
            amountMinorUnits: 0,
            currencyCode: "USD",
            date: .now
        )

        let errors = module.validate(txn, accountIds: ["Checking"], categoryIds: ["food"])
        #expect(!errors.isEmpty)
    }

    @Test("suggestCategory returns nil for empty payee")
    @MainActor func suggestCategoryEmpty() async throws {
        let store = LocalDataStore()
        let module = StubTransactionModule(store: store)
        let suggestion = module.suggestCategory(forPayee: "")
        #expect(suggestion == nil)
    }

    @Test("learnCategoryMapping enables future suggestions")
    @MainActor func learnCategoryMapping() async throws {
        let store = LocalDataStore()
        let module = StubTransactionModule(store: store)

        module.learnCategoryMapping(payee: "Starbucks", categoryId: "food")
        let suggestion = module.suggestCategory(forPayee: "Starbucks")
        #expect(suggestion == "food")
    }
}

// MARK: - Budget Module Tests

@Suite("StubBudgetModule")
struct StubBudgetModuleTests {

    @Test("getBudgets returns seeded data")
    @MainActor func getBudgetsReturnsData() async throws {
        let store = LocalDataStore()
        let module = StubBudgetModule(store: store)
        let budgets = try await module.getBudgets()
        #expect(!budgets.isEmpty)
    }

    @Test("dailyBudgetRate calculation")
    @MainActor func dailyBudgetRate() async throws {
        let store = LocalDataStore()
        let module = StubBudgetModule(store: store)
        let rate = module.dailyBudgetRate(budgetAmount: 100000, spent: 50000, daysRemaining: 10)
        #expect(rate == 5000) // (100000 - 50000) / 10
    }

    @Test("dailyBudgetRate returns zero when over budget")
    @MainActor func dailyBudgetRateOverBudget() async throws {
        let store = LocalDataStore()
        let module = StubBudgetModule(store: store)
        let rate = module.dailyBudgetRate(budgetAmount: 50000, spent: 60000, daysRemaining: 10)
        #expect(rate == 0)
    }
}

// MARK: - Goal Module Tests

@Suite("StubGoalModule")
struct StubGoalModuleTests {

    @Test("getGoals returns data")
    @MainActor func getGoalsReturnsData() async throws {
        let module = StubGoalModule()
        let goals = try await module.getGoals()
        #expect(!goals.isEmpty)
    }
}

// MARK: - Category Module Tests

@Suite("StubCategoryModule")
struct StubCategoryModuleTests {

    @Test("getCategories returns data")
    @MainActor func getCategoriesReturnsData() async throws {
        let module = StubCategoryModule()
        let categories = try await module.getCategories()
        #expect(!categories.isEmpty)
    }
}

// MARK: - Aggregator Module Tests

@Suite("StubAggregatorModule")
struct StubAggregatorModuleTests {

    private static func makeTestAccounts() -> [AccountItem] {
        [
            AccountItem(id: "1", name: "Checking", balanceMinorUnits: 100000, currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false),
            AccountItem(id: "2", name: "Savings", balanceMinorUnits: 500000, currencyCode: "USD", type: .savings, icon: "banknote", isArchived: false),
            AccountItem(id: "3", name: "Credit Card", balanceMinorUnits: 25000, currencyCode: "USD", type: .creditCard, icon: "creditcard", isArchived: false),
        ]
    }

    private static func makeTestTransactions() -> [TransactionItem] {
        let cal = Calendar.current
        let today = Date.now
        return [
            TransactionItem(id: "t1", payee: "Grocery Store", category: "Food", amountMinorUnits: 5000, currencyCode: "USD", date: today, type: .expense),
            TransactionItem(id: "t2", payee: "Salary", category: "Income", amountMinorUnits: 300000, currencyCode: "USD", date: today, type: .income),
            TransactionItem(id: "t3", payee: "Gas Station", category: "Transport", amountMinorUnits: 4000, currencyCode: "USD", date: today, type: .expense),
        ]
    }

    @Test("netWorth calculates correctly")
    func netWorthCalculation() {
        let module = StubAggregatorModule()
        let accounts = Self.makeTestAccounts()
        let netWorth = module.netWorth(accounts: accounts)
        // checking (100000) + savings (500000) - creditCard (25000) = 575000
        #expect(netWorth == 575000)
    }

    @Test("totalSpending sums expenses")
    func totalSpendingCalculation() {
        let module = StubAggregatorModule()
        let txns = Self.makeTestTransactions()
        let cal = Calendar.current
        let from = cal.startOfDay(for: .now)
        let to = cal.date(byAdding: .day, value: 1, to: from) ?? .now
        let spending = module.totalSpending(transactions: txns, from: from, to: to)
        #expect(spending == 9000) // 5000 + 4000
    }

    @Test("totalIncome sums income")
    func totalIncomeCalculation() {
        let module = StubAggregatorModule()
        let txns = Self.makeTestTransactions()
        let cal = Calendar.current
        let from = cal.startOfDay(for: .now)
        let to = cal.date(byAdding: .day, value: 1, to: from) ?? .now
        let income = module.totalIncome(transactions: txns, from: from, to: to)
        #expect(income == 300000)
    }

    @Test("savingsRate computes percentage")
    func savingsRateCalculation() {
        let module = StubAggregatorModule()
        let txns = Self.makeTestTransactions()
        let cal = Calendar.current
        let from = cal.startOfDay(for: .now)
        let to = cal.date(byAdding: .day, value: 1, to: from) ?? .now
        let rate = module.savingsRate(transactions: txns, from: from, to: to)
        // (300000 - 9000) / 300000 * 100 = 97.0
        #expect(rate == 97.0)
    }
}

// MARK: - Formatter Module Tests

@Suite("StubFormatterModule")
struct StubFormatterModuleTests {

    @Test("format produces correct output for USD")
    func formatUSD() {
        let module = StubFormatterModule()
        let result = module.format(amountMinorUnits: 12345, currencyCode: "USD", showSign: false)
        #expect(result == "$123.45")
    }

    @Test("format with sign for positive amount")
    func formatWithSign() {
        let module = StubFormatterModule()
        let result = module.format(amountMinorUnits: 5000, currencyCode: "USD", showSign: true)
        #expect(result == "+$50.00")
    }

    @Test("format negative amount")
    func formatNegative() {
        let module = StubFormatterModule()
        let result = module.format(amountMinorUnits: -2500, currencyCode: "USD", showSign: false)
        #expect(result == "-$25.00")
    }

    @Test("formatCompact for large amounts")
    func formatCompact() {
        let module = StubFormatterModule()
        let result = module.formatCompact(amountMinorUnits: 150000000, currencyCode: "USD")
        #expect(result.contains("M") || result.contains("K"))
    }

    @Test("format JPY zero-decimal currency")
    func formatJPY() {
        let module = StubFormatterModule()
        let result = module.format(amountMinorUnits: 1500, currencyCode: "JPY", showSign: false)
        #expect(result == "¥1500")
    }
}

// MARK: - Sync Module Tests

@Suite("StubSyncModule")
struct StubSyncModuleTests {

    @Test("isAuthenticated returns false")
    func notAuthenticated() {
        let module = StubSyncModule()
        #expect(!module.isAuthenticated)
    }

    @Test("pendingMutationCount is zero")
    func zeroPendingMutations() {
        let module = StubSyncModule()
        #expect(module.pendingMutationCount == 0)
    }

    @Test("syncNow returns success")
    func syncNowSuccess() async {
        let module = StubSyncModule()
        let result = await module.syncNow()
        if case .success = result {
            // Expected
        } else {
            Issue.record("Expected success result")
        }
    }

    @Test("observeSyncStatus emits idle then finishes")
    func observeSyncStatus() async {
        let module = StubSyncModule()
        var statuses: [KMPSyncStatus] = []
        for await status in module.observeSyncStatus() {
            statuses.append(status)
        }
        #expect(statuses.count == 1)
        if case .idle = statuses.first {
            // Expected
        } else {
            Issue.record("Expected idle status")
        }
    }
}

// MARK: - Bridged Repository Adapter Tests

@Suite("BridgedRepositoryAdapters")
struct BridgedRepositoryAdapterTests {

    @Test("BridgedAccountRepository delegates to module")
    @MainActor func bridgedAccountRepository() async throws {
        let repo = BridgedAccountRepository()
        let accounts = try await repo.getAccounts()
        #expect(!accounts.isEmpty)
    }

    @Test("BridgedTransactionRepository delegates to module")
    @MainActor func bridgedTransactionRepository() async throws {
        let repo = BridgedTransactionRepository()
        let txns = try await repo.getTransactions()
        #expect(!txns.isEmpty)
    }

    @Test("BridgedBudgetRepository delegates to module")
    @MainActor func bridgedBudgetRepository() async throws {
        let repo = BridgedBudgetRepository()
        let budgets = try await repo.getBudgets()
        #expect(!budgets.isEmpty)
    }

    @Test("BridgedGoalRepository delegates to module")
    @MainActor func bridgedGoalRepository() async throws {
        let repo = BridgedGoalRepository()
        let goals = try await repo.getGoals()
        #expect(!goals.isEmpty)
    }

    @Test("BridgedCategoryRepository delegates to module")
    @MainActor func bridgedCategoryRepository() async throws {
        let repo = BridgedCategoryRepository()
        let categories = try await repo.getCategories()
        #expect(!categories.isEmpty)
    }
}

// MARK: - Bridge Error Tests

@Suite("SwiftExportBridgeError")
struct SwiftExportBridgeErrorTests {

    @Test("moduleUnavailable includes module name")
    func moduleUnavailableMessage() {
        let error = SwiftExportBridgeError.moduleUnavailable("AccountModule")
        #expect(error.localizedDescription.contains("AccountModule"))
    }

    @Test("kmpCallFailed wraps underlying message")
    func kmpCallFailedMessage() {
        let error = SwiftExportBridgeError.kmpCallFailed(underlying: "timeout")
        #expect(error.localizedDescription.contains("timeout"))
    }

    @Test("typeMappingFailed includes source and target")
    func typeMappingFailedMessage() {
        let error = SwiftExportBridgeError.typeMappingFailed(source: "KotlinInt", target: "SwiftInt")
        #expect(error.localizedDescription.contains("KotlinInt"))
        #expect(error.localizedDescription.contains("SwiftInt"))
    }
}
