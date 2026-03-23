// SPDX-License-Identifier: BUSL-1.1
import Foundation
import os
@MainActor
final class KMPBridge {
    static let shared = KMPBridge()
    nonisolated(unsafe) static let _unsafeShared = KMPBridge()
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "KMPBridge")
    let budgetCalculator: KMPBudgetCalculatorProtocol
    let financialAggregator: KMPFinancialAggregatorProtocol
    let transactionValidator: KMPTransactionValidatorProtocol
    let categorizationEngine: KMPCategorizationEngineProtocol
    let currencyFormatter: KMPCurrencyFormatterProtocol
    var syncClient: KMPSyncClientProtocol?
    private init() {
        Self.logger.info("Initializing KMP bridge")
        self.budgetCalculator = StubBudgetCalculator()
        self.financialAggregator = StubFinancialAggregator()
        self.transactionValidator = StubTransactionValidator()
        self.categorizationEngine = StubCategorizationEngine()
        self.currencyFormatter = StubCurrencyFormatter()
        self.syncClient = nil
        Self.logger.info("KMP bridge initialized (stub mode)")
    }
    func configureSyncClient(endpoint: String, databaseName: String) {}
    func destroySyncClient() { syncClient = nil }
}
