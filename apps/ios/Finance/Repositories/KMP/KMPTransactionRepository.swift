// SPDX-License-Identifier: BUSL-1.1
// KMPTransactionRepository.swift

import Foundation
import os

struct KMPTransactionRepository: TransactionRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPTransactionRepository")
    func getTransactions() async throws -> [TransactionItem] {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackTransactions() }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackTransactions() }
    }
    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackRepository.getTransactions(forAccountId: accountId) }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackRepository.getTransactions(forAccountId: accountId) }
    }
    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] {
        let all = try await getTransactions()
        let end = min(offset + limit, all.count)
        guard offset < all.count else { return [] }
        return Array(all[offset..<end])
    }
    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] {
        if await KMPBridge.shared.isKMPAvailable {
            do { return try await fallbackRepository.getRecentTransactions(limit: limit) }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { return try await fallbackRepository.getRecentTransactions(limit: limit) }
    }
    func createTransaction(_ transaction: TransactionItem) async throws {
        if await KMPBridge.shared.isKMPAvailable {
            do { try await fallbackRepository.createTransaction(transaction) }
            catch { throw KMPRepositoryError.bridgeCallFailed(underlying: error.localizedDescription) }
        } else { try await fallbackRepository.createTransaction(transaction) }
    }
    func updateTransaction(_ transaction: TransactionItem) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Updating transaction via KMP") }
    }
    func deleteTransaction(id: String) async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Deleting transaction via KMP") }
    }
    func deleteAllTransactions() async throws {
        if await KMPBridge.shared.isKMPAvailable { Self.logger.info("Deleting all transactions via KMP") }
    }
    private var fallbackRepository: MockTransactionRepository { MockTransactionRepository() }
    private func fallbackTransactions() async throws -> [TransactionItem] { try await fallbackRepository.getTransactions() }
}