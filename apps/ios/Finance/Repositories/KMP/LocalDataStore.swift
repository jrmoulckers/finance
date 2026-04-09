// SPDX-License-Identifier: BUSL-1.1
// LocalDataStore.swift — Actor-isolated in-memory data store for local-first persistence.
//
// Provides thread-safe CRUD operations for the KMP repository layer.
// Seeded from mock data on first access; this store will be replaced by
// SQLDelight (via the KMP sync layer) when the FinanceSync XCFramework
// is fully integrated.

import Foundation
import os

/// Actor-isolated in-memory data store that provides local-first persistence
/// for the KMP repository layer.
///
/// All mutations are synchronous within the actor, ensuring thread safety
/// without additional locking. The store is shared across all KMP repositories.
actor LocalDataStore {

    static let shared = LocalDataStore()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "LocalDataStore"
    )

    // MARK: - Storage

    private var accounts: [String: AccountItem] = [:]
    private var transactions: [String: TransactionItem] = [:]
    private var budgets: [String: BudgetItem] = [:]
    private var isSeeded = false

    // MARK: - Seeding

    /// Seeds the store with initial data from mock repositories.
    ///
    /// This is a one-time operation; subsequent calls are no-ops.
    /// When the FinanceSync XCFramework is available, this will be
    /// replaced by reading from SQLDelight via the KMP data layer.
    func seedIfNeeded() async {
        guard !isSeeded else { return }
        // Set early to prevent re-entrant seeding across await boundaries
        isSeeded = true
        Self.logger.info("Seeding local data store")

        do {
            let mockAccounts = try await MockAccountRepository().getAllAccounts()
            for account in mockAccounts { accounts[account.id] = account }

            let mockTransactions = try await MockTransactionRepository().getTransactions()
            for transaction in mockTransactions { transactions[transaction.id] = transaction }

            let mockBudgets = try await MockBudgetRepository().getBudgets()
            for budget in mockBudgets { budgets[budget.id] = budget }

            Self.logger.info(
                "Local data store seeded: \(self.accounts.count) accounts, "
                + "\(self.transactions.count) transactions, "
                + "\(self.budgets.count) budgets"
            )
        } catch {
            Self.logger.error(
                "Failed to seed local data store: \(error.localizedDescription, privacy: .public)"
            )
        }
    }

    // MARK: - Accounts

    func getAllAccounts() -> [AccountItem] {
        Array(accounts.values).sorted { $0.name < $1.name }
    }

    func getAccounts() -> [AccountItem] {
        getAllAccounts().filter { !$0.isArchived }
    }

    func getAccount(id: String) -> AccountItem? {
        accounts[id]
    }

    func upsertAccount(_ account: AccountItem) {
        accounts[account.id] = account
        Self.logger.debug("Account upserted: \(account.id, privacy: .private)")
    }

    func archiveAccount(id: String) {
        guard let existing = accounts[id] else { return }
        accounts[id] = AccountItem(
            id: existing.id, name: existing.name,
            balanceMinorUnits: existing.balanceMinorUnits,
            currencyCode: existing.currencyCode,
            type: existing.type, icon: existing.icon, isArchived: true
        )
        Self.logger.debug("Account archived: \(id, privacy: .private)")
    }

    func unarchiveAccount(id: String) {
        guard let existing = accounts[id] else { return }
        accounts[id] = AccountItem(
            id: existing.id, name: existing.name,
            balanceMinorUnits: existing.balanceMinorUnits,
            currencyCode: existing.currencyCode,
            type: existing.type, icon: existing.icon, isArchived: false
        )
        Self.logger.debug("Account unarchived: \(id, privacy: .private)")
    }

    func deleteAccount(id: String) {
        accounts.removeValue(forKey: id)
        Self.logger.debug("Account deleted: \(id, privacy: .private)")
    }

    func deleteAllAccounts() {
        accounts.removeAll()
        Self.logger.info("All accounts deleted")
    }

    // MARK: - Transactions

    func getTransactions() -> [TransactionItem] {
        Array(transactions.values).sorted { $0.date > $1.date }
    }

    func getTransactions(offset: Int, limit: Int) -> [TransactionItem] {
        let sorted = getTransactions()
        let start = min(offset, sorted.count)
        let end = min(start + limit, sorted.count)
        guard start < end else { return [] }
        return Array(sorted[start..<end])
    }

    func getTransactions(forAccountId accountId: String) -> [TransactionItem] {
        // Match by account name (mock data convention) or account ID
        // TODO: Replace with proper accountId-based lookup when KMP data layer is wired
        getTransactions().filter { txn in
            txn.accountName == accountId
                || accounts.values.first(where: { $0.id == accountId })?.name == txn.accountName
        }
    }

    func getRecentTransactions(limit: Int) -> [TransactionItem] {
        Array(getTransactions().prefix(limit))
    }

    func upsertTransaction(_ transaction: TransactionItem) {
        transactions[transaction.id] = transaction
        Self.logger.debug("Transaction upserted: \(transaction.id, privacy: .private)")
    }

    func deleteTransaction(id: String) {
        transactions.removeValue(forKey: id)
        Self.logger.debug("Transaction deleted: \(id, privacy: .private)")
    }

    func deleteAllTransactions() {
        transactions.removeAll()
        Self.logger.info("All transactions deleted")
    }

    // MARK: - Budgets

    func getBudgets() -> [BudgetItem] {
        Array(budgets.values).sorted { $0.name < $1.name }
    }

    func upsertBudget(_ budget: BudgetItem) {
        budgets[budget.id] = budget
        Self.logger.debug("Budget upserted: \(budget.id, privacy: .private)")
    }

    func deleteAllBudgets() {
        budgets.removeAll()
        Self.logger.info("All budgets deleted")
    }
}
