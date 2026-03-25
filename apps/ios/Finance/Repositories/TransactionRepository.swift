// SPDX-License-Identifier: BUSL-1.1

// TransactionRepository.swift
// Finance
//
// Protocol defining the data-access contract for transactions.
// Swap the concrete implementation to move from mock data to a
// KMP-backed repository without changing any ViewModel or View code.

import Foundation

/// Data-access contract for financial transactions.
///
/// All methods are `async throws` so implementations can perform
/// network, database, or KMP bridge calls transparently.
protocol TransactionRepository: Sendable {

    /// Returns all transactions, most recent first.
    func getTransactions() async throws -> [TransactionItem]

    /// Returns transactions belonging to the given account.
    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem]

    /// Returns the most recent transactions, limited to `limit` items.
    func getRecentTransactions(limit: Int) async throws -> [TransactionItem]

    /// Persists a new transaction.
    func createTransaction(_ transaction: TransactionItem) async throws

    /// Updates an existing transaction.
    func updateTransaction(_ transaction: TransactionItem) async throws

    /// Permanently deletes the transaction with the given identifier.
    func deleteTransaction(id: String) async throws

    /// Permanently deletes every transaction. Used for GDPR "Delete Everything".
    func deleteAllTransactions() async throws
}
