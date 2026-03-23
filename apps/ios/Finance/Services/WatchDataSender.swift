// SPDX-License-Identifier: BUSL-1.1
// WatchDataSender.swift - iPhone-side WatchConnectivity sender. Refs #649
import Foundation
import os
import WatchConnectivity

@MainActor
final class WatchDataSender: NSObject, @unchecked Sendable {
    enum DataKey { static let balance = "balance"; static let currencyCode = "currencyCode"; static let transactions = "transactions"; static let budgets = "budgets"; static let lastUpdated = "lastUpdated" }
    private enum ComplicationKey { static let balanceMinorUnits = "complication.balanceMinorUnits"; static let currencyCode = "complication.currencyCode" }
    private static let appGroupIdentifier = "group.com.finance.app"
    private let accountRepository: any AccountRepository
    private let transactionRepository: any TransactionRepository
    private let budgetRepository: any BudgetRepository
    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "WatchDataSender")

    init(accountRepository: any AccountRepository = RepositoryProvider.shared.accounts,
         transactionRepository: any TransactionRepository = RepositoryProvider.shared.transactions,
         budgetRepository: any BudgetRepository = RepositoryProvider.shared.budgets,
         activateSession: Bool = true) {
        self.accountRepository = accountRepository; self.transactionRepository = transactionRepository; self.budgetRepository = budgetRepository
        super.init(); if activateSession { setupSession() }
    }
    private func setupSession() {
        guard WCSession.isSupported() else { return }; let s = WCSession.default; s.delegate = self; s.activate()
    }
    func sendLatestData() async {
        guard WCSession.isSupported() else { return }; let s = WCSession.default; guard s.activationState == .activated else { return }
        do {
            let p = try await fetchPayload(); try s.updateApplicationContext(p)
            if let b = Self.parseInt64(p[DataKey.balance]), let c = p[DataKey.currencyCode] as? String { updateComplicationDefaults(balance: b, currencyCode: c) }
        } catch { Self.logger.error("Failed to send watch data: \(error.localizedDescription, privacy: .public)") }
    }
    func fetchPayload() async throws -> [String: Any] {
        let accounts = try await accountRepository.getAccounts()
        let transactions = try await transactionRepository.getRecentTransactions(limit: 5)
        let budgets = try await budgetRepository.getBudgets()
        let totalBalance = accounts.reduce(Int64(0)) { $0 + $1.balanceMinorUnits }
        return Self.packageData(balance: totalBalance, currencyCode: accounts.first?.currencyCode ?? "USD", transactions: transactions, budgets: Array(budgets.prefix(3)))
    }
    static func packageData(balance: Int64, currencyCode: String, transactions: [TransactionItem], budgets: [BudgetItem]) -> [String: Any] {
        let txDicts: [[String: Any]] = transactions.map { ["id": $0.id, "payee": $0.payee, "amountMinorUnits": $0.amountMinorUnits, "category": $0.category, "date": $0.date.timeIntervalSince1970, "isExpense": $0.isExpense] }
        let budgetDicts: [[String: Any]] = budgets.map { ["id": $0.id, "name": $0.name, "spentMinorUnits": $0.spentMinorUnits, "budgetedMinorUnits": $0.limitMinorUnits] }
        return [DataKey.balance: balance, DataKey.currencyCode: currencyCode, DataKey.transactions: txDicts, DataKey.budgets: budgetDicts, DataKey.lastUpdated: Date().timeIntervalSince1970]
    }
    private func updateComplicationDefaults(balance: Int64, currencyCode: String) {
        guard let d = UserDefaults(suiteName: Self.appGroupIdentifier) else { return }
        d.set(balance, forKey: ComplicationKey.balanceMinorUnits); d.set(currencyCode, forKey: ComplicationKey.currencyCode)
    }
    static func parseInt64(_ value: Any?) -> Int64? {
        if let v = value as? Int64 { return v }; if let v = value as? Int { return Int64(v) }; if let v = value as? Double { return Int64(exactly: v) }; return nil
    }
}
extension WatchDataSender: WCSessionDelegate {
    nonisolated func session(_ s: WCSession, activationDidCompleteWith st: WCSessionActivationState, error: Error?) {}
    nonisolated func sessionDidBecomeInactive(_ s: WCSession) {}
    nonisolated func sessionDidDeactivate(_ s: WCSession) { s.activate() }
    nonisolated func session(_ s: WCSession, didReceiveMessage m: [String: Any]) {
        if m["request"] as? String == "refresh" { Task { @MainActor in await self.sendLatestData() } }
    }
}

