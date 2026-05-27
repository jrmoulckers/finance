// SPDX-License-Identifier: BUSL-1.1
// WidgetDataWriter.swift — Finance/Services — Refs #380, #1608

import FinanceShared
import Foundation
import os
import WidgetKit

actor WidgetDataWriter {
    static let shared = WidgetDataWriter()

    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "WidgetDataWriter"
    )

    private var defaults: UserDefaults? { SharedConstants.sharedDefaults }
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    func writeBalance(
        totalMinorUnits: Int64,
        previousMonthMinorUnits: Int64,
        currencyCode: String,
        accountName: String
    ) {
        let balance = WidgetBalanceData(
            totalMinorUnits: totalMinorUnits,
            previousMonthMinorUnits: previousMonthMinorUnits,
            currencyCode: currencyCode,
            accountName: accountName,
            updatedAt: Date()
        )
        write(balance, key: "widget.balance", timelineKind: "BalanceWidget")
    }

    func writeTransactions(_ transactions: [WidgetTransactionData]) {
        write(
            Array(transactions.prefix(5)),
            key: "widget.transactions",
            timelineKind: "RecentTransactionsWidget"
        )
    }

    func writeBudgets(_ budgets: [WidgetBudgetData]) {
        write(budgets, key: "widget.budgets", timelineKind: "BudgetProgressWidget")
    }

    private func write<T: Encodable>(_ value: T, key: String, timelineKind: String) {
        guard let data = try? encoder.encode(value) else {
            logger.error("Failed to encode widget cache for \(key, privacy: .public)")
            return
        }
        defaults?.set(data, forKey: key)
        WidgetCenter.shared.reloadTimelines(ofKind: timelineKind)
    }
}

struct WidgetBalanceData: Codable, Sendable {
    let totalMinorUnits: Int64
    let previousMonthMinorUnits: Int64
    let currencyCode: String
    let accountName: String
    let updatedAt: Date
}

struct WidgetTransactionData: Codable, Sendable {
    let id: String
    let payee: String
    let categoryIcon: String
    let categoryName: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let date: Date
    let isIncome: Bool
}

struct WidgetBudgetData: Codable, Sendable {
    let id: String
    let name: String
    let icon: String
    let spentMinorUnits: Int64
    let limitMinorUnits: Int64
    let currencyCode: String
}
