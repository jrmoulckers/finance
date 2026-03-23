// SPDX-License-Identifier: BUSL-1.1
// WidgetDataProvider.swift — Refs #380

import Foundation

enum WidgetDataKeys {
    static let suiteName = "group.com.finance.app"
    static let balance = "widget.balance"
    static let transactions = "widget.transactions"
    static let budgets = "widget.budgets"
}

struct WidgetBalance: Codable, Sendable, Hashable {
    let totalMinorUnits: Int64
    let previousMonthMinorUnits: Int64
    let currencyCode: String
    let accountName: String
    let updatedAt: Date
    var isTrendingUp: Bool { totalMinorUnits >= previousMonthMinorUnits }
}

struct WidgetTransaction: Codable, Sendable, Hashable, Identifiable {
    let id: String
    let payee: String
    let categoryIcon: String
    let categoryName: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let date: Date
    let isIncome: Bool
}

struct WidgetBudget: Codable, Sendable, Hashable, Identifiable {
    let id: String
    let name: String
    let icon: String
    let spentMinorUnits: Int64
    let limitMinorUnits: Int64
    let currencyCode: String
    var progress: Double {
        guard limitMinorUnits > 0 else { return 0 }
        return Double(spentMinorUnits) / Double(limitMinorUnits)
    }
    var isOverBudget: Bool { spentMinorUnits > limitMinorUnits }
}

enum WidgetDataProvider {
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
    private static var defaults: UserDefaults? { UserDefaults(suiteName: WidgetDataKeys.suiteName) }
    static func readBalance() -> WidgetBalance {
        guard let defaults, let data = defaults.data(forKey: WidgetDataKeys.balance), let balance = try? decoder.decode(WidgetBalance.self, from: data) else { return .placeholder }
        return balance
    }
    static func readTransactions(limit: Int = 5) -> [WidgetTransaction] {
        guard let defaults, let data = defaults.data(forKey: WidgetDataKeys.transactions), let txns = try? decoder.decode([WidgetTransaction].self, from: data) else { return WidgetTransaction.placeholders }
        return Array(txns.prefix(limit))
    }
    static func readBudgets(limit: Int = 3) -> [WidgetBudget] {
        guard let defaults, let data = defaults.data(forKey: WidgetDataKeys.budgets), let budgets = try? decoder.decode([WidgetBudget].self, from: data) else { return WidgetBudget.placeholders }
        return Array(budgets.prefix(limit))
    }
}

extension WidgetBalance {
    static let placeholder = WidgetBalance(totalMinorUnits: 2_485_000, previousMonthMinorUnits: 2_340_000, currencyCode: "USD", accountName: String(localized: "All Accounts"), updatedAt: .now)
}

extension WidgetTransaction {
    static let placeholders: [WidgetTransaction] = [
        .init(id: "ph-1", payee: String(localized: "Grocery Store"), categoryIcon: "cart.fill", categoryName: String(localized: "Groceries"), amountMinorUnits: -8_540, currencyCode: "USD", date: .now, isIncome: false),
        .init(id: "ph-2", payee: String(localized: "Direct Deposit"), categoryIcon: "building.columns", categoryName: String(localized: "Income"), amountMinorUnits: 350_000, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -1, to: .now) ?? .now, isIncome: true),
        .init(id: "ph-3", payee: String(localized: "Coffee Shop"), categoryIcon: "cup.and.saucer.fill", categoryName: String(localized: "Food"), amountMinorUnits: -550, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -1, to: .now) ?? .now, isIncome: false),
        .init(id: "ph-4", payee: String(localized: "Gas Station"), categoryIcon: "car.fill", categoryName: String(localized: "Transport"), amountMinorUnits: -4_200, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -2, to: .now) ?? .now, isIncome: false),
        .init(id: "ph-5", payee: String(localized: "Online Store"), categoryIcon: "bag.fill", categoryName: String(localized: "Shopping"), amountMinorUnits: -2_999, currencyCode: "USD", date: Calendar.current.date(byAdding: .day, value: -3, to: .now) ?? .now, isIncome: false),
    ]
}

extension WidgetBudget {
    static let placeholders: [WidgetBudget] = [
        .init(id: "pb-1", name: String(localized: "Groceries"), icon: "cart.fill", spentMinorUnits: 32_000, limitMinorUnits: 50_000, currencyCode: "USD"),
        .init(id: "pb-2", name: String(localized: "Dining Out"), icon: "fork.knife", spentMinorUnits: 18_500, limitMinorUnits: 20_000, currencyCode: "USD"),
        .init(id: "pb-3", name: String(localized: "Transport"), icon: "car.fill", spentMinorUnits: 8_000, limitMinorUnits: 15_000, currencyCode: "USD"),
    ]
}

enum WidgetCurrencyFormatter {
    static func format(minorUnits: Int64, currencyCode: String, showCents: Bool = true) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = currencyCode
        f.maximumFractionDigits = showCents ? 2 : 0; f.minimumFractionDigits = showCents ? 2 : 0
        return f.string(from: NSNumber(value: Double(minorUnits) / 100.0)) ?? currencyCode
    }
    static func formatCompact(minorUnits: Int64, currencyCode: String) -> String {
        let v = Double(abs(minorUnits)) / 100.0, s = minorUnits < 0 ? "-" : "", sym = currencySymbol(for: currencyCode)
        if v >= 1_000_000 { return "\(s)\(sym)\(String(format: "%.1fM", v / 1_000_000))" }
        if v >= 1_000 { return "\(s)\(sym)\(String(format: "%.1fK", v / 1_000))" }
        return "\(s)\(sym)\(String(format: "%.0f", v))"
    }
    static func currencySymbol(for code: String) -> String {
        let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = code; f.locale = .current
        return f.currencySymbol ?? "$"
    }
    static func formatForVoiceOver(minorUnits: Int64, currencyCode: String) -> String {
        let f = NumberFormatter(); f.numberStyle = .currencyPlural; f.currencyCode = currencyCode
        return f.string(from: NSNumber(value: Double(minorUnits) / 100.0)) ?? currencyCode
    }
}

enum WidgetDateFormatter {
    static func relativeString(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return String(localized: "Today") }
        if Calendar.current.isDateInYesterday(date) { return String(localized: "Yesterday") }
        let f = DateFormatter(); f.dateStyle = .short; f.timeStyle = .none; return f.string(from: date)
    }
}