// SPDX-License-Identifier: BUSL-1.1

// QuickExpenseComposer.swift
// Finance
//
// Pure logic backing one-thumb quick expense capture: the instant-log presets,
// remembered last-used account/category defaults, and construction of a
// `TransactionItem` from a minimal quick-add form. Kept free of SwiftUI so it
// is fully unit-testable.
//
// References: #2167

import Foundation

// MARK: - Preset

/// An instant-log preset for common on-the-go expenses.
struct QuickExpensePreset: Identifiable, Sendable, Equatable {
    let id: String
    let label: String
    let systemImage: String
    /// Category id (matching the app's built-in category options).
    let categoryId: String
    /// Suggested payee text (may be cleared by the user for true on-the-go capture).
    let defaultPayee: String
}

// MARK: - Composer

/// Builds quick-add transactions and remembers the last-used account/category
/// so repeat capture is one-thumb fast.
enum QuickExpenseComposer {

    // MARK: Presets

    /// Fast presets tuned for a city spender: coffee, lunch, transit, cash.
    static let presets: [QuickExpensePreset] = [
        QuickExpensePreset(id: "coffee", label: String(localized: "Coffee"), systemImage: "cup.and.saucer.fill", categoryId: "c2", defaultPayee: String(localized: "Coffee")),
        QuickExpensePreset(id: "lunch", label: String(localized: "Lunch"), systemImage: "fork.knife", categoryId: "c2", defaultPayee: String(localized: "Lunch")),
        QuickExpensePreset(id: "transit", label: String(localized: "Transit"), systemImage: "tram.fill", categoryId: "c3", defaultPayee: String(localized: "Transit")),
        QuickExpensePreset(id: "groceries", label: String(localized: "Groceries"), systemImage: "cart.fill", categoryId: "c1", defaultPayee: String(localized: "Groceries")),
        QuickExpensePreset(id: "cash", label: String(localized: "Cash"), systemImage: "banknote.fill", categoryId: "c5", defaultPayee: ""),
    ]

    // MARK: Remembered Defaults

    private static let lastAccountKey = "quickadd.lastAccountId"
    private static let lastCategoryKey = "quickadd.lastCategoryId"

    /// The last account id used for quick add, if any.
    static func lastAccountId(defaults: UserDefaults = .standard) -> String? {
        defaults.string(forKey: lastAccountKey)
    }

    /// Persists the last account id used for quick add.
    static func setLastAccountId(_ id: String?, defaults: UserDefaults = .standard) {
        if let id, !id.isEmpty {
            defaults.set(id, forKey: lastAccountKey)
        } else {
            defaults.removeObject(forKey: lastAccountKey)
        }
    }

    /// The last category id used for quick add, if any.
    static func lastCategoryId(defaults: UserDefaults = .standard) -> String? {
        defaults.string(forKey: lastCategoryKey)
    }

    /// Persists the last category id used for quick add.
    static func setLastCategoryId(_ id: String?, defaults: UserDefaults = .standard) {
        if let id, !id.isEmpty {
            defaults.set(id, forKey: lastCategoryKey)
        } else {
            defaults.removeObject(forKey: lastCategoryKey)
        }
    }

    // MARK: Construction

    /// Builds an expense `TransactionItem` from the minimal quick-add inputs.
    ///
    /// - Parameters:
    ///   - amountMinorUnits: Positive amount in minor units; stored as a
    ///     negative (expense) figure on the resulting transaction.
    ///   - payee: Optional payee; when empty a neutral "Quick expense" label is used.
    ///   - categoryName: Resolved category display name.
    ///   - accountName: Resolved account display name.
    ///   - currencyCode: ISO currency code.
    ///   - date: Transaction date (defaults to now).
    static func makeTransaction(
        amountMinorUnits: Int64,
        payee: String,
        categoryName: String,
        accountName: String,
        currencyCode: String,
        date: Date = .now
    ) -> TransactionItem {
        let trimmedPayee = payee.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedPayee = trimmedPayee.isEmpty ? String(localized: "Quick expense") : trimmedPayee
        return TransactionItem(
            id: UUID().uuidString,
            payee: resolvedPayee,
            category: categoryName,
            accountName: accountName,
            amountMinorUnits: -abs(amountMinorUnits),
            currencyCode: currencyCode,
            date: date,
            type: .expense,
            status: .cleared
        )
    }
}
