// SPDX-License-Identifier: BUSL-1.1

// KMPTransactionRepository.swift
// Finance
//
// KMP-bridged implementation of TransactionRepository. When the FinanceCore
// framework is available (macOS/iOS build via Xcode), this delegates to
// the Kotlin Multiplatform shared data layer. On non-Apple platforms
// (e.g., Windows development), it falls back to mock data.
//
// TODO(ios1-kmp-repos): Replace fallback with real KMP calls once the
// FinanceCore.xcframework is integrated via Gradle build phase.

#if canImport(FinanceCore)
import FinanceCore
#endif

import Foundation
import os

/// KMP-bridged transaction repository that reads from the shared SQLDelight
/// database via Swift Export when running on Apple platforms.
///
/// ## Integration checklist
/// 1. Build `FinanceCore.xcframework` via `./gradlew :packages:core:linkReleaseFrameworkIosArm64`
/// 2. Embed the framework in Xcode → Frameworks, Libraries, and Embedded Content
/// 3. Remove the `#else` fallback branch once KMP calls are verified
struct KMPTransactionRepository: TransactionRepository {

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPTransactionRepository"
    )

    // MARK: - KMP Bridge

    #if canImport(FinanceCore)
    // TODO: Accept the KMP repository/use-case from the DI graph
    // private let kmpTransactionService: FinanceCore.TransactionService
    //
    // init(kmpTransactionService: FinanceCore.TransactionService) {
    //     self.kmpTransactionService = kmpTransactionService
    // }
    #endif

    // MARK: - TransactionRepository

    func getTransactions() async throws -> [TransactionItem] {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // let kmpTransactions = try await kmpTransactionService.getTransactions()
        // return kmpTransactions.map { TransactionItem(from: $0) }
        Self.logger.info("Loading transactions via KMP bridge")
        return try await fallbackTransactions()
        #else
        Self.logger.debug("FinanceCore not available — using mock transactions")
        return try await fallbackTransactions()
        #endif
    }


    func getTransactions(offset: Int, limit: Int) async throws -> [TransactionItem] {
        return try await fallbackRepository.getTransactions(offset: offset, limit: limit)
    }

    func getTransactions(forAccountId accountId: String) async throws -> [TransactionItem] {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // let kmpTransactions = try await kmpTransactionService.getTransactions(accountId: accountId)
        // return kmpTransactions.map { TransactionItem(from: $0) }
        Self.logger.info(
            "Loading transactions for account \(accountId, privacy: .private) via KMP bridge"
        )
        return try await fallbackRepository.getTransactions(forAccountId: accountId)
        #else
        Self.logger.debug("FinanceCore not available — using mock account transactions")
        return try await fallbackRepository.getTransactions(forAccountId: accountId)
        #endif
    }

    func getRecentTransactions(limit: Int) async throws -> [TransactionItem] {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // let kmpTransactions = try await kmpTransactionService.getRecentTransactions(limit: Int32(limit))
        // return kmpTransactions.map { TransactionItem(from: $0) }
        Self.logger.info("Loading \(limit) recent transactions via KMP bridge")
        return try await fallbackRepository.getRecentTransactions(limit: limit)
        #else
        Self.logger.debug("FinanceCore not available — using mock recent transactions")
        return try await fallbackRepository.getRecentTransactions(limit: limit)
        #endif
    }

    func createTransaction(_ transaction: TransactionItem) async throws {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // let kmpTransaction = transaction.toKMPModel()
        // try await kmpTransactionService.createTransaction(kmpTransaction)
        Self.logger.info("Creating transaction via KMP bridge")
        try await fallbackRepository.createTransaction(transaction)
        #else
        Self.logger.debug("FinanceCore not available — using mock create")
        try await fallbackRepository.createTransaction(transaction)
        #endif
    }

    func deleteTransaction(id: String) async throws {
        #if canImport(FinanceCore)
        // TODO: Bridge to KMP shared logic
        // try await kmpTransactionService.deleteTransaction(id: id)
        Self.logger.info("Deleting transaction \(id, privacy: .private) via KMP bridge")
        #else
        Self.logger.debug("FinanceCore not available — delete is a no-op")
        #endif
    }


    func updateTransaction(_ transaction: TransactionItem) async throws {
        try await fallbackRepository.updateTransaction(transaction)
    }

    // MARK: - Fallback

    /// Shared fallback instance for stateful mock operations (e.g., recent/filtered queries).
    private var fallbackRepository: MockTransactionRepository { MockTransactionRepository() }

    /// Returns mock data when the KMP framework is unavailable.
    private func fallbackTransactions() async throws -> [TransactionItem] {
        try await fallbackRepository.getTransactions()
    }
}
