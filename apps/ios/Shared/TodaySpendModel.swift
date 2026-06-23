// SPDX-License-Identifier: BUSL-1.1
// TodaySpendModel.swift - FinanceShared - Refs #2159
//
// Deterministic, testable "today spend" + "fun money remaining" computation.
// Kept free of WidgetKit/SwiftUI so it can be unit-tested in isolation and reused
// by the main app's cache writer. All money is represented in integer minor units
// (cents) to avoid floating-point drift; expenses are negative, income positive.

import Foundation

/// A single transaction as consumed by the today-spend calculator.
///
/// `amountMinorUnits` follows the app-wide convention: negative for outflow
/// (spending), positive for inflow (income/refund).
public struct TodaySpendTransaction: Sendable, Hashable, Codable {
    public let amountMinorUnits: Int64
    public let date: Date
    /// Whether the transaction counts against discretionary / "fun money".
    public let isDiscretionary: Bool

    public init(amountMinorUnits: Int64, date: Date, isDiscretionary: Bool) {
        self.amountMinorUnits = amountMinorUnits
        self.date = date
        self.isDiscretionary = isDiscretionary
    }
}

/// Inputs required to derive a glanceable today-spend summary.
public struct TodaySpendInput: Sendable {
    public let transactions: [TodaySpendTransaction]
    /// Discretionary ("fun money") budget for the active period, in minor units.
    public let discretionaryBudgetMinorUnits: Int64
    public let periodStart: Date
    public let periodEnd: Date
    public let currencyCode: String
    public let referenceDate: Date
    public let updatedAt: Date
    public let calendar: Calendar

    public init(
        transactions: [TodaySpendTransaction],
        discretionaryBudgetMinorUnits: Int64,
        periodStart: Date,
        periodEnd: Date,
        currencyCode: String = "USD",
        referenceDate: Date = Date(),
        updatedAt: Date = Date(),
        calendar: Calendar = .current
    ) {
        self.transactions = transactions
        self.discretionaryBudgetMinorUnits = discretionaryBudgetMinorUnits
        self.periodStart = periodStart
        self.periodEnd = periodEnd
        self.currencyCode = currencyCode
        self.referenceDate = referenceDate
        self.updatedAt = updatedAt
        self.calendar = calendar
    }
}

/// Glanceable, privacy-neutral summary suitable for caching and widget rendering.
public struct TodaySpendSummary: Sendable, Hashable, Codable {
    /// Total spent today (absolute value of today's outflows), minor units.
    public let todaySpentMinorUnits: Int64
    /// Discretionary spent across the active period, minor units.
    public let periodDiscretionarySpentMinorUnits: Int64
    /// Discretionary budget for the active period, minor units.
    public let discretionaryBudgetMinorUnits: Int64
    public let currencyCode: String
    /// When the underlying data was last refreshed.
    public let updatedAt: Date

    public init(
        todaySpentMinorUnits: Int64,
        periodDiscretionarySpentMinorUnits: Int64,
        discretionaryBudgetMinorUnits: Int64,
        currencyCode: String,
        updatedAt: Date
    ) {
        self.todaySpentMinorUnits = todaySpentMinorUnits
        self.periodDiscretionarySpentMinorUnits = periodDiscretionarySpentMinorUnits
        self.discretionaryBudgetMinorUnits = discretionaryBudgetMinorUnits
        self.currencyCode = currencyCode
        self.updatedAt = updatedAt
    }

    /// Remaining fun money for the period (may be negative when overspent).
    public var funMoneyRemainingMinorUnits: Int64 {
        discretionaryBudgetMinorUnits - periodDiscretionarySpentMinorUnits
    }

    /// Fraction of the discretionary budget consumed, clamped to `0...1` for gauges.
    public var funMoneyProgress: Double {
        guard discretionaryBudgetMinorUnits > 0 else { return 0 }
        let raw = Double(periodDiscretionarySpentMinorUnits) / Double(discretionaryBudgetMinorUnits)
        return min(max(raw, 0), 1)
    }

