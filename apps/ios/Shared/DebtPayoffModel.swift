// SPDX-License-Identifier: BUSL-1.1

// DebtPayoffModel.swift
// FinanceShared
//
// Pure, dependency-free debt-payoff progress model. Powers the
// "fitness ring" style debt payoff visuals (#2175).
//
// Everything here is Foundation-only and deterministic so it can be
// fully unit tested without UI, a clock, or a repository. Monetary
// values are always integer minor units (e.g. cents) to avoid
// floating-point rounding drift; ratios are the only Doubles exposed.

import Foundation

// MARK: - Debt Payoff Progress

/// Progress of a single debt toward being fully paid off.
///
/// Models "how much of the original principal has been knocked down"
/// in the same spirit as closing an activity ring. All amounts are
/// integer minor units in `currencyCode`.
///
/// Edge cases handled deterministically:
/// - **Zero / negative original principal** — treated as "nothing owed",
///   so progress is complete when the balance is also cleared.
/// - **Overpayment** (balance below zero) — clamped; progress caps at 100%.
/// - **Balance grew** (balance above original) — progress floors at 0%.
/// - **Zero payment** — projection is `nil` ("never" at the current rate).
public struct DebtPayoffProgress: Sendable, Hashable, Identifiable {

    /// Stable identifier for list rendering and diffing.
    public let id: String

    /// Human-readable debt name (e.g. "Grad PLUS Loan").
    public let name: String

    /// Principal originally owed, in minor units. The "ring target".
    public let originalPrincipalMinorUnits: Int64

    /// Current outstanding balance, in minor units. Positive means still owed.
    public let currentBalanceMinorUnits: Int64

    /// Recurring monthly payment, in minor units. Drives the payoff ETA.
    public let monthlyPaymentMinorUnits: Int64

    /// Annual interest rate in basis points (1% == 100 bps). May be zero.
    public let annualInterestRateBasisPoints: Int

    /// ISO 4217 currency code for all monetary fields.
    public let currencyCode: String

    public init(
        id: String,
        name: String,
        originalPrincipalMinorUnits: Int64,
        currentBalanceMinorUnits: Int64,
        monthlyPaymentMinorUnits: Int64,
        annualInterestRateBasisPoints: Int = 0,
        currencyCode: String = "USD"
    ) {
        self.id = id
        self.name = name
        self.originalPrincipalMinorUnits = originalPrincipalMinorUnits
        self.currentBalanceMinorUnits = currentBalanceMinorUnits
        self.monthlyPaymentMinorUnits = monthlyPaymentMinorUnits
        self.annualInterestRateBasisPoints = annualInterestRateBasisPoints
        self.currencyCode = currencyCode
    }

    // MARK: Balances

    /// Remaining balance, clamped so overpayment never reads as negative debt.
    public var remainingBalanceMinorUnits: Int64 {
        max(0, currentBalanceMinorUnits)
    }

    /// Principal paid down so far, clamped to `0...originalPrincipal`.
    public var principalPaidMinorUnits: Int64 {
        let safeOriginal = max(0, originalPrincipalMinorUnits)
        let paid = safeOriginal - remainingBalanceMinorUnits
        return min(safeOriginal, max(0, paid))
    }

    // MARK: Progress

    /// Fraction of the original principal paid off, clamped to `0.0...1.0`.
    ///
    /// When there is no original principal, progress is complete only if
    /// the balance is also cleared (otherwise there is nothing to show, so 0).
    public var fractionComplete: Double {
        let safeOriginal = max(0, originalPrincipalMinorUnits)
        guard safeOriginal > 0 else {
            return remainingBalanceMinorUnits <= 0 ? 1.0 : 0.0
        }
        let ratio = Double(principalPaidMinorUnits) / Double(safeOriginal)
        return min(1.0, max(0.0, ratio))
    }

    /// Whole-number percentage paid off, `0...100`.
    public var percentComplete: Int {
        Int((fractionComplete * 100).rounded())
    }

    /// Whether the debt is fully cleared.
    public var isPaidOff: Bool {
        remainingBalanceMinorUnits <= 0
    }

