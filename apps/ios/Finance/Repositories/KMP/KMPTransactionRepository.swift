// SPDX-License-Identifier: BUSL-1.1
// KMPTransactionRepository.swift — KMP-backed transaction repository using LocalDataStore.

import Foundation
import os

/// Transaction repository backed by the actor-isolated ``LocalDataStore``.
///
/// When the FinanceSync XCFramework is available (`canImport(FinanceSync)`),
/// this will delegate to the KMP data layer. Until then, the local store
/// is seeded from mock data and supports full CRUD operations in-memory.
struct KMPTransactionRepository: TransactionRepository {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPTransactionRepository"
    )
    private let store: LocalDataStore

    init(store: LocalDataStore = .shared) {
        self.store = store
    }

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
        Self.logger.info("Creating transaction via KMP bridge")
        await store.upsertTransaction(transaction)
    }

    func updateTransaction(_ transaction: TransactionItem) async throws {
        Self.logger.info("Updating transaction via KMP bridge")
        await store.upsertTransaction(transaction)
    }

    func deleteTransaction(id: String) async throws {
        Self.logger.info("Deleting transaction via KMP bridge")
        await store.deleteTransaction(id: id)
    }

    func deleteAllTransactions() async throws {
        Self.logger.info("Deleting all transactions via KMP bridge")
        await store.deleteAllTransactions()
    }
}