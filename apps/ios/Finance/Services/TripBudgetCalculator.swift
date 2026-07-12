// SPDX-License-Identifier: BUSL-1.1

// TripBudgetCalculator.swift
// Finance
//
// Pure, unit-testable logic for measuring spend against a trip/country budget.
// Uses each transaction's *preserved local day* (#2206) so a purchase made at
// 11:50 PM in Bangkok counts toward the correct trip day even when reviewed
// later from another timezone (#2205).

import Foundation

/// Progress of spend against a single trip budget.
struct TripBudgetProgress: Equatable, Sendable {
    let spentMinorUnits: Int64
    let limitMinorUnits: Int64
    let transactionCount: Int

    /// True when spend included amounts converted from another currency.
    let containsConversions: Bool

    /// True when a conversion relied on a stale/offline or missing rate.
    let usedStaleRate: Bool

    /// Amount left before hitting the limit (can go negative when over).
    var remainingMinorUnits: Int64 { limitMinorUnits - spentMinorUnits }

    /// Fraction of the limit consumed (0…1+).
    var fraction: Double {
        guard limitMinorUnits > 0 else { return 0 }
        return Double(spentMinorUnits) / Double(limitMinorUnits)
    }

    /// Whether spend has exceeded the limit.
    var isOverBudget: Bool { spentMinorUnits > limitMinorUnits }

    static let zero = TripBudgetProgress(
        spentMinorUnits: 0,
        limitMinorUnits: 0,
        transactionCount: 0,
        containsConversions: false,
        usedStaleRate: false
    )
}

/// Filters and measures transactions against trip budgets.
enum TripBudgetCalculator {
    /// Whether a transaction belongs to a trip: its preserved local day must
    /// fall within the trip's range and, when the trip specifies a match tag,
    /// the transaction must carry that tag (case-insensitive).
    static func matches(
        _ transaction: TransactionItem,
        trip: TripBudget,
        calendar: Calendar = .current
    ) -> Bool {
        guard trip.containsDay(transaction.localDay, calendar: calendar) else { return false }

        let tag = trip.matchTag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !tag.isEmpty else { return true }
        return transaction.tagNames.contains { $0.caseInsensitiveCompare(tag) == .orderedSame }
    }

    /// Transactions that belong to the trip, newest first.
    static func transactions(
        for trip: TripBudget,
        in transactions: [TransactionItem],
        calendar: Calendar = .current
    ) -> [TransactionItem] {
        transactions
            .filter { matches($0, trip: trip, calendar: calendar) }
            .sorted { $0.localDay > $1.localDay }
    }

    /// Computes spend progress for a trip. Only expenses count; income and
    /// transfers are ignored. When a `converter` is supplied, foreign-currency
    /// amounts are converted into the trip currency and flagged accordingly;
    /// otherwise amounts are summed as-is.
    static func progress(
        for trip: TripBudget,
        in transactions: [TransactionItem],
        converter: CurrencyConverter? = nil,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> TripBudgetProgress {
        let members = Self.transactions(for: trip, in: transactions, calendar: calendar)
        let expenses = members.filter { $0.type == .expense }

        var spent: Int64 = 0
        var converted = false
        var stale = false

        for expense in expenses {
            let magnitude = abs(expense.amountMinorUnits)
            if expense.currencyCode.uppercased() == trip.currencyCode.uppercased() {
                spent += magnitude
            } else if let converter {
                let result = converter.convert(minorUnits: magnitude, from: expense.currencyCode, now: now)
                spent += result.minorUnits
                converted = converted || result.isConverted
                stale = stale || result.usedStaleRate
            } else {
                // No converter: sum raw magnitude but flag that the total mixes
                // currencies so the UI can disclose it is approximate.
                spent += magnitude
                converted = true
                stale = true
            }
        }

        return TripBudgetProgress(
            spentMinorUnits: spent,
            limitMinorUnits: trip.limitMinorUnits,
            transactionCount: expenses.count,
            containsConversions: converted,
            usedStaleRate: stale
        )
    }
}
