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

    var iconToken: IconToken {
        switch self {
        case .expense: .expense
        case .income: .income
        case .transfer: .transfer
        }
    }

    var color: Color {
        switch self {
        case .expense: FinanceColors.statusNegative
        case .income: FinanceColors.statusPositive
        case .transfer: FinanceColors.statusInfo
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
    let notes: String
    let tagNames: [String]
    let moodTag: String?
    let isRecurring: Bool
    let receiptData: Data?
    let tags: [Tag]

    /// Absolute instant of the purchase, when known. Preserves the exact
    /// moment across timezone changes so day-based reporting stays stable.
    /// `nil` for legacy/manual entries that recorded only a calendar date (#2206).
    let timestamp: Date?

    /// Identifier of the timezone in effect where the purchase happened
    /// (e.g. "Asia/Bangkok"). `nil` falls back to the device timezone.
    let timeZoneIdentifier: String?

    /// Convenience: `true` when the transaction type is `.expense`.
    var isExpense: Bool { type == .expense }

    /// Rich local timestamp for this transaction. Uses the preserved instant
    /// and zone when available, otherwise degrades to the calendar `date` in
    /// the device timezone.
    var localTimestamp: TransactionTimestamp {
        TransactionTimestamp(instant: timestamp ?? date, timeZoneIdentifier: timeZoneIdentifier)
    }

    /// Stable calendar day of the purchase in its original timezone. Use this
    /// for day/trip bucketing so a border crossing never shifts the day.
    var localDay: Date { localTimestamp.localDay }

    /// Whether this transaction preserved a full timestamp and timezone.
    var hasPreservedTimeZone: Bool { timestamp != nil && timeZoneIdentifier != nil }

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
        notes: String = "",
        tagNames: [String] = [],
        moodTag: String? = nil,
        isRecurring: Bool = false,
        receiptData: Data? = nil,
        tags: [Tag] = [],
        timestamp: Date? = nil,
        timeZoneIdentifier: String? = nil
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
        self.notes = notes
        self.tagNames = tagNames
        self.moodTag = moodTag
        self.isRecurring = isRecurring
        self.receiptData = receiptData
        self.tags = tags
        self.timestamp = timestamp
        self.timeZoneIdentifier = timeZoneIdentifier
    }
}
