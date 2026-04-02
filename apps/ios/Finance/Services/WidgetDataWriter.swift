// SPDX-License-Identifier: BUSL-1.1
// WidgetDataWriter.swift — Finance/Services — Refs #380
import Foundation
import os
import WidgetKit
actor WidgetDataWriter {
    static let shared = WidgetDataWriter(); private let suiteName = "group.com.finance.app"
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "WidgetDataWriter")
    private var defaults: UserDefaults? { UserDefaults(suiteName: suiteName) }
    private let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; return e }()
    func writeBalance(totalMinorUnits: Int64, previousMonthMinorUnits: Int64, currencyCode: String, accountName: String) { let b = WidgetBalanceData(totalMinorUnits:totalMinorUnits,previousMonthMinorUnits:previousMonthMinorUnits,currencyCode:currencyCode,accountName:accountName,updatedAt:Date()); guard let data = try? encoder.encode(b) else { logger.error("Failed to encode balance"); return }; defaults?.set(data,forKey:"widget.balance"); reloadTimelines() }
    func writeTransactions(_ txns: [WidgetTransactionData]) { guard let data = try? encoder.encode(Array(txns.prefix(5))) else { logger.error("Failed to encode transactions"); return }; defaults?.set(data,forKey:"widget.transactions"); reloadTimelines() }
    func writeBudgets(_ budgets: [WidgetBudgetData]) { guard let data = try? encoder.encode(Array(budgets.prefix(3))) else { logger.error("Failed to encode budgets"); return }; defaults?.set(data,forKey:"widget.budgets"); reloadTimelines() }
    private func reloadTimelines() { WidgetCenter.shared.reloadAllTimelines() }
}
struct WidgetBalanceData: Codable, Sendable { let totalMinorUnits: Int64; let previousMonthMinorUnits: Int64; let currencyCode: String; let accountName: String; let updatedAt: Date }
struct WidgetTransactionData: Codable, Sendable { let id: String; let payee: String; let categoryIcon: String; let categoryName: String; let amountMinorUnits: Int64; let currencyCode: String; let date: Date; let isIncome: Bool }
struct WidgetBudgetData: Codable, Sendable { let id: String; let name: String; let icon: String; let spentMinorUnits: Int64; let limitMinorUnits: Int64; let currencyCode: String }