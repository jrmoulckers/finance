// SPDX-License-Identifier: BUSL-1.1

// TransactionItem.swift
// Finance
//
// Unified transaction data model used by Dashboard, Accounts, Transactions,
// and TransactionCreate screens. Extracted to enable repository-based sourcing.

import SwiftUI

// MARK: - Transaction Type

/// Visual representation of transaction direction.
enum TransactionTypeUI: String, CaseIterable, Hashable, Sendable {
    case expense, income, transfer

    var displayName: String {
        switch self {
        case .expense: String(localized: "Expense")
        case .income: String(localized: "Income")
        case .transfer: String(localized: "Transfer")
        }
    }

    var systemImage: String {
        switch self {
        case .expense: "arrow.up.right"
        case .income: "arrow.down.left"
        case .transfer: "arrow.left.arrow.right"
        }
    }

    var color: Color {
        switch self {
        case .expense: .red
        case .income: .green
        case .transfer: .blue
        }
    }
}

// MARK: - Transaction Status

/// Clearance status of a transaction.
enum TransactionStatusUI: String, CaseIterable, Hashable, Sendable {
    case pending, cleared, reconciled, voided

    var displayName: String {
        switch self {
        case .pending: String(localized: "Pending")
        case .cleared: String(localized: "Cleared")
        case .reconciled: String(localized: "Reconciled")
        case .voided: String(localized: "Void")
        }
    }
}

// MARK: - Transaction Item

/// A single financial transaction.
///
/// This is the unified model used across all screens. Views that need fewer
/// fields (e.g., Dashboard) use default values for `accountName`, `type`, and `status`.
struct TransactionItem: Identifiable, Hashable, Sendable {
    let id: String
    let payee: String
    let category: String
    let accountName: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let date: Date
    let type: TransactionTypeUI
    let status: TransactionStatusUI
    let note: String?

    /// Convenience: `true` when the transaction type is `.expense`.
    var isExpense: Bool { type == .expense }

    init(
        id: String,
        payee: String,
        category: String,
        accountName: String = "",
        amountMinorUnits: Int64,
        currencyCode: String,
        date: Date,
        type: TransactionTypeUI = .expense,
        status: TransactionStatusUI = .cleared,
        note: String? = nil
    ) {
        self.id = id
        self.payee = payee
        self.category = category
        self.accountName = accountName
        self.amountMinorUnits = amountMinorUnits
        self.currencyCode = currencyCode
        self.date = date
        self.type = type
        self.status = status
        self.note = note
    }
}
