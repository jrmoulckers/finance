// SPDX-License-Identifier: BUSL-1.1
// SwiftExportBridgeProvider.swift — Singleton provider for the Swift Export bridge.
//
// Manages the lifecycle of the `SwiftExportBridge` instance. On startup,
// checks whether the FinanceSync XCFramework is available via conditional
// compilation (`canImport(FinanceSync)`). When available, creates a
// `LiveSwiftExportBridge` that delegates to real KMP calls. Otherwise,
// falls back to `StubSwiftExportBridge`.
//
// ViewModels and repositories access the bridge exclusively through
// `SwiftExportBridgeProvider.shared.bridge`.
//
// References: #414, #289

import Foundation
import os

// MARK: - SwiftExportBridgeProvider

/// Singleton provider for the ``SwiftExportBridge``.
///
/// The provider selects the appropriate bridge implementation at launch:
/// - `LiveSwiftExportBridge` when `FinanceSync` XCFramework is linked
/// - `StubSwiftExportBridge` for development/testing/preview
///
/// This class is safe to access from any concurrency context.
final class SwiftExportBridgeProvider: @unchecked Sendable {

    // MARK: - Singleton

    /// The app-wide shared instance.
    static let shared = SwiftExportBridgeProvider()

    // MARK: - Properties

    /// The active bridge instance.
    let bridge: any SwiftExportBridge

    /// Convenience accessors that avoid `.bridge.` repetition.
    var accounts: any SwiftExportAccountModule { bridge.accounts }
    var transactions: any SwiftExportTransactionModule { bridge.transactions }
    var budgets: any SwiftExportBudgetModule { bridge.budgets }
    var goals: any SwiftExportGoalModule { bridge.goals }
    var categories: any SwiftExportCategoryModule { bridge.categories }
    var aggregator: any SwiftExportAggregatorModule { bridge.aggregator }
    var formatter: any SwiftExportFormatterModule { bridge.formatter }
    var sync: any SwiftExportSyncModule { bridge.sync }

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "SwiftExportBridgeProvider"
    )

    // MARK: - Initialisation

    /// Creates the bridge provider, selecting the implementation based on
    /// framework availability.
    ///
    /// - Parameter bridge: Override for testing. When `nil`, auto-detects.
    init(bridge: (any SwiftExportBridge)? = nil) {
        if let bridge {
            self.bridge = bridge
            Self.logger.info("SwiftExportBridgeProvider: using injected bridge")
            return
        }

        #if canImport(FinanceSync)
        // FinanceSync XCFramework is linked — use the live bridge with
        // PersistentDataStore (SQLCipher-encrypted, Keychain-managed key).
        self.bridge = LiveSwiftExportBridge()
        Self.logger.info(
            "SwiftExportBridgeProvider: FinanceSync available, using LiveSwiftExportBridge"
        )
        #else
        // XCFramework not available — use PersistentDataStore-backed live
        // bridge for real disk persistence, or fall back to stub for tests.
        // The LiveSwiftExportBridge works without FinanceSync because it
        // delegates to PersistentDataStore rather than KMP factories.
        self.bridge = LiveSwiftExportBridge()
        Self.logger.info(
            "SwiftExportBridgeProvider: using LiveSwiftExportBridge (PersistentDataStore)"
        )
        #endif
    }
}

// MARK: - Repository Adapter Layer

/// Adapts `SwiftExportAccountModule` to the existing `AccountRepository` protocol.
///
/// This allows gradual migration: ViewModels continue to depend on
/// `AccountRepository`, but the concrete implementation now delegates
/// to the Swift Export bridge instead of `LocalDataStore` directly.
struct BridgedAccountRepository: AccountRepository {
    private let module: any SwiftExportAccountModule

    init(module: any SwiftExportAccountModule = SwiftExportBridgeProvider.shared.accounts) {
        self.module = module
    }

