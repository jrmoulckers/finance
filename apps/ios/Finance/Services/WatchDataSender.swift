// SPDX-License-Identifier: BUSL-1.1

// WatchDataSender.swift
// Finance
//
// iPhone-side service that sends financial data to the paired Apple Watch
// via WatchConnectivity. Refs #649

import Foundation
import os
import WatchConnectivity

final class WatchDataSender: NSObject, @unchecked Sendable {
    enum DataKey {
        static let balance = "balance"
        static let currencyCode = "currencyCode"
        static let transactions = "transactions"
        static let budgets = "budgets"
        static let lastUpdated = "lastUpdated"
    }

    private enum ComplicationKey {
        static let balanceMinorUnits = "complication.balanceMinorUnits"
        static let currencyCode = "complication.currencyCode"
    }

    private static let appGroupIdentifier = "group.com.finance.app"
    private let accountRepository: any AccountRepository
    private let transactionRepository: any TransactionRepository
    private let budgetRepository: any BudgetRepository
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "WatchDataSender"
    )

    init(
        accountRepository: any AccountRepository = RepositoryProvider.shared.accounts,
        transactionRepository: any TransactionRepository = RepositoryProvider.shared.transactions,
        budgetRepository: any BudgetRepository = RepositoryProvider.shared.budgets,
        activateSession: Bool = true
    ) {
        self.accountRepository = accountRepository
        self.transactionRepository = transactionRepository
        self.budgetRepository = budgetRepository
        super.init()
        if activateSession {
            guard WCSession.isSupported() else { return }
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }

    private func setupSession() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    func sendLatestData() async {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated else { return }
        do {
            let payload = try await fetchPayload()
            try session.updateApplicationContext(payload)
            if let balance = Self.parseInt64(payload[DataKey.balance]),
               let code = payload[DataKey.currencyCode] as? String {
                updateComplicationDefaults(balance: balance, currencyCode: code)
            }
        } catch {
            Self.logger.error("Failed to send watch data: \(error.localizedDescription, privacy: .public)")
        }
    }

    func fetchPayload() async throws -> [String: Any] {
        let accounts = try await accountRepository.getAccounts()
        let transactions = try await transactionRepository.getRecentTransactions(limit: 5)
        let budgets = try await budgetRepository.getBudgets()
        let totalBalance = accounts.reduce(Int64(0)) { $0 + $1.balanceMinorUnits }
        let currencyCode = accounts.first?.currencyCode ?? "USD"
        return Self.packageData(
            balance: totalBalance, currencyCode: currencyCode,
            transactions: transactions, budgets: Array(budgets.prefix(3))
        )
    }

    static func packageData(
        balance: Int64, currencyCode: String,
        transactions: [TransactionItem], budgets: [BudgetItem]
    ) -> [String: Any] {
        let txDicts: [[String: Any]] = transactions.map { tx in
            ["id": tx.id, "payee": tx.payee, "amountMinorUnits": tx.amountMinorUnits,
             "category": tx.category, "date": tx.date.timeIntervalSince1970, "isExpense": tx.isExpense]
        }
        let budgetDicts: [[String: Any]] = budgets.map { b in
            ["id": b.id, "name": b.name, "spentMinorUnits": b.spentMinorUnits,
             "budgetedMinorUnits": b.limitMinorUnits]
        }
        return [DataKey.balance: balance, DataKey.currencyCode: currencyCode,
                DataKey.transactions: txDicts, DataKey.budgets: budgetDicts,
                DataKey.lastUpdated: Date().timeIntervalSince1970]
    }

    private func updateComplicationDefaults(balance: Int64, currencyCode: String) {
        guard let defaults = UserDefaults(suiteName: Self.appGroupIdentifier) else { return }
        defaults.set(balance, forKey: ComplicationKey.balanceMinorUnits)
        defaults.set(currencyCode, forKey: ComplicationKey.currencyCode)
    }

    static func parseInt64(_ value: Any?) -> Int64? {
        if let v = value as? Int64 { return v }
        if let v = value as? Int { return Int64(v) }
        if let v = value as? Double { return Int64(exactly: v) }
        return nil
    }
}

extension WatchDataSender: WCSessionDelegate {
    nonisolated func session(_ s: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    nonisolated func sessionDidBecomeInactive(_ s: WCSession) {}
    nonisolated func sessionDidDeactivate(_ s: WCSession) { s.activate() }
    nonisolated func session(_ s: WCSession, didReceiveMessage message: [String: Any]) {
        if message["request"] as? String == "refresh" {
            Task { @MainActor in await self.sendLatestData() }
        }
    }
}