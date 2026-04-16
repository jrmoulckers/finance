// SPDX-License-Identifier: BUSL-1.1
// SwiftExportBridge.swift — Swift Export bridge layer for KMP shared logic.
//
// Defines a protocol-based abstraction over the KMP XCFramework APIs
// using Swift Export conventions. When `FinanceSync` is available, the
// concrete `LiveSwiftExportBridge` delegates to real KMP calls. Otherwise,
// `StubSwiftExportBridge` provides an in-process implementation for
// development and testing.
//
// The bridge exposes five domain modules:
//   1. AccountModule  — CRUD + queries for financial accounts
//   2. TransactionModule — CRUD + queries for transactions
//   3. BudgetModule   — CRUD + budget status calculations
//   4. GoalModule     — CRUD + progress tracking for goals
//   5. CategoryModule — CRUD for transaction categories
//
// Each module follows the Repository pattern and returns Swift-native
// types (no KMP types leak past the bridge boundary).
//
// References: #414, #289

import Foundation
import os

// MARK: - Swift Export Bridge Protocol

/// Top-level entry point for all KMP shared logic consumed by Swift.
///
/// Conforming types vend domain-specific modules. Views and ViewModels
/// interact exclusively through this protocol and its child module
/// protocols — they never import `FinanceSync` directly.
protocol SwiftExportBridge: Sendable {
    /// Whether the real KMP XCFramework is linked and available.
    var isKMPAvailable: Bool { get }

    /// Account data access and business logic.
    var accounts: any SwiftExportAccountModule { get }

    /// Transaction data access and business logic.
    var transactions: any SwiftExportTransactionModule { get }

    /// Budget data access and calculation logic.
    var budgets: any SwiftExportBudgetModule { get }

    /// Goal data access and progress logic.
    var goals: any SwiftExportGoalModule { get }

    /// Category data access.
    var categories: any SwiftExportCategoryModule { get }

    /// Financial aggregation (net worth, spending, savings rate).
    var aggregator: any SwiftExportAggregatorModule { get }

    /// Currency formatting via KMP shared logic.
    var formatter: any SwiftExportFormatterModule { get }

    /// Sync engine control.
    var sync: any SwiftExportSyncModule { get }
}

// MARK: - Account Module

/// Account CRUD and query operations bridged from KMP.
protocol SwiftExportAccountModule: Sendable {
    /// Returns all non-archived accounts.
    func getAccounts() async throws -> [AccountItem]

    /// Returns all accounts including archived ones.
    func getAllAccounts() async throws -> [AccountItem]

    /// Returns a single account by its identifier.
    func getAccount(id: String) async throws -> AccountItem?

    /// Creates a new account.
    func createAccount(_ account: AccountItem) async throws

    /// Updates an existing account.
    func updateAccount(_ account: AccountItem) async throws

    /// Soft-archives an account (hidden from default lists).
    func archiveAccount(id: String) async throws

    /// Restores a previously archived account.
    func unarchiveAccount(id: String) async throws

    /// Permanently deletes an account.
    func deleteAccount(id: String) async throws

    /// Permanently deletes all accounts (GDPR).
    func deleteAllAccounts() async throws
}

// MARK: - Transaction Module

/// Transaction CRUD and query operations bridged from KMP.
protocol SwiftExportTransactionModule: Sendable {
    /// Returns all transactions, most recent first.
    func getTransactions() async throws -> [TransactionItem]

    /// Returns a paginated slice of transactions.
    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem]

    /// Returns transactions for a specific account.
    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem]

    /// Returns the N most recent transactions.
    func getRecentTransactions(limit: Int) async throws -> [TransactionItem]

    /// Creates a new transaction.
    func createTransaction(_ transaction: TransactionItem) async throws

    /// Updates an existing transaction.
    func updateTransaction(_ transaction: TransactionItem) async throws

    /// Permanently deletes a transaction.
    func deleteTransaction(id: String) async throws

    /// Permanently deletes all transactions (GDPR).
    func deleteAllTransactions() async throws

    /// Validates a transaction against business rules.
    /// Returns an empty array if valid, or a list of validation error messages.
    func validate(_ transaction: TransactionItem, accountIds: Set<String>, categoryIds: Set<String>) -> [String]

    /// Suggests a category for a payee based on learned history.
    func suggestCategory(forPayee payee: String) -> String?

    /// Records a payee→category mapping for future suggestions.
    func learnCategoryMapping(payee: String, categoryId: String)
}

// MARK: - Budget Module

/// Budget CRUD and calculation operations bridged from KMP.
protocol SwiftExportBudgetModule: Sendable {
    /// Returns all budgets.
    func getBudgets() async throws -> [BudgetItem]

