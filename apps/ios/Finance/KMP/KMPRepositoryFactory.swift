// SPDX-License-Identifier: BUSL-1.1
// KMPRepositoryFactory.swift — Factory for creating KMP module instances.
//
// Centralises the creation of KMP repository and service instances.
// When the FinanceSync XCFramework exports factory functions, this
// file will call them. Until then, it creates locally-backed
// implementations that use PersistentDataStore (SQLCipher-encrypted).
//
// References: #414, #289

import Foundation
import os

// MARK: - KMPRepositoryFactory

/// Factory that vends KMP module instances for the ``LiveSwiftExportBridge``.
///
/// The factory checks for `FinanceSync` availability and creates either
/// real KMP-backed modules or locally-backed alternatives. This design
/// allows incremental migration — each module can be swapped to a real
/// KMP implementation independently.
final class KMPRepositoryFactory: @unchecked Sendable {

    // MARK: - Singleton

    static let shared = KMPRepositoryFactory()

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPRepositoryFactory"
    )

    // MARK: - Configuration

    /// Whether the real FinanceSync XCFramework is linked.
    let isXCFrameworkAvailable: Bool

    // MARK: - Initialisation

    init() {
        #if canImport(FinanceSync)
        self.isXCFrameworkAvailable = true
        Self.logger.info("KMPRepositoryFactory: FinanceSync XCFramework detected")
        #else
        self.isXCFrameworkAvailable = false
        Self.logger.info("KMPRepositoryFactory: FinanceSync XCFramework not available")
        #endif
    }

    // MARK: - Module Factory Methods

    /// Creates the sync module.
    ///
    /// When PowerSync is integrated (Sprint 4), this will return a
    /// ``PowerSyncModule``. Until then, returns a stub.
    func createSyncModule() -> any SwiftExportSyncModule {
        #if canImport(FinanceSync)
        // TODO: Return PowerSyncModule when Sprint 4 is wired
        Self.logger.info("Creating sync module (stub — pending PowerSync)")
        return StubSyncModule()
        #else
        return StubSyncModule()
        #endif
    }

    /// Creates the budget calculator from KMP or falls back to stub.
    func createBudgetCalculator() -> KMPBudgetCalculatorProtocol {
        #if canImport(FinanceSync)
        // TODO: Return real KMP BudgetCalculator when Swift Export is ready
        return StubBudgetCalculator()
        #else
        return StubBudgetCalculator()
        #endif
    }

    /// Creates the financial aggregator from KMP or falls back to stub.
    func createFinancialAggregator() -> KMPFinancialAggregatorProtocol {
        #if canImport(FinanceSync)
        // TODO: Return real KMP FinancialAggregator when Swift Export is ready
        return StubFinancialAggregator()
        #else
        return StubFinancialAggregator()
        #endif
    }

    /// Creates the transaction validator from KMP or falls back to stub.
    func createTransactionValidator() -> KMPTransactionValidatorProtocol {
        #if canImport(FinanceSync)
        return StubTransactionValidator()
        #else
        return StubTransactionValidator()
        #endif
    }

    /// Creates the currency formatter from KMP or falls back to stub.
    func createCurrencyFormatter() -> KMPCurrencyFormatterProtocol {
        #if canImport(FinanceSync)
        return StubCurrencyFormatter()
        #else
        return StubCurrencyFormatter()
        #endif
    }
}
