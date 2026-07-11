// SPDX-License-Identifier: BUSL-1.1

// NetWorthTrendCalculator.swift
// Finance
//
// Pure, deterministic reconstruction of a net-worth trend line from the
// current net worth plus historical transaction flows, and a simple
// forward projection based on recent savings pace. Kept free of SwiftUI so
// it is fully unit-testable and reusable across the Dashboard and Accounts
// surfaces.
//
// Net worth today is a known quantity (sum of account balances). Working
// backwards, net worth at the end of an earlier month equals today's net
// worth minus every income/expense flow that happened after that month.
// Transfers move money between accounts and so do not change net worth.
//
// References: #2116

import Foundation

// MARK: - Net Worth Trend Point

/// A single point on the net-worth trend line.
struct NetWorthTrendPoint: Identifiable, Sendable {
    let id = UUID()
    let date: Date
    let valueMinorUnits: Int64
    /// Whether the point is a forward projection rather than reconstructed history.
    let isProjected: Bool
}

// MARK: - Range

/// Selectable look-back windows for the net-worth trend.
enum NetWorthTrendRange: String, CaseIterable, Identifiable, Sendable {
    case threeMonths
    case sixMonths
    case oneYear
    case all

    var id: String { rawValue }

    /// Number of trailing months to show, or `nil` for "all available".
    var months: Int? {
        switch self {
        case .threeMonths: 3
        case .sixMonths: 6
        case .oneYear: 12
        case .all: nil
        }
    }

    var shortLabel: String {
        switch self {
        case .threeMonths: String(localized: "3M")
        case .sixMonths: String(localized: "6M")
        case .oneYear: String(localized: "1Y")
        case .all: String(localized: "All")
        }
    }
}

// MARK: - Calculator

enum NetWorthTrendCalculator {

    /// Reconstructs a monthly net-worth history ending at the current value.
    ///
    /// - Parameters:
    ///   - currentNetWorthMinorUnits: Today's net worth.
    ///   - transactions: All available transactions (any order).
    ///   - months: Number of trailing months to produce, including the current
    ///     month. Values below 1 are treated as 1.
    ///   - now: The reference "today" date.
    ///   - calendar: Calendar used for month bucketing.
    /// - Returns: One point per month, oldest first, ending at `now`.
    static func history(
        currentNetWorthMinorUnits: Int64,
        transactions: [TransactionItem],
        months: Int,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> [NetWorthTrendPoint] {
        let monthCount = max(1, months)
        let startOfThisMonth = calendar.date(
            from: calendar.dateComponents([.year, .month], from: now)
        ) ?? now

        // Month-start dates, oldest first, one per requested month.
        let monthStarts: [Date] = (0..<monthCount).reversed().compactMap { offset in
            calendar.date(byAdding: .month, value: -offset, to: startOfThisMonth)
        }

        // Net flow (income + signed expenses, excluding transfers) per month start.
        var flowByMonth: [Date: Int64] = [:]
        for txn in transactions where txn.type != .transfer {
            let monthStart = calendar.date(
                from: calendar.dateComponents([.year, .month], from: txn.date)
            ) ?? txn.date
            flowByMonth[monthStart, default: 0] += txn.amountMinorUnits
        }

        // Walk backwards from the current month subtracting each month's flow.
        var runningValue = currentNetWorthMinorUnits
        var reversed: [NetWorthTrendPoint] = []
        for (index, monthStart) in monthStarts.enumerated().reversed() {
            reversed.append(
                NetWorthTrendPoint(
                    date: monthStart,
                    valueMinorUnits: runningValue,
                    isProjected: false
                )
            )
            // Subtract this month's flow to get the previous month's ending value,
            // unless this is the oldest point we need.
            if index > 0 {
                let flow = flowByMonth[monthStart] ?? 0
                runningValue -= flow
            }
        }

        return reversed.reversed()
    }

    /// Average monthly net savings (income minus spending, excluding transfers)
    /// over the trailing `months`, in minor units. Used to set a projection pace.
    static func averageMonthlySavings(
        transactions: [TransactionItem],
        months: Int,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> Int64 {
        let monthCount = max(1, months)
        let startOfThisMonth = calendar.date(
            from: calendar.dateComponents([.year, .month], from: now)
        ) ?? now
        let cutoff = calendar.date(byAdding: .month, value: -(monthCount - 1), to: startOfThisMonth) ?? startOfThisMonth

        let total = transactions
            .filter { $0.type != .transfer && $0.date >= cutoff }
            .reduce(Int64(0)) { $0 + $1.amountMinorUnits }

        return total / Int64(monthCount)
    }

    /// Builds a forward projection continuing from the last history point at a
    /// fixed monthly savings pace (linear — no market growth assumption, since
    /// net worth includes cash and debt).
    ///
    /// - Returns: `months` future points (does not repeat the anchor point).
    static func projection(
        from anchor: NetWorthTrendPoint,
        monthlySavingsMinorUnits: Int64,
        months: Int,
        calendar: Calendar = .current
    ) -> [NetWorthTrendPoint] {
        guard months > 0 else { return [] }
        var points: [NetWorthTrendPoint] = []
        var value = anchor.valueMinorUnits
        for step in 1...months {
            value += monthlySavingsMinorUnits
            let date = calendar.date(byAdding: .month, value: step, to: anchor.date) ?? anchor.date
            points.append(
                NetWorthTrendPoint(date: date, valueMinorUnits: value, isProjected: true)
            )
        }
        return points
    }
}
