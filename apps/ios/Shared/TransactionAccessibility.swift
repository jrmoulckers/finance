// SPDX-License-Identifier: BUSL-1.1

// TransactionAccessibility.swift
// FinanceShared
// References: #2117
//
// Builds a single, coherent VoiceOver label for a transaction row so that
// VoiceOver users hear amount, income/expense direction, payee, category,
// account, date, and pending/recurring status in one focused element.
//
// Direction (income vs expense) is always conveyed in *text* — never by
// colour or glyph alone — so the meaning survives for users who cannot
// perceive the red/green sign colouring.
//
// The assembly logic is intentionally pure (no SwiftUI, no view state) so it
// can be unit-tested deterministically across amount signs, statuses, and
// missing fields.

import Foundation

/// Namespace for transaction-row accessibility helpers shared across the
/// main app, App Clip, and widgets.
public enum TransactionAccessibility {

    // MARK: - Direction

    /// Income/expense/transfer direction, conveyed in spoken text.
    public enum Direction: String, Sendable, Equatable {
        case income
        case expense
        case transfer
        /// Direction unknown or not applicable — the amount is announced
        /// without a leading direction word.
        case none
    }

    // MARK: - Components

    /// Display-ready fragments for a single transaction row.
    ///
    /// All strings are expected to be already localised/formatted by the
    /// caller. Empty strings are omitted from the final label so partial
    /// data (e.g. a Dashboard row with no account name) still produces a
    /// clean announcement.
    public struct RowComponents: Sendable, Equatable {
        /// Formatted amount including direction in words,
        /// e.g. `"Expense of $42.99"`.
        public var amountDescription: String
        public var payee: String
        public var category: String
        public var accountName: String
        /// Localised date, e.g. `"Jun 23, 2026"`.
        public var date: String
        /// Localised status, e.g. `"Pending"`. Empty to omit (cleared
        /// transactions need no extra announcement).
        public var statusDescription: String
        public var isRecurring: Bool
        public var tagNames: [String]

        public init(
            amountDescription: String,
            payee: String = "",
            category: String = "",
            accountName: String = "",
            date: String = "",
            statusDescription: String = "",
            isRecurring: Bool = false,
            tagNames: [String] = []
        ) {
            self.amountDescription = amountDescription
            self.payee = payee
            self.category = category
            self.accountName = accountName
            self.date = date
            self.statusDescription = statusDescription
            self.isRecurring = isRecurring
            self.tagNames = tagNames
        }
    }

    // MARK: - Label assembly

    /// Composes a single coherent VoiceOver label for a transaction row.
    ///
    /// The amount (with direction) is announced first because it is the most
    /// important piece of context when auditing spending by swipe; payee,
    /// category, account, date and status follow. Empty fragments are dropped
    /// so missing data never produces dangling separators.
    public static func rowLabel(_ components: RowComponents) -> String {
        var parts: [String] = []

        func append(_ value: String) {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { parts.append(trimmed) }
        }

        append(components.amountDescription)
        append(components.payee)
        append(components.category)
        append(components.accountName)
        append(components.date)
        append(components.statusDescription)
        if components.isRecurring {
            parts.append(String(localized: "Recurring"))
        }
        let tags = components.tagNames
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !tags.isEmpty {
            parts.append(String(localized: "Tags: \(tags.joined(separator: ", "))"))
        }

        return parts.joined(separator: ", ")
    }

    // MARK: - Helpers

    /// Builds an amount description that names the direction in words.
    ///
    /// - Parameters:
    ///   - direction: Income/expense/transfer direction.
    ///   - formattedAmount: Already-formatted currency string, e.g. `"$42.99"`.
    /// - Returns: e.g. `"Expense of $42.99"`, or just the amount when the
    ///   direction is `.none`.
    public static func amountDescription(
        direction: Direction,
        formattedAmount: String
    ) -> String {
        switch direction {
        case .income:
            return String(localized: "Income of \(formattedAmount)")
        case .expense:
            return String(localized: "Expense of \(formattedAmount)")
        case .transfer:
            return String(localized: "Transfer of \(formattedAmount)")
        case .none:
            return formattedAmount
        }
    }

    /// Formats minor currency units into a localised currency string.
    ///
    /// Mirrors `CurrencyLabel`'s minor-to-major conversion and per-currency
    /// decimal-place resolution so row announcements match the visible amount.
    public static func formattedAmount(
        amountMinorUnits: Int64,
        currencyCode: String
    ) -> String {
        let places = decimalPlaces(for: currencyCode)
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        formatter.minimumFractionDigits = places
        formatter.maximumFractionDigits = places
        let divisor = NSDecimalNumber(decimal: pow(10, places))
        let amount = NSDecimalNumber(value: amountMinorUnits)
        let majorUnits = amount.dividing(by: divisor)
        return formatter.string(from: majorUnits) ?? "\(currencyCode) \(amountMinorUnits)"
    }

    /// Resolves the number of decimal places for a currency code.
    public static func decimalPlaces(for currencyCode: String) -> Int {
        switch currencyCode {
        case "JPY", "KRW", "VND": 0
        case "BHD", "KWD", "OMR": 3
        default: 2
        }
    }
}
