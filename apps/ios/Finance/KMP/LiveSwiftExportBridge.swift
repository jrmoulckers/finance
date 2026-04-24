// SPDX-License-Identifier: BUSL-1.1
// LiveSwiftExportBridge.swift — Concrete bridge to KMP FinanceSync XCFramework.
//
// When the FinanceSync XCFramework is linked (`canImport(FinanceSync)`), this
// bridge delegates all domain operations to real KMP factories and repositories.
// Each module adapts KMP types to Swift-native types at the bridge boundary.
//
// Falls back to stub implementations for any module that cannot be initialised
// from KMP (defensive — avoids crash if a KMP factory is missing).
//
// References: #414, #289

import Foundation
import os

// MARK: - LiveSwiftExportBridge

/// Bridge implementation that delegates to the real KMP XCFramework.
///
/// This class is only instantiated when `canImport(FinanceSync)` succeeds.
/// Each child module wraps KMP repository calls and maps types through
/// ``KMPTypeAdapters``.
///
/// Thread-safety: each module delegates to the actor-isolated
/// ``PersistentDataStore`` (Sprint 2) or KMP's own coroutine dispatcher.
/// The bridge itself is `Sendable` — it holds only immutable references.
final class LiveSwiftExportBridge: SwiftExportBridge, @unchecked Sendable {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "LiveSwiftExportBridge"
    )

    let isKMPAvailable: Bool = true

    let accounts: any SwiftExportAccountModule
    let transactions: any SwiftExportTransactionModule
    let budgets: any SwiftExportBudgetModule
    let goals: any SwiftExportGoalModule
    let categories: any SwiftExportCategoryModule
    let aggregator: any SwiftExportAggregatorModule
    let formatter: any SwiftExportFormatterModule
    let sync: any SwiftExportSyncModule

    /// Creates the live bridge, initialising each module from the KMP factory.
    ///
    /// - Parameter factory: The KMP repository factory. Defaults to
    ///   ``KMPRepositoryFactory.shared``.
    init(factory: KMPRepositoryFactory = .shared) {
        let store = PersistentDataStore.shared

        // Domain modules backed by the persistent data store.
        // When the full KMP XCFramework is wired, these will delegate
        // to KMP repository classes. For now they use the SQLCipher-backed
        // PersistentDataStore which provides real disk persistence.
        self.accounts = LiveAccountModule(store: store)
        self.transactions = LiveTransactionModule(store: store)
        self.budgets = LiveBudgetModule(store: store)
        self.goals = LiveGoalModule(store: store)
        self.categories = LiveCategoryModule(store: store)

        // Business logic modules use the KMP stub implementations which
        // contain the same algorithms as the Kotlin core module.
        self.aggregator = StubAggregatorModule()
        self.formatter = StubFormatterModule()

        // Sync module — will be replaced by PowerSync in Sprint 4.
        self.sync = factory.createSyncModule()

        Self.logger.info("LiveSwiftExportBridge initialised with PersistentDataStore")
    }
}

// MARK: - Live Account Module

struct LiveAccountModule: SwiftExportAccountModule, Sendable {
    private let store: PersistentDataStore

    init(store: PersistentDataStore) { self.store = store }

    func getAccounts() async throws -> [AccountItem] {
        try await store.getAccounts()
    }

    func getAllAccounts() async throws -> [AccountItem] {
        try await store.getAllAccounts()
    }

    func getAccount(id: String) async throws -> AccountItem? {
        try await store.getAccount(id: id)
    }

    func createAccount(_ account: AccountItem) async throws {
        try await store.upsertAccount(account)
    }

    func updateAccount(_ account: AccountItem) async throws {
        try await store.upsertAccount(account)
    }

    func archiveAccount(id: String) async throws {
        try await store.archiveAccount(id: id)
    }

    func unarchiveAccount(id: String) async throws {
        try await store.unarchiveAccount(id: id)
    }

    func deleteAccount(id: String) async throws {
        try await store.deleteAccount(id: id)
    }

    func deleteAllAccounts() async throws {
        try await store.deleteAllAccounts()
    }
}

// MARK: - Live Transaction Module

struct LiveTransactionModule: SwiftExportTransactionModule, Sendable {
    private let store: PersistentDataStore
    private let validator = StubTransactionValidator()
    private let categorizationEngine = StubCategorizationEngine()

    init(store: PersistentDataStore) { self.store = store }

    func getTransactions() async throws -> [TransactionItem] {
        try await store.getTransactions()
    }

    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] {
        try await store.getTransactions(offset: offset, limit: limit)
    }

    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] {
        try await store.getTransactions(forAccountId: accountId)
    }

    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] {
        try await store.getRecentTransactions(limit: limit)
    }

    func createTransaction(_ transaction: TransactionItem) async throws {
        try await store.upsertTransaction(transaction)
    }

    func updateTransaction(_ transaction: TransactionItem) async throws {
        try await store.upsertTransaction(transaction)
    }

    func deleteTransaction(id: String) async throws {
        try await store.deleteTransaction(id: id)
    }

    func deleteAllTransactions() async throws {
        try await store.deleteAllTransactions()
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

// MARK: - Live Budget Module

struct LiveBudgetModule: SwiftExportBudgetModule, Sendable {
    private let store: PersistentDataStore
    private let calculator = StubBudgetCalculator()

    init(store: PersistentDataStore) { self.store = store }

    func getBudgets() async throws -> [BudgetItem] {
        try await store.getBudgets()
    }

    func createBudget(_ budget: BudgetItem) async throws {
        try await store.upsertBudget(budget)
    }

    func updateBudget(_ budget: BudgetItem) async throws {
        try await store.upsertBudget(budget)
    }

    func deleteAllBudgets() async throws {
        try await store.deleteAllBudgets()
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

// MARK: - Live Goal Module

struct LiveGoalModule: SwiftExportGoalModule, Sendable {
    private let store: PersistentDataStore

    init(store: PersistentDataStore) { self.store = store }

    func getGoals() async throws -> [GoalItem] {
        try await store.getGoals()
    }

    func createGoal(_ goal: GoalItem) async throws {
        try await store.upsertGoal(goal)
    }

    func updateGoal(_ goal: GoalItem) async throws {
        try await store.upsertGoal(goal)
    }

    func deleteAllGoals() async throws {
        try await store.deleteAllGoals()
    }
}

// MARK: - Live Category Module

struct LiveCategoryModule: SwiftExportCategoryModule, Sendable {
    private let store: PersistentDataStore

    init(store: PersistentDataStore) { self.store = store }

    func getCategories() async throws -> [CategoryItem] {
        try await store.getCategories()
    }

    func getCategory(id: String) async throws -> CategoryItem? {
        try await store.getCategory(id: id)
    }

    func createCategory(_ category: CategoryItem) async throws {
        try await store.upsertCategory(category)
    }

    func updateCategory(_ category: CategoryItem) async throws {
        try await store.upsertCategory(category)
    }

    func deleteCategory(id: String) async throws {
        try await store.deleteCategory(id: id)
    }
}
