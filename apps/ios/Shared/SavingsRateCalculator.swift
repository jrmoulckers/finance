// SPDX-License-Identifier: BUSL-1.1
// SavingsRateCalculator.swift - FinanceShared - Refs #2162
//
// A pure, dependency-free savings-rate calculator for the FIRE-focused
// dashboard. All money is expressed in integer minor units (e.g. cents) so
// the math is exact and deterministic — no floating-point currency drift.
//
// "Savings rate" is the share of income that was *not* spent in a period:
//
//     savingsRate% = (income - spending) / income * 100
//
// This type is intentionally free of any UI, KMP bridge, or Foundation date
// dependencies beyond `Date` (used only by the partial-period helper) so it
// can be exhaustively unit-tested in isolation.

import Foundation

/// The outcome of a savings-rate computation for a single period.
///
/// `percent` is only meaningful when `isDefined` is `true`. When income is
/// zero or negative the rate is mathematically undefined; callers should show
/// a neutral placeholder rather than a misleading "0%".
public struct SavingsRateResult: Sendable, Equatable {
    /// Savings rate in percentage points (e.g. `65.0` means 65%).
    ///
    /// Can be negative when spending exceeds income (dissaving). Equal to `0`
    /// — and not meaningful — when `isDefined` is `false`.
    public let percent: Double

    /// Amount kept (or, when negative, overspent) in integer minor units.
    /// Always `income - spending`, even when the percentage is undefined.
    public let savedMinorUnits: Int64

    /// Income for the period in integer minor units.
    public let incomeMinorUnits: Int64

    /// Spending for the period in integer minor units (a positive magnitude).
    public let spendingMinorUnits: Int64

    /// `true` when income was positive and `percent` is meaningful.
    public let isDefined: Bool

    public init(
        percent: Double,
        savedMinorUnits: Int64,
        incomeMinorUnits: Int64,
        spendingMinorUnits: Int64,
        isDefined: Bool
    ) {
        self.percent = percent
        self.savedMinorUnits = savedMinorUnits
        self.incomeMinorUnits = incomeMinorUnits
        self.spendingMinorUnits = spendingMinorUnits
        self.isDefined = isDefined
    }

    /// A neutral result used when there is no usable income for the period.
    public static let undefined = SavingsRateResult(
        percent: 0,
        savedMinorUnits: 0,
        incomeMinorUnits: 0,
        spendingMinorUnits: 0,
        isDefined: false
    )
}

/// The direction a savings rate has moved between two periods.
public enum SavingsRateTrend: Sendable, Equatable {
    /// Savings rate rose by `deltaPoints` percentage points (always > 0).
    case improving(deltaPoints: Double)
    /// Savings rate fell by `deltaPoints` percentage points (always > 0).
    case declining(deltaPoints: Double)
    /// The change was within the neutral threshold; treated as steady.
    case flat
    /// One or both periods lacked the income needed to compute a rate.
    case notEnoughData

    /// The signed change in percentage points, or `0` for `flat` /
    /// `notEnoughData`. Positive means improvement.
    public var signedDeltaPoints: Double {
        switch self {
        case let .improving(delta): return delta
        case let .declining(delta): return -delta
        case .flat, .notEnoughData: return 0
        }
    }
}

/// Stateless savings-rate math. All members are `static` — there is nothing
/// to instantiate.
public enum SavingsRateCalculator {
    /// Minimum absolute change, in percentage points, for a period-over-period
    /// movement to count as a real trend rather than noise.
    public static let trendThresholdPoints: Double = 0.1

    /// Computes the savings rate for a single period from raw income and
    /// spending in integer minor units.
    ///
    /// - Parameters:
    ///   - incomeMinorUnits: Total income for the period (minor units).
    ///   - spendingMinorUnits: Total spending for the period as a positive
    ///     magnitude (minor units).
    /// - Returns: A `SavingsRateResult`. When `incomeMinorUnits <= 0` the
    ///   result is flagged `isDefined == false` and `percent == 0`, while
    ///   `savedMinorUnits` still reflects `income - spending`.
    ///
    /// - Note: Because the rate is a *ratio*, computing it on a partial period
    ///   (e.g. mid-month) yields a value directly comparable to a full period:
    ///   scaling both income and spending by the same elapsed fraction leaves
    ///   the ratio unchanged. See ``elapsedFraction(start:end:asOf:)``.
    public static func savingsRate(
        incomeMinorUnits: Int64,
        spendingMinorUnits: Int64
    ) -> SavingsRateResult {
        // Saturating subtraction guards against Int64 overflow on absurd input
        // while staying exact for any realistic monetary value.
        let saved = incomeMinorUnits.subtractingReportingOverflow(spendingMinorUnits)
        let savedMinorUnits = saved.overflow
            ? (spendingMinorUnits > 0 ? Int64.max : Int64.min)
            : saved.partialValue

        guard incomeMinorUnits > 0 else {
            return SavingsRateResult(
                percent: 0,
                savedMinorUnits: savedMinorUnits,
                incomeMinorUnits: incomeMinorUnits,
                spendingMinorUnits: spendingMinorUnits,
                isDefined: false
            )
        }

        let percent = (Double(savedMinorUnits) / Double(incomeMinorUnits)) * 100.0
        return SavingsRateResult(
            percent: percent,
            savedMinorUnits: savedMinorUnits,
            incomeMinorUnits: incomeMinorUnits,
            spendingMinorUnits: spendingMinorUnits,
            isDefined: true
        )
    }

    /// Classifies the movement from a `previous` period to a `current` period.
    ///
    /// Returns `.notEnoughData` if either result is undefined. Changes smaller
    /// than ``trendThresholdPoints`` are reported as `.flat`.
    public static func trend(
        current: SavingsRateResult,
        previous: SavingsRateResult
    ) -> SavingsRateTrend {
        guard current.isDefined, previous.isDefined else { return .notEnoughData }
        let delta = current.percent - previous.percent
        guard abs(delta) >= trendThresholdPoints else { return .flat }
        return delta > 0 ? .improving(deltaPoints: delta) : .declining(deltaPoints: abs(delta))
    }

    /// Pools income and spending across multiple periods to produce a single
    /// trailing savings rate (e.g. trailing-3-month).
    ///
    /// Pooling the underlying minor units — rather than averaging each period's
    /// percentage — weights every period by its income, which is the
    /// financially correct way to summarise a savings rate across months.
    /// Undefined periods (no income) are ignored. Returns
    /// ``SavingsRateResult/undefined`` when there is nothing to pool.
    public static func trailingAverage(of results: [SavingsRateResult]) -> SavingsRateResult {
        let defined = results.filter(\.isDefined)
        guard !defined.isEmpty else { return .undefined }

        let income = defined.reduce(Int64(0)) { $0 + $1.incomeMinorUnits }
        let spending = defined.reduce(Int64(0)) { $0 + $1.spendingMinorUnits }
        return savingsRate(incomeMinorUnits: income, spendingMinorUnits: spending)
    }

    /// The fraction (0...1) of a date interval that has elapsed as of `asOf`.
    ///
    /// Useful for callers that want to know how complete the current period is
    /// before presenting an in-progress savings rate. Clamps to `0...1` and
    /// returns `0` for non-positive intervals.
    public static func elapsedFraction(start: Date, end: Date, asOf: Date) -> Double {
        let total = end.timeIntervalSince(start)
        guard total > 0 else { return 0 }
        let elapsed = asOf.timeIntervalSince(start)
        return min(max(elapsed / total, 0), 1)
    }
}