    func getAccounts() async throws -> [AccountItem] { try await module.getAccounts() }
    func getAllAccounts() async throws -> [AccountItem] { try await module.getAllAccounts() }
    func getAccount(id: String) async throws -> AccountItem? { try await module.getAccount(id: id) }
    func updateAccount(_ account: AccountItem) async throws { try await module.updateAccount(account) }
    func archiveAccount(id: String) async throws { try await module.archiveAccount(id: id) }
    func unarchiveAccount(id: String) async throws { try await module.unarchiveAccount(id: id) }
    func deleteAccount(id: String) async throws { try await module.deleteAccount(id: id) }
    func deleteAllAccounts() async throws { try await module.deleteAllAccounts() }
}

/// Adapts `SwiftExportTransactionModule` to the existing `TransactionRepository` protocol.
struct BridgedTransactionRepository: TransactionRepository {
    private let module: any SwiftExportTransactionModule

    init(module: any SwiftExportTransactionModule = SwiftExportBridgeProvider.shared.transactions) {
        self.module = module
    }

    func getTransactions() async throws -> [TransactionItem] { try await module.getTransactions() }
    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] { try await module.getTransactions(offset: offset, limit: limit) }
    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] { try await module.getTransactions(forAccountId: accountId) }
    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] { try await module.getRecentTransactions(limit: limit) }
    func createTransaction(_ transaction: TransactionItem) async throws { try await module.createTransaction(transaction) }
    func updateTransaction(_ transaction: TransactionItem) async throws { try await module.updateTransaction(transaction) }
    func deleteTransaction(id: String) async throws { try await module.deleteTransaction(id: id) }
    func deleteAllTransactions() async throws { try await module.deleteAllTransactions() }
    func eraseAllMoodTags() async throws {}
}

/// Adapts `SwiftExportBudgetModule` to the existing `BudgetRepository` protocol.
struct BridgedBudgetRepository: BudgetRepository {
    private let module: any SwiftExportBudgetModule

    init(module: any SwiftExportBudgetModule = SwiftExportBridgeProvider.shared.budgets) {
        self.module = module
    }

    func getBudgets() async throws -> [BudgetItem] { try await module.getBudgets() }
    func createBudget(_ budget: BudgetItem) async throws { try await module.createBudget(budget) }
    func updateBudget(_ budget: BudgetItem) async throws { try await module.updateBudget(budget) }
    func deleteAllBudgets() async throws { try await module.deleteAllBudgets() }
}

/// Adapts `SwiftExportGoalModule` to the existing `GoalRepository` protocol.
struct BridgedGoalRepository: GoalRepository {
    private let module: any SwiftExportGoalModule

    init(module: any SwiftExportGoalModule = SwiftExportBridgeProvider.shared.goals) {
        self.module = module
    }

    func getGoals() async throws -> [GoalItem] { try await module.getGoals() }
    func createGoal(_ goal: GoalItem) async throws { try await module.createGoal(goal) }
    func updateGoal(_ goal: GoalItem) async throws { try await module.updateGoal(goal) }
    func deleteAllGoals() async throws { try await module.deleteAllGoals() }
}

/// Adapts `SwiftExportCategoryModule` to the existing `CategoryRepository` protocol.
struct BridgedCategoryRepository: CategoryRepository {
    private let module: any SwiftExportCategoryModule

    init(module: any SwiftExportCategoryModule = SwiftExportBridgeProvider.shared.categories) {
        self.module = module
    }

    func getCategories() async throws -> [CategoryItem] { try await module.getCategories() }
    func getCategory(id: String) async throws -> CategoryItem? { try await module.getCategory(id: id) }
    func createCategory(_ category: CategoryItem) async throws { try await module.createCategory(category) }
    func updateCategory(_ category: CategoryItem) async throws { try await module.updateCategory(category) }
    func deleteCategory(id: String) async throws { try await module.deleteCategory(id: id) }
}
