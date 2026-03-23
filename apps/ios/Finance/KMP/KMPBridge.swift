// SPDX-License-Identifier: BUSL-1.1
// KMPBridge.swift

import Foundation
import os

#if canImport(FinanceSync)
import FinanceSync
private let useRealKMP = true
#else
private let useRealKMP = false
#endif

@MainActor
final class KMPBridge {

    static let shared = KMPBridge()
    nonisolated(unsafe) static let _unsafeShared = KMPBridge()

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "KMPBridge"
    )

    let useMocks: Bool

    var isKMPAvailable: Bool {
        useRealKMP && !useMocks
    }

    let budgetCalculator: KMPBudgetCalculatorProtocol
    let financialAggregator: KMPFinancialAggregatorProtocol
    let transactionValidator: KMPTransactionValidatorProtocol
    let categorizationEngine: KMPCategorizationEngineProtocol
    let currencyFormatter: KMPCurrencyFormatterProtocol
    var syncClient: KMPSyncClientProtocol?

    init(useMocks: Bool = true) {
        self.useMocks = useMocks
        Self.logger.info("Initializing KMP bridge")
        #if canImport(FinanceSync)
        if !useMocks {
            self.budgetCalculator = StubBudgetCalculator()
            self.financialAggregator = StubFinancialAggregator()
            self.transactionValidator = StubTransactionValidator()
            self.categorizationEngine = StubCategorizationEngine()
            self.currencyFormatter = StubCurrencyFormatter()
            self.syncClient = nil
            Self.logger.info("KMP bridge initialized (factories pending)")
        } else {
            self.budgetCalculator = StubBudgetCalculator()
            self.financialAggregator = StubFinancialAggregator()
            self.transactionValidator = StubTransactionValidator()
            self.categorizationEngine = StubCategorizationEngine()
            self.currencyFormatter = StubCurrencyFormatter()
            self.syncClient = nil
            Self.logger.info("KMP bridge initialized (stub mode)")
        }
        #else
        self.budgetCalculator = StubBudgetCalculator()
        self.financialAggregator = StubFinancialAggregator()
        self.transactionValidator = StubTransactionValidator()
        self.categorizationEngine = StubCategorizationEngine()
        self.currencyFormatter = StubCurrencyFormatter()
        self.syncClient = nil
        Self.logger.info("KMP bridge initialized (stub mode)")
        #endif
    }

    func configureSyncClient(endpoint: String, databaseName: String) {
        #if canImport(FinanceSync)
        if isKMPAvailable { return }
        #endif
    }

    func destroySyncClient() {
        Self.logger.info("Destroying sync client")
        syncClient = nil
    }
}