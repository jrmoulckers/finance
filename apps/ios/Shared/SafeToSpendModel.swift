// SPDX-License-Identifier: BUSL-1.1
// SafeToSpendModel.swift - FinanceShared - Refs #2199
//
// A pure, dependency-free "can I afford this?" calculator for the grocery-aisle
// decision moment. All money is expressed in integer minor units (cents) so the
// math is exact and deterministic. No UI, KMP, or networking dependencies — this
// type is fully unit-testable in isolation.
//
// The question this answers, in the store, in seconds: "How much can I safely
// spend right now, before my next payday and the critical bills that land before
// it?" — framed supportively, never as a red-alert.

import Foundation

/// A critical outflow (bill or one-off kid expense) that must be reserved from
/// cleared cash before the next payday.
public struct SafeToSpendObligation: Sendable, Hashable, Codable {
    public let amountMinorUnits: Int64
    public let dueDate: Date
    /// Whether this obligation is essential (rent, utilities, childcare). Only
    /// essential obligations are reserved from the "safe to spend" figure.
    public let isCritical: Bool

    public init(amountMinorUnits: Int64, dueDate: Date, isCritical: Bool) {
        self.amountMinorUnits = amountMinorUnits
        self.dueDate = dueDate
        self.isCritical = isCritical
    }
}

/// Inputs for the safe-to-spend computation.
public struct SafeToSpendInput: Sendable {
    /// Cash that has actually cleared and is available right now, in minor units.
    public let clearedCashMinorUnits: Int64
    /// The date the user's next reliable income lands (payday).
    public let nextPaydayDate: Date
    /// Critical obligations that could land between now and payday.
    public let obligations: [SafeToSpendObligation]
    /// Remaining budget for the pinned high-frequency category (e.g. Groceries),
    /// in minor units, if the user has pinned one. `nil` when not configured.
    public let pinnedCategoryRemainingMinorUnits: Int64?
    public let pinnedCategoryName: String?
    public let currencyCode: String
    public let referenceDate: Date

    public init(
        clearedCashMinorUnits: Int64,
        nextPaydayDate: Date,
        obligations: [SafeToSpendObligation],
        pinnedCategoryRemainingMinorUnits: Int64? = nil,
        pinnedCategoryName: String? = nil,
        currencyCode: String = "USD",
        referenceDate: Date = Date()
    ) {
        self.clearedCashMinorUnits = clearedCashMinorUnits
        self.nextPaydayDate = nextPaydayDate
        self.obligations = obligations
        self.pinnedCategoryRemainingMinorUnits = pinnedCategoryRemainingMinorUnits
        self.pinnedCategoryName = pinnedCategoryName
        self.currencyCode = currencyCode
        self.referenceDate = referenceDate
    }
}

/// The glanceable "safe to spend" answer.
public struct SafeToSpendResult: Sendable, Hashable, Codable {
    /// Cash safe to spend before the next payday after reserving critical bills.
    public let safeToSpendMinorUnits: Int64
    /// Sum of critical obligations reserved (positive magnitude), minor units.
    public let reservedForBillsMinorUnits: Int64
    /// Remaining amount for the pinned category, if any. `nil` when unset.
    public let pinnedCategoryRemainingMinorUnits: Int64?
    public let pinnedCategoryName: String?
    /// Whole days until the next payday (never negative).
    public let daysUntilPayday: Int
    public let currencyCode: String

    public init(
        safeToSpendMinorUnits: Int64,
        reservedForBillsMinorUnits: Int64,
        pinnedCategoryRemainingMinorUnits: Int64?,
        pinnedCategoryName: String?,
        daysUntilPayday: Int,
        currencyCode: String
    ) {
        self.safeToSpendMinorUnits = safeToSpendMinorUnits
        self.reservedForBillsMinorUnits = reservedForBillsMinorUnits
        self.pinnedCategoryRemainingMinorUnits = pinnedCategoryRemainingMinorUnits
        self.pinnedCategoryName = pinnedCategoryName
        self.daysUntilPayday = daysUntilPayday
        self.currencyCode = currencyCode
    }

    /// The number to answer an affordability check against: the pinned category
    /// remaining when configured, otherwise the general safe-to-spend figure.
    public var spendableForCheckMinorUnits: Int64 {
        pinnedCategoryRemainingMinorUnits ?? safeToSpendMinorUnits
    }
}

/// The outcome of an in-aisle "can I afford this?" check.
public enum AffordabilityVerdict: String, Sendable, Equatable {
    /// Comfortably within the safe-to-spend cushion.
    case comfortable
    /// Possible, but it uses most of the cushion — a gentle heads-up.
    case tight
    /// Would spend past the cushion before payday.
    case beyond
}

/// Pure, deterministic safe-to-spend + affordability logic.
public enum SafeToSpendCalculator {

    /// Fraction of the cushion above which a purchase is flagged as "tight".
    public static let tightThreshold: Double = 0.8

    /// Computes the safe-to-spend summary from the given input.
    ///
    /// Only *critical* obligations that fall on or before the next payday are
    /// reserved. The safe-to-spend figure is clamped at zero — it never reports
    /// a negative "you owe" number, keeping the framing calm and actionable.
    public static func evaluate(_ input: SafeToSpendInput) -> SafeToSpendResult {
        let reserved = input.obligations
            .filter { $0.isCritical && $0.dueDate >= input.referenceDate && $0.dueDate <= input.nextPaydayDate }
            .reduce(Int64(0)) { $0 + max($1.amountMinorUnits, 0) }

        let safe = max(input.clearedCashMinorUnits - reserved, 0)

        let calendar = Calendar.current
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: input.referenceDate),
            to: calendar.startOfDay(for: input.nextPaydayDate)
        ).day ?? 0

        return SafeToSpendResult(
            safeToSpendMinorUnits: safe,
            reservedForBillsMinorUnits: reserved,
            pinnedCategoryRemainingMinorUnits: input.pinnedCategoryRemainingMinorUnits,
            pinnedCategoryName: input.pinnedCategoryName,
            daysUntilPayday: max(days, 0),
            currencyCode: input.currencyCode
        )
    }

    /// Evaluates whether a prospective purchase fits within the spendable cushion.
    ///
    /// - Parameters:
    ///   - purchaseMinorUnits: The prospective spend (positive magnitude).
    ///   - spendableMinorUnits: The cushion to check against.
    /// - Returns: A supportive verdict — comfortable, tight, or beyond.
    public static func verdict(
        purchaseMinorUnits: Int64,
        spendableMinorUnits: Int64
    ) -> AffordabilityVerdict {
        let purchase = max(purchaseMinorUnits, 0)
        guard spendableMinorUnits > 0 else {
            return purchase == 0 ? .comfortable : .beyond
        }
        if purchase > spendableMinorUnits { return .beyond }
        let fraction = Double(purchase) / Double(spendableMinorUnits)
        return fraction >= tightThreshold ? .tight : .comfortable
    }

    /// The cushion remaining *after* a prospective purchase (may be negative).
    public static func remainingAfter(
        purchaseMinorUnits: Int64,
        spendableMinorUnits: Int64
    ) -> Int64 {
        spendableMinorUnits - max(purchaseMinorUnits, 0)
    }
}
