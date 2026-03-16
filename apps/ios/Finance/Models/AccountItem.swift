// SPDX-License-Identifier: BUSL-1.1

// AccountItem.swift
// Finance
//
// Data models for financial accounts, extracted from view-level definitions
// to enable protocol-based repository sourcing and KMP integration.

import SwiftUI

// MARK: - Account Type

/// Visual representation of account types used across the app.
enum AccountTypeUI: String, CaseIterable, Hashable, Sendable {
    case checking, savings, creditCard, cash, investment, loan, other

    var displayName: String {
        switch self {
        case .checking: String(localized: "Checking")
        case .savings: String(localized: "Savings")
        case .creditCard: String(localized: "Credit Cards")
        case .cash: String(localized: "Cash")
        case .investment: String(localized: "Investments")
        case .loan: String(localized: "Loans")
        case .other: String(localized: "Other")
        }
    }

    var systemImage: String {
        switch self {
        case .checking: "building.columns"
        case .savings: "banknote"
        case .creditCard: "creditcard"
        case .cash: "dollarsign.circle"
        case .investment: "chart.line.uptrend.xyaxis"
        case .loan: "percent"
        case .other: "ellipsis.circle"
        }
    }
}

// MARK: - Account Item

/// A single financial account (checking, savings, credit card, etc.).
///
/// Conforms to `Hashable` for use as a `NavigationLink` value type.
struct AccountItem: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let balanceMinorUnits: Int64
    let currencyCode: String
    let type: AccountTypeUI
    let icon: String
    let isArchived: Bool
}

// MARK: - Account Group

/// Groups accounts by type for sectioned list display.
struct AccountGroup: Identifiable, Sendable {
    let id: String
    let type: AccountTypeUI
    let accounts: [AccountItem]

    var totalBalance: Int64 { accounts.reduce(0) { $0 + $1.balanceMinorUnits } }
}
