// SPDX-License-Identifier: BUSL-1.1

// CompoundGrowthProjector.swift
// Finance
//
// Pure, deterministic compound-growth math for long-term investment and
// net-worth projections. Kept free of SwiftUI so it is fully unit-testable
// and can be reused by the investment portfolio and net-worth surfaces.
//
// All monetary values are in minor units (cents). Monthly compounding with
// end-of-month contributions models a passive index-fund investor who adds a
// fixed amount every month.
//
// References: #2118, #2116

import Foundation

// MARK: - Projection Point

/// A single point on a compound-growth projection curve.
struct ProjectionPoint: Identifiable, Sendable {
    let id = UUID()

    /// The date this point represents.
    let date: Date

    /// Projected total balance in minor units.
    let valueMinorUnits: Int64

    /// Cumulative principal (starting balance + contributions made so far),
    /// in minor units. The gap between `valueMinorUnits` and this value is
    /// growth from market returns.
    let contributedMinorUnits: Int64

    /// Whether this point is a future projection (`true`) or the present
    /// starting balance (`false`).
    let isProjected: Bool

    /// Projected market growth (value minus contributed principal).
    var growthMinorUnits: Int64 { valueMinorUnits - contributedMinorUnits }
}

// MARK: - Projector

/// Deterministic compound-growth projector using monthly compounding with
/// end-of-month contributions.
enum CompoundGrowthProjector {

    /// A reasonable default long-run annual return for a diversified,
    /// low-cost index portfolio (nominal, before inflation).
    static let defaultAnnualReturnRate = 0.07

    /// Projects a balance forward month-by-month and samples one point per
    /// year (plus the starting point at year 0).
    ///
    /// - Parameters:
    ///   - currentMinorUnits: Starting balance in minor units.
    ///   - monthlyContributionMinorUnits: Fixed contribution added at the end
    ///     of every month, in minor units.
    ///   - annualReturnRate: Expected nominal annual return (e.g. `0.07`).
    ///   - years: Projection horizon in whole years (clamped to `0...80`).
    ///   - startDate: The date of the year-0 point.
    ///   - calendar: Calendar used to advance the sample dates.
    /// - Returns: `years + 1` points, oldest first.
    static func project(
        currentMinorUnits: Int64,
        monthlyContributionMinorUnits: Int64,
        annualReturnRate: Double = defaultAnnualReturnRate,
        years: Int,
        startDate: Date = .now,
        calendar: Calendar = .current
    ) -> [ProjectionPoint] {
        let horizon = max(0, min(years, 80))
        let monthlyRate = annualReturnRate / 12.0

        var balance = Double(currentMinorUnits)
        var contributed = Double(currentMinorUnits)

        var points: [ProjectionPoint] = [
            ProjectionPoint(
                date: startDate,
                valueMinorUnits: currentMinorUnits,
                contributedMinorUnits: currentMinorUnits,
                isProjected: false
            )
        ]

        guard horizon > 0 else { return points }

        for year in 1...horizon {
            for _ in 0..<12 {
                balance = balance * (1.0 + monthlyRate) + Double(monthlyContributionMinorUnits)
                contributed += Double(monthlyContributionMinorUnits)
            }
            let date = calendar.date(byAdding: .year, value: year, to: startDate) ?? startDate
            points.append(
                ProjectionPoint(
                    date: date,
                    valueMinorUnits: Int64(balance.rounded()),
                    contributedMinorUnits: Int64(contributed.rounded()),
                    isProjected: true
                )
            )
        }

        return points
    }

    /// Returns the projected future value after a whole number of `months`.
    static func futureValue(
        currentMinorUnits: Int64,
        monthlyContributionMinorUnits: Int64,
        annualReturnRate: Double = defaultAnnualReturnRate,
        months: Int
    ) -> Int64 {
        let count = max(0, months)
        let monthlyRate = annualReturnRate / 12.0
        var balance = Double(currentMinorUnits)
        for _ in 0..<count {
            balance = balance * (1.0 + monthlyRate) + Double(monthlyContributionMinorUnits)
        }
        return Int64(balance.rounded())
    }
}
