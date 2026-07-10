// SPDX-License-Identifier: BUSL-1.1

// BillModels.swift
// Finance
//
// Data models for bill reminder management. Maps KMP shared types
// (RecurrenceRule, Reminder) to Swift-native structs for SwiftUI consumption.
// All monetary values are in minor units (cents).
//
// References: #1121

import SwiftUI

// MARK: - Bill Frequency

/// How often a bill recurs, mirroring KMP `RecurrenceFrequency`.
enum BillFrequency: String, CaseIterable, Hashable, Sendable {
    case weekly, biweekly, monthly, yearly

    var displayName: String {
        switch self {
        case .weekly: String(localized: "Weekly")
        case .biweekly: String(localized: "Every 2 Weeks")
        case .monthly: String(localized: "Monthly")
        case .yearly: String(localized: "Yearly")
        }
    }

    var systemImage: String {
        switch self {
        case .weekly: "calendar.badge.clock"
        case .biweekly: "calendar"
        case .monthly: "calendar.circle"
        case .yearly: "calendar.badge.exclamationmark"
        }
    }
}

// MARK: - Bill Status

/// Current status of a bill payment.
enum BillStatus: String, CaseIterable, Hashable, Sendable {
    case upcoming, overdue, paid

    var displayName: String {
        switch self {
        case .upcoming: String(localized: "Upcoming")
        case .overdue: String(localized: "Overdue")
        case .paid: String(localized: "Paid")
        }
    }

    var color: Color {
        switch self {
        case .upcoming: FinanceColors.statusInfo
        case .overdue: FinanceColors.statusNegative
        case .paid: FinanceColors.statusPositive
        }
    }

    var systemImage: String {
        switch self {
        case .upcoming: "clock"
        case .overdue: "exclamationmark.circle.fill"
        case .paid: "checkmark.circle.fill"
        }
    }
}

// MARK: - Bill Item

/// A single bill or recurring payment with reminder information.
struct BillItem: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let payee: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let frequency: BillFrequency
    let dueDate: Date
    let nextDueDate: Date
    let categoryName: String
    let icon: String
    let isAutoPay: Bool
    let notes: String
    let status: BillStatus
    let reminderDaysBefore: Int
    let createdAt: Date

    /// Days until the next due date.
    var daysUntilDue: Int {
        Calendar.current.dateComponents([.day], from: .now, to: nextDueDate).day ?? 0
    }

    /// Whether the bill is due within 3 days.
    var isDueSoon: Bool { daysUntilDue >= 0 && daysUntilDue <= 3 }

    /// Human-readable due date description.
    var dueDateText: String {
        let days = daysUntilDue
        if days < 0 { return String(localized: "Overdue by \(abs(days)) days") }
        if days == 0 { return String(localized: "Due today") }
        if days == 1 { return String(localized: "Due tomorrow") }
        return String(localized: "Due in \(days) days")
    }

    /// Color for the due date label.
    var dueDateColor: Color {
        if daysUntilDue < 0 { return .red }
        if daysUntilDue <= 3 { return .orange }
        return .secondary
    }
}

// MARK: - Bill Payment Record

/// A historical payment record for a bill.
struct BillPaymentRecord: Identifiable, Sendable {
    let id: String
    let billId: String
    let amountMinorUnits: Int64
    let currencyCode: String
    let paidDate: Date
    let isLate: Bool
}