    // MARK: Projection

    /// Whole months needed to reach a zero balance (principal-only view).
    ///
    /// Deterministic and interest-free so the headline ETA is easy to reason
    /// about. Returns `0` when already paid off, and `nil` when the monthly
    /// payment is zero or negative (the debt is never retired at that rate).
    ///
    /// - Parameter extraMonthlyMinorUnits: optional additional principal
    ///   applied each month, used for "what if I pay more?" comparisons.
    public func monthsToPayoff(extraMonthlyMinorUnits: Int64 = 0) -> Int? {
        guard !isPaidOff else { return 0 }
        let monthly = monthlyPaymentMinorUnits + extraMonthlyMinorUnits
        guard monthly > 0 else { return nil }
        // Ceil division on integers, never overflowing into floating point.
        let remaining = remainingBalanceMinorUnits
        return Int((remaining + monthly - 1) / monthly)
    }

    /// Projected payoff date measured from `referenceDate`.
    ///
    /// Uses a caller-supplied `calendar` so tests stay deterministic across
    /// time zones. Returns `nil` when `monthsToPayoff` is `nil`.
    public func projectedPayoffDate(
        from referenceDate: Date,
        calendar: Calendar = .current,
        extraMonthlyMinorUnits: Int64 = 0
    ) -> Date? {
        guard let months = monthsToPayoff(extraMonthlyMinorUnits: extraMonthlyMinorUnits) else {
            return nil
        }
        return calendar.date(byAdding: .month, value: months, to: referenceDate)
    }

    // MARK: Amortization & interest

    /// Simulates month-by-month amortization including interest.
    ///
    /// Integer minor units throughout, with interest rounded to the nearest
    /// minor unit each month, so results are deterministic and reproducible.
    /// Returns `nil` when the payment cannot cover the monthly interest (the
    /// balance would never reach zero). Capped at 1,200 months (100 years) as
    /// a safety bound.
    ///
    /// - Parameter extraMonthlyMinorUnits: extra principal applied each month.
    public func amortizationSummary(
        extraMonthlyMinorUnits: Int64 = 0
    ) -> DebtAmortizationSummary? {
        guard !isPaidOff else {
            return DebtAmortizationSummary(months: 0, totalInterestMinorUnits: 0)
        }
        let monthlyPayment = monthlyPaymentMinorUnits + extraMonthlyMinorUnits
        guard monthlyPayment > 0 else { return nil }

        let monthlyRate = Double(max(0, annualInterestRateBasisPoints)) / 10_000.0 / 12.0
        var balance = remainingBalanceMinorUnits
        var totalInterest: Int64 = 0
        var months = 0
        let maxMonths = 1_200

        while balance > 0 && months < maxMonths {
            let interest: Int64
            if monthlyRate > 0 {
                interest = Int64((Double(balance) * monthlyRate).rounded())
            } else {
                interest = 0
            }
            // If the payment cannot even cover interest, the debt never clears.
            if monthlyPayment <= interest {
                return nil
            }
            let principalPortion = monthlyPayment - interest
            balance -= principalPortion
            totalInterest += interest
            months += 1
        }

        guard balance <= 0 else { return nil }
        return DebtAmortizationSummary(months: months, totalInterestMinorUnits: totalInterest)
    }

    /// Interest saved (in minor units) by adding `extraMonthlyMinorUnits`
    /// of principal versus the baseline payment.
    ///
    /// Returns `nil` if either scenario never pays off. Never negative.
    public func interestSavedByPayingExtra(
        extraMonthlyMinorUnits: Int64
    ) -> Int64? {
        guard extraMonthlyMinorUnits > 0,
              let base = amortizationSummary(),
              let accelerated = amortizationSummary(extraMonthlyMinorUnits: extraMonthlyMinorUnits)
        else { return nil }
        return max(0, base.totalInterestMinorUnits - accelerated.totalInterestMinorUnits)
    }

    // MARK: Milestones

    /// Milestones already reached, ordered low to high — the "rings closed".
    public var reachedMilestones: [DebtMilestone] {
        DebtMilestone.allCases.filter { percentComplete >= $0.thresholdPercent }
    }

