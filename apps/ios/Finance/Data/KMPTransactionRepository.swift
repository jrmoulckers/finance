// SPDX-License-Identifier: BUSL-1.1
import Foundation; import os
actor KMPTransactionRepository: TransactionRepository {
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPTransactionRepository")
    private var cachedTransactions: [TransactionItem] = []
    private let bridge: KMPBridge
    init(bridge: KMPBridge? = nil) { self.bridge = bridge ?? KMPBridge._unsafeShared }
    func getTransactions() async throws -> [TransactionItem] { cachedTransactions.sorted { $0.date > $1.date } }
    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] { cachedTransactions.sorted { $0.date > $1.date } }
    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] { Array(cachedTransactions.sorted { $0.date > $1.date }.prefix(limit)) }
    func createTransaction(_ transaction: TransactionItem) async throws { cachedTransactions.append(transaction) }
    func deleteTransaction(id: String) async throws { cachedTransactions.removeAll { $0.id == id } }
    func populateCache(transactions: [TransactionItem]) { self.cachedTransactions = transactions }
}
enum KMPRepositoryError: LocalizedError, Sendable {
    case validationFailed([String]), entityNotFound(String), syncConflict(String), databaseError(String)
    var errorDescription: String? { switch self { case .validationFailed(let e): e.joined(separator: "; "); case .entityNotFound(let e): e; case .syncConflict(let d): d; case .databaseError(let d): d } }
}