    /// Creates a new budget.
    func createBudget(_ budget: BudgetItem) async throws

    /// Updates an existing budget.
    func updateBudget(_ budget: BudgetItem) async throws

    /// Permanently deletes all budgets (GDPR).
    func deleteAllBudgets() async throws

    /// Calculates budget status for a given budget against transactions.
    func calculateStatus(
        budget: KMPBudget,
        transactions: [KMPTransaction],
        referenceDate: DateComponents
    ) -> KMPBudgetStatus

    /// Calculates recommended daily spending rate.
    func dailyBudgetRate(budgetAmount: Int64, spent: Int64, daysRemaining: Int) -> Int64
}

// MARK: - Goal Module

/// Goal CRUD and progress operations bridged from KMP.
protocol SwiftExportGoalModule: Sendable {
    /// Returns all goals.
    func getGoals() async throws -> [GoalItem]

    /// Creates a new goal.
    func createGoal(_ goal: GoalItem) async throws

    /// Updates an existing goal.
    func updateGoal(_ goal: GoalItem) async throws

    /// Permanently deletes all goals (GDPR).
    func deleteAllGoals() async throws
}

// MARK: - Category Module

/// Category CRUD operations bridged from KMP.
protocol SwiftExportCategoryModule: Sendable {
    /// Returns all categories ordered by sort order.
    func getCategories() async throws -> [CategoryItem]

    /// Returns a single category by its identifier.
    func getCategory(id: String) async throws -> CategoryItem?

    /// Creates a new category.
    func createCategory(_ category: CategoryItem) async throws

    /// Updates an existing category.
    func updateCategory(_ category: CategoryItem) async throws

    /// Permanently deletes a category.
    func deleteCategory(id: String) async throws
}

// MARK: - Aggregator Module

/// Financial aggregation operations bridged from KMP core logic.
protocol SwiftExportAggregatorModule: Sendable {
    /// Calculates net worth across all active accounts.
    func netWorth(accounts: [AccountItem]) -> Int64

    /// Total spending in a date range.
    func totalSpending(transactions: [TransactionItem], from: Date, to: Date) -> Int64

    /// Total income in a date range.
    func totalIncome(transactions: [TransactionItem], from: Date, to: Date) -> Int64

    /// Net cash flow (income minus spending) in a date range.
    func netCashFlow(transactions: [TransactionItem], from: Date, to: Date) -> Int64

    /// Spending grouped by category name in a date range.
    func spendingByCategory(transactions: [TransactionItem], from: Date, to: Date) -> [String: Int64]

    /// Savings rate as a percentage (0–100) in a date range.
    func savingsRate(transactions: [TransactionItem], from: Date, to: Date) -> Double
}

// MARK: - Formatter Module

/// Currency formatting operations bridged from KMP.
protocol SwiftExportFormatterModule: Sendable {
    /// Formats an amount in minor units to a display string.
    func format(amountMinorUnits: Int64, currencyCode: String, showSign: Bool) -> String

    /// Formats an amount in minor units to a compact display string (e.g. "$1.2K").
    func formatCompact(amountMinorUnits: Int64, currencyCode: String) -> String
}

// MARK: - Sync Module

/// Sync engine control operations bridged from KMP.
protocol SwiftExportSyncModule: Sendable {
    /// Whether the sync client has a valid authentication session.
    var isAuthenticated: Bool { get }

    /// Number of local mutations pending push.
    var pendingMutationCount: Int { get }

    /// Starts the real-time sync connection.
    func start() async

    /// Stops the real-time sync connection.
    func stop() async

    /// Triggers an immediate sync cycle. Returns the result.
    func syncNow() async -> KMPSyncResult

    /// Signs out and clears sync session state.
    func signOut() async

    /// Observes sync status changes as an async stream.
    func observeSyncStatus() -> AsyncStream<KMPSyncStatus>
}

// MARK: - Bridge Error

/// Errors specific to the Swift Export bridge layer.
enum SwiftExportBridgeError: Error, LocalizedError, Sendable {
    case moduleUnavailable(String)
    case kmpCallFailed(underlying: String)
    case typeMappingFailed(source: String, target: String)

    var errorDescription: String? {
        switch self {
        case .moduleUnavailable(let module):
            String(localized: "KMP module '\(module)' is not available")
        case .kmpCallFailed(let msg):
            String(localized: "KMP call failed: \(msg)")
        case .typeMappingFailed(let source, let target):
            String(localized: "Type mapping failed: \(source) → \(target)")
        }
    }
}