    /// The next milestone still ahead, or `nil` when fully paid off.
    public var nextMilestone: DebtMilestone? {
        DebtMilestone.allCases.first { percentComplete < $0.thresholdPercent }
    }
}

// MARK: - Amortization Summary

/// Result of simulating a debt's amortization to payoff.
public struct DebtAmortizationSummary: Sendable, Hashable {
    /// Number of whole months until the balance reaches zero.
    public let months: Int
    /// Total interest paid over the life of the payoff, in minor units.
    public let totalInterestMinorUnits: Int64

    public init(months: Int, totalInterestMinorUnits: Int64) {
        self.months = months
        self.totalInterestMinorUnits = totalInterestMinorUnits
    }
}

// MARK: - Debt Milestone

/// Reward checkpoints that make debt progress feel like closing rings.
public enum DebtMilestone: Int, CaseIterable, Sendable, Hashable {
    case quarter
    case half
    case threeQuarters
    case paidOff

    /// Percentage at which this milestone unlocks.
    public var thresholdPercent: Int {
        switch self {
        case .quarter: 25
        case .half: 50
        case .threeQuarters: 75
        case .paidOff: 100
        }
    }
}

// MARK: - Debt Portfolio Progress

/// Aggregate progress across multiple debts (the multi-debt rollup).
///
/// Sums original principal and remaining balance, then derives a combined
/// ring. The portfolio is only "paid off" once every debt is cleared, so the
/// projected payoff date is the latest of the individual dates.
public struct DebtPortfolioProgress: Sendable, Hashable {

    /// The individual debts that make up the portfolio.
    public let debts: [DebtPayoffProgress]

    public init(debts: [DebtPayoffProgress]) {
        self.debts = debts
    }

    /// Total original principal across all debts, in minor units.
    public var totalOriginalPrincipalMinorUnits: Int64 {
        debts.reduce(0) { $0 + max(0, $1.originalPrincipalMinorUnits) }
    }

    /// Total remaining balance across all debts, in minor units.
    public var totalRemainingBalanceMinorUnits: Int64 {
        debts.reduce(0) { $0 + $1.remainingBalanceMinorUnits }
    }

    /// Total principal paid across all debts, in minor units.
    public var totalPrincipalPaidMinorUnits: Int64 {
        debts.reduce(0) { $0 + $1.principalPaidMinorUnits }
    }

    /// Combined fraction paid off, clamped to `0.0...1.0`.
    public var fractionComplete: Double {
        let total = totalOriginalPrincipalMinorUnits
        guard total > 0 else {
            return totalRemainingBalanceMinorUnits <= 0 ? 1.0 : 0.0
        }
        let ratio = Double(totalPrincipalPaidMinorUnits) / Double(total)
        return min(1.0, max(0.0, ratio))
    }

    /// Combined whole-number percentage paid off, `0...100`.
    public var percentComplete: Int {
        Int((fractionComplete * 100).rounded())
    }

    /// Whether every debt in the portfolio is cleared.
    public var isAllPaidOff: Bool {
        debts.allSatisfy(\.isPaidOff)
    }

    /// Sum of all monthly payments, in minor units.
    public var totalMonthlyPaymentMinorUnits: Int64 {
        debts.reduce(0) { $0 + $1.monthlyPaymentMinorUnits }
    }

    /// Latest projected payoff date across debts — when the portfolio clears.
    ///
    /// Returns `nil` if any unpaid debt never retires at its current rate.
    public func projectedPayoffDate(
        from referenceDate: Date,
        calendar: Calendar = .current
    ) -> Date? {
        let unpaid = debts.filter { !$0.isPaidOff }
        guard !unpaid.isEmpty else { return referenceDate }

        var latest: Date?
        for debt in unpaid {
            guard let date = debt.projectedPayoffDate(from: referenceDate, calendar: calendar) else {
                return nil
            }
            if let current = latest {
                latest = max(current, date)
            } else {
                latest = date
            }
        }
        return latest
    }
}
