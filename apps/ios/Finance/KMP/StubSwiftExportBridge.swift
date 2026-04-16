// SPDX-License-Identifier: BUSL-1.1
// StubSwiftExportBridge.swift — In-process stub of the Swift Export bridge.
//
// Provides a fully functional implementation of `SwiftExportBridge` backed
// by the actor-isolated `LocalDataStore`. Used when:
//   - The FinanceSync XCFramework is not linked (development on non-Mac hosts)
//   - Running unit tests that need deterministic, fast data access
//   - SwiftUI previews
//
// All business logic (aggregation, budget calculations, validation) delegates
// to the existing KMP stub implementations to maintain parity.
//
// References: #414, #289

import Foundation
import os

// MARK: - StubSwiftExportBridge

/// Stub bridge used when the real KMP XCFramework is unavailable.
///
/// Thread-safe: all data access delegates to the actor-isolated
/// `LocalDataStore`. Protocol-conforming modules are `Sendable` structs.
final class StubSwiftExportBridge: SwiftExportBridge, @unchecked Sendable {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "StubSwiftExportBridge"
    )

    let isKMPAvailable: Bool = false

    let accounts: any SwiftExportAccountModule
    let transactions: any SwiftExportTransactionModule
    let budgets: any SwiftExportBudgetModule
    let goals: any SwiftExportGoalModule
    let categories: any SwiftExportCategoryModule
    let aggregator: any SwiftExportAggregatorModule
    let formatter: any SwiftExportFormatterModule
    let sync: any SwiftExportSyncModule

    init(store: LocalDataStore = .shared) {
        let accountModule = StubAccountModule(store: store)
        let transactionModule = StubTransactionModule(store: store)
        let budgetModule = StubBudgetModule(store: store)
        let goalModule = StubGoalModule()
        let categoryModule = StubCategoryModule()

        self.accounts = accountModule
        self.transactions = transactionModule
        self.budgets = budgetModule
        self.goals = goalModule
        self.categories = categoryModule
        self.aggregator = StubAggregatorModule()
        self.formatter = StubFormatterModule()
        self.sync = StubSyncModule()

        Self.logger.info("StubSwiftExportBridge initialised")
    }
}

// MARK: - Stub Account Module

struct StubAccountModule: SwiftExportAccountModule, Sendable {
    private let store: LocalDataStore

    init(store: LocalDataStore) { self.store = store }

    func getAccounts() async throws -> [AccountItem] {
        await store.seedIfNeeded()
        return await store.getAccounts()
    }

    func getAllAccounts() async throws -> [AccountItem] {
        await store.seedIfNeeded()
        return await store.getAllAccounts()
    }

    func getAccount(id: String) async throws -> AccountItem? {
        await store.seedIfNeeded()
        return await store.getAccount(id: id)
    }

    func createAccount(_ account: AccountItem) async throws {
        await store.upsertAccount(account)
    }

    func updateAccount(_ account: AccountItem) async throws {
        await store.upsertAccount(account)
    }

    func archiveAccount(id: String) async throws {
        await store.archiveAccount(id: id)
    }

    func unarchiveAccount(id: String) async throws {
        await store.unarchiveAccount(id: id)
    }

    func deleteAccount(id: String) async throws {
        await store.deleteAccount(id: id)
    }

    func deleteAllAccounts() async throws {
        await store.deleteAllAccounts()
    }
}

// MARK: - Stub Transaction Module

struct StubTransactionModule: SwiftExportTransactionModule, Sendable {
    private let store: LocalDataStore
    private let validator = StubTransactionValidator()
    private let categorizationEngine = StubCategorizationEngine()

    init(store: LocalDataStore) { self.store = store }

    func getTransactions() async throws -> [TransactionItem] {
        await store.seedIfNeeded()
        return await store.getTransactions()
    }

    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] {
        await store.seedIfNeeded()
        return await store.getTransactions(offset: offset, limit: limit)
    }

    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] {
        await store.seedIfNeeded()
        return await store.getTransactions(forAccountId: accountId)
    }

    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] {
        await store.seedIfNeeded()
        return await store.getRecentTransactions(limit: limit)
    }

    func createTransaction(_ transaction: TransactionItem) async throws {
        await store.upsertTransaction(transaction)
    }

    func updateTransaction(_ transaction: TransactionItem) async throws {
        await store.upsertTransaction(transaction)
    }

    func deleteTransaction(id: String) async throws {
        await store.deleteTransaction(id: id)
    }

    func deleteAllTransactions() async throws {
        await store.deleteAllTransactions()
    }

    func validate(
        _ transaction: TransactionItem,
        accountIds: Set<String>,
        categoryIds: Set<String>
    ) -> [String] {
        let kmpTransaction = transaction.toKMP(
            householdId: "default",
            accountId: transaction.accountName,
            categoryId: transaction.category.isEmpty ? nil : transaction.category
        )
        return validator.validate(
            transaction: kmpTransaction,
            existingAccountIds: accountIds,
            existingCategoryIds: categoryIds
        )
    }

    func suggestCategory(forPayee payee: String) -> String? {
        categorizationEngine.suggest(payee: payee)
    }

    func learnCategoryMapping(payee: String, categoryId: String) {
        categorizationEngine.learnFromHistory(payee: payee, categoryId: categoryId)
    }
}

// MARK: - Stub Budget Module

struct StubBudgetModule: SwiftExportBudgetModule, Sendable {
    private let store: LocalDataStore
    private let calculator = StubBudgetCalculator()

    init(store: LocalDataStore) { self.store = store }

    func getBudgets() async throws -> [BudgetItem] {
        await store.seedIfNeeded()
        return await store.getBudgets()
    }