    public var isOverFunBudget: Bool {
        funMoneyRemainingMinorUnits < 0
    }

    public var hasDiscretionaryBudget: Bool {
        discretionaryBudgetMinorUnits > 0
    }

    /// Empty/placeholder summary used when no cache exists yet.
    public static func empty(
        currencyCode: String = "USD",
        updatedAt: Date = .distantPast
    ) -> TodaySpendSummary {
        TodaySpendSummary(
            todaySpentMinorUnits: 0,
            periodDiscretionarySpentMinorUnits: 0,
            discretionaryBudgetMinorUnits: 0,
            currencyCode: currencyCode,
            updatedAt: updatedAt
        )
    }
}

/// Pure, deterministic reducer that turns raw transactions into a summary.
public enum TodaySpendCalculator {
    public static func summarize(_ input: TodaySpendInput) -> TodaySpendSummary {
        var todaySpent: Int64 = 0
        var periodDiscretionarySpent: Int64 = 0

        for transaction in input.transactions {
            // Only outflows (negative amounts) count as spend.
            guard transaction.amountMinorUnits < 0 else { continue }
            let magnitude = abs(transaction.amountMinorUnits)

            if input.calendar.isDate(transaction.date, inSameDayAs: input.referenceDate) {
                todaySpent += magnitude
            }

            if transaction.isDiscretionary,
               isDate(transaction.date, within: input.periodStart, and: input.periodEnd) {
                periodDiscretionarySpent += magnitude
            }
        }

        return TodaySpendSummary(
            todaySpentMinorUnits: todaySpent,
            periodDiscretionarySpentMinorUnits: periodDiscretionarySpent,
            discretionaryBudgetMinorUnits: input.discretionaryBudgetMinorUnits,
            currencyCode: input.currencyCode,
            updatedAt: input.updatedAt
        )
    }

    /// Inclusive range membership that tolerates a reversed start/end pair.
    private static func isDate(_ date: Date, within start: Date, and end: Date) -> Bool {
        let lower = min(start, end)
        let upper = max(start, end)
        return date >= lower && date <= upper
    }
}

/// Freshness evaluation so widgets can communicate trustworthiness at a glance.
public enum TodaySpendFreshness {
    /// Cached data older than this is treated as stale and visually de-emphasised.
    public static let defaultMaxAge: TimeInterval = 6 * 60 * 60 // 6 hours

    public static func age(of updatedAt: Date, now: Date = Date()) -> TimeInterval {
        max(now.timeIntervalSince(updatedAt), 0)
    }

    public static func isStale(
        updatedAt: Date,
        now: Date = Date(),
        maxAge: TimeInterval = defaultMaxAge
    ) -> Bool {
        age(of: updatedAt, now: now) > maxAge
    }
}

/// Pure refresh-cadence logic for the today-spend timeline provider.
///
/// The cadence tightens as discretionary budget depletes so the persona who checks
/// "can I afford to go out tonight?" sees an up-to-date number when it matters most.
public enum TodaySpendRefreshPolicy {
    public static let relaxedInterval: TimeInterval = 60 * 60       // 1 hour
    public static let tightInterval: TimeInterval = 30 * 60         // 30 minutes
    public static let lowBudgetThreshold: Double = 0.8

    public static func refreshInterval(for summary: TodaySpendSummary) -> TimeInterval {
        if summary.isOverFunBudget { return tightInterval }
        if summary.hasDiscretionaryBudget, summary.funMoneyProgress >= lowBudgetThreshold {
            return tightInterval
        }
        return relaxedInterval
    }

    public static func nextRefreshDate(
        after now: Date,
        summary: TodaySpendSummary
    ) -> Date {
        now.addingTimeInterval(refreshInterval(for: summary))
    }
}
