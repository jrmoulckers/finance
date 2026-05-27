// SPDX-License-Identifier: BUSL-1.1
// WidgetDataProvider.swift — Refs #380, #1605, #1608

import FinanceShared
import Foundation

public enum WidgetDataKeys {
    static let suiteName = SharedConstants.appGroupIdentifier
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

    var remainingMinorUnits: Int64 { limitMinorUnits - spentMinorUnits }
    var isOverBudget: Bool { spentMinorUnits > limitMinorUnits }
}

struct WidgetBudgetRollup: Sendable, Hashable {
    let budgets: [WidgetBudget]
    let totalSpentMinorUnits: Int64
    let totalLimitMinorUnits: Int64
    let currencyCode: String

    var progress: Double {
        guard totalLimitMinorUnits > 0 else { return 0 }
        return Double(totalSpentMinorUnits) / Double(totalLimitMinorUnits)
    }

    static let empty = WidgetBudgetRollup(
        budgets: [],
        totalSpentMinorUnits: 0,
        totalLimitMinorUnits: 0,
        currencyCode: "USD"
    )
}

enum WidgetDataProvider {
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private static var defaults: UserDefaults? { SharedConstants.sharedDefaults }

    static func readBalance() -> WidgetBalance {
        guard let defaults,
              let data = defaults.data(forKey: WidgetDataKeys.balance),
              let balance = try? decoder.decode(WidgetBalance.self, from: data)
        else {
            return .placeholder
        }
        return balance
    }

    static func readTransactions(limit: Int = 5) -> [WidgetTransaction] {
        guard let defaults,
              let data = defaults.data(forKey: WidgetDataKeys.transactions),
              let transactions = try? decoder.decode([WidgetTransaction].self, from: data)
        else {
            return []
        }
        return Array(transactions.prefix(limit))
    }

    /// Reads budget data from the app-group cache only. Timeline providers must
    /// never fetch from the network; an empty cache renders an empty state.
    static func readBudgets(limit: Int? = nil) -> [WidgetBudget] {
        guard let defaults,
              let data = defaults.data(forKey: WidgetDataKeys.budgets),
              let budgets = try? decoder.decode([WidgetBudget].self, from: data)
        else {
            return []
        }
        if let limit {
            return Array(budgets.prefix(limit))
        }
        return budgets
    }

    static func budgetRollup() -> WidgetBudgetRollup {
        let budgets = readBudgets()
        guard !budgets.isEmpty else { return .empty }
        let currency = budgets.first?.currencyCode ?? "USD"
        return WidgetBudgetRollup(
            budgets: budgets,
            totalSpentMinorUnits: budgets.reduce(0) { $0 + $1.spentMinorUnits },
            totalLimitMinorUnits: budgets.reduce(0) { $0 + $1.limitMinorUnits },
            currencyCode: currency
        )
    }

    static func maskingMode(for widgetId: String) -> WidgetMaskingMode {
        let mode = WidgetPrivacySettings.maskingMode(for: widgetId, defaults: defaults)
        if mode == .bucketed {
            WidgetPrivacySettings.markFirstAddPromptPending(defaults: defaults)
        }
        return mode
    }
}

extension WidgetBalance {
    static let placeholder = WidgetBalance(
        totalMinorUnits: 0,
        previousMonthMinorUnits: 0,
        currencyCode: "USD",
        accountName: String(localized: "All Accounts"),
        updatedAt: .now
    )
}

extension WidgetTransaction {
    static let placeholders: [WidgetTransaction] = [
        .init(
            id: "ph-1",
            payee: String(localized: "Grocery Store"),
            categoryIcon: "cart.fill",
            categoryName: String(localized: "Groceries"),
            amountMinorUnits: -8_540,
            currencyCode: "USD",
            date: .now,
            isIncome: false
        ),
        .init(
            id: "ph-2",
            payee: String(localized: "Direct Deposit"),
            categoryIcon: "building.columns",
            categoryName: String(localized: "Income"),
            amountMinorUnits: 350_000,
            currencyCode: "USD",
            date: Calendar.current.date(byAdding: .day, value: -1, to: .now) ?? .now,
            isIncome: true
        ),
    ]
}

extension WidgetBudget {
    static let placeholders: [WidgetBudget] = [
        .init(
            id: "pb-1",
            name: String(localized: "Groceries"),
            icon: "cart.fill",
            spentMinorUnits: 32_000,
            limitMinorUnits: 50_000,
            currencyCode: "USD"
        ),
        .init(
            id: "pb-2",
            name: String(localized: "Dining Out"),
            icon: "fork.knife",
            spentMinorUnits: 18_500,
            limitMinorUnits: 20_000,
            currencyCode: "USD"
        ),
        .init(
            id: "pb-3",
            name: String(localized: "Transport"),
            icon: "car.fill",
            spentMinorUnits: 8_000,
            limitMinorUnits: 15_000,
            currencyCode: "USD"
        ),
    ]
}

enum WidgetCurrencyFormatter {
    static func format(
        minorUnits: Int64,
        currencyCode: String,
        mode: WidgetMaskingMode,
        showCents: Bool = true
    ) -> String {
        WidgetMoneyFormatter.formatAmount(
            minorUnits: minorUnits,
            currencyCode: currencyCode,
            mode: mode,
            showCents: showCents
        )
    }

    static func formatCompact(
        minorUnits: Int64,
        currencyCode: String,
        mode: WidgetMaskingMode
    ) -> String {
        WidgetMoneyFormatter.formatAmount(
            minorUnits: minorUnits,
            currencyCode: currencyCode,
            mode: mode,
            compact: true,
            showCents: false
        )
    }

    static func formatForVoiceOver(
        minorUnits: Int64,
        currencyCode: String,
        mode: WidgetMaskingMode
    ) -> String {
        if mode == .visible {
            let formatter = NumberFormatter()
            formatter.numberStyle = .currencyPlural
            formatter.currencyCode = currencyCode
            return formatter.string(from: NSNumber(value: Double(minorUnits) / 100.0)) ?? currencyCode
        }
        return WidgetMoneyFormatter.formatAmount(
            minorUnits: minorUnits,
            currencyCode: currencyCode,
            mode: mode
        )
    }
}

enum WidgetDateFormatter {
    static func relativeString(for date: Date) -> String {
        if Calendar.current.isDateInToday(date) { return String(localized: "Today") }
        if Calendar.current.isDateInYesterday(date) { return String(localized: "Yesterday") }
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .none
        return formatter.string(from: date)
    }
}