    func createBudget(_ budget: BudgetItem) async throws {
        await store.upsertBudget(budget)
    }

    func updateBudget(_ budget: BudgetItem) async throws {
        await store.upsertBudget(budget)
    }

    func deleteAllBudgets() async throws {
        await store.deleteAllBudgets()
    }

    func calculateStatus(
        budget: KMPBudget,
        transactions: [KMPTransaction],
        referenceDate: DateComponents
    ) -> KMPBudgetStatus {
        calculator.calculateStatus(
            budget: budget,
            transactions: transactions,
            referenceDate: referenceDate
        )
    }

    func dailyBudgetRate(budgetAmount: Int64, spent: Int64, daysRemaining: Int) -> Int64 {
        calculator.dailyBudgetRate(
            budgetAmount: budgetAmount,
            spent: spent,
            daysRemaining: daysRemaining
        )
    }
}

// MARK: - Stub Goal Module

struct StubGoalModule: SwiftExportGoalModule, Sendable {
    private let mockRepo = MockGoalRepository()

    func getGoals() async throws -> [GoalItem] {
        try await mockRepo.getGoals()
    }

    func createGoal(_ goal: GoalItem) async throws {
        try await mockRepo.createGoal(goal)
    }

    func updateGoal(_ goal: GoalItem) async throws {
        try await mockRepo.updateGoal(goal)
    }

    func deleteAllGoals() async throws {
        try await mockRepo.deleteAllGoals()
    }
}

// MARK: - Stub Category Module

struct StubCategoryModule: SwiftExportCategoryModule, Sendable {
    private let mockRepo = MockCategoryRepository()

    func getCategories() async throws -> [CategoryItem] {
        try await mockRepo.getCategories()
    }

    func getCategory(id: String) async throws -> CategoryItem? {
        try await mockRepo.getCategory(id: id)
    }

    func createCategory(_ category: CategoryItem) async throws {
        try await mockRepo.createCategory(category)
    }

    func updateCategory(_ category: CategoryItem) async throws {
        try await mockRepo.updateCategory(category)
    }

    func deleteCategory(id: String) async throws {
        try await mockRepo.deleteCategory(id: id)
    }
}

// MARK: - Stub Aggregator Module

struct StubAggregatorModule: SwiftExportAggregatorModule, Sendable {
    private let aggregator = StubFinancialAggregator()

    func netWorth(accounts: [AccountItem]) -> Int64 {
        let kmpAccounts = accounts.map { $0.toKMP(householdId: "default") }
        return aggregator.netWorth(accounts: kmpAccounts)
    }

    func totalSpending(transactions: [TransactionItem], from: Date, to: Date) -> Int64 {
        let kmpTxns = transactions.map { $0.toKMP(householdId: "default", accountId: "", categoryId: nil) }
        return aggregator.totalSpending(
            transactions: kmpTxns,
            from: KMPDateConversion.componentsFromDate(from),
            to: KMPDateConversion.componentsFromDate(to)
        )
    }

    func totalIncome(transactions: [TransactionItem], from: Date, to: Date) -> Int64 {
        let kmpTxns = transactions.map { $0.toKMP(householdId: "default", accountId: "", categoryId: nil) }
        return aggregator.totalIncome(
            transactions: kmpTxns,
            from: KMPDateConversion.componentsFromDate(from),
            to: KMPDateConversion.componentsFromDate(to)
        )
    }

    func netCashFlow(transactions: [TransactionItem], from: Date, to: Date) -> Int64 {
        let kmpTxns = transactions.map { $0.toKMP(householdId: "default", accountId: "", categoryId: nil) }
        return aggregator.netCashFlow(
            transactions: kmpTxns,
            from: KMPDateConversion.componentsFromDate(from),
            to: KMPDateConversion.componentsFromDate(to)
        )
    }

    func spendingByCategory(transactions: [TransactionItem], from: Date, to: Date) -> [String: Int64] {
        let kmpTxns = transactions.map { $0.toKMP(householdId: "default", accountId: "", categoryId: nil) }
        return aggregator.spendingByCategory(
            transactions: kmpTxns,
            from: KMPDateConversion.componentsFromDate(from),
            to: KMPDateConversion.componentsFromDate(to)
        )
    }

    func savingsRate(transactions: [TransactionItem], from: Date, to: Date) -> Double {
        let kmpTxns = transactions.map { $0.toKMP(householdId: "default", accountId: "", categoryId: nil) }
        return aggregator.savingsRate(
            transactions: kmpTxns,
            from: KMPDateConversion.componentsFromDate(from),
            to: KMPDateConversion.componentsFromDate(to)
        )
    }
}

// MARK: - Stub Formatter Module

struct StubFormatterModule: SwiftExportFormatterModule, Sendable {
    private let formatter = StubCurrencyFormatter()

    func format(amountMinorUnits: Int64, currencyCode: String, showSign: Bool) -> String {
        formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: showSign
        )
    }

    func formatCompact(amountMinorUnits: Int64, currencyCode: String) -> String {
        formatter.formatCompact(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode
        )
    }
}

// MARK: - Stub Sync Module

struct StubSyncModule: SwiftExportSyncModule, Sendable {
    var isAuthenticated: Bool { false }
    var pendingMutationCount: Int { 0 }

    func start() async {}
    func stop() async {}

    func syncNow() async -> KMPSyncResult {
        .success(changesApplied: 0, mutationsPushed: 0, conflictsResolved: 0, durationMs: 0)
    }

    func signOut() async {}

    func observeSyncStatus() -> AsyncStream<KMPSyncStatus> {
        AsyncStream { continuation in
            continuation.yield(.idle)
            continuation.finish()
        }
    }
}
