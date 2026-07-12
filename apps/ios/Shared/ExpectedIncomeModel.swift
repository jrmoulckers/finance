// SPDX-License-Identifier: BUSL-1.1
// ExpectedIncomeModel.swift - FinanceShared - Refs #2193
//
// A pure, dependency-free model for tracking *expected* income separately from
// cleared income — built for single parents relying on late or unreliable child
// support, plus freelancers, reimbursements, and tips. All money is in integer
// minor units (cents). No UI/KMP/networking dependencies, fully unit-testable.
//
// The core idea: never pretend uncertain money has already arrived. We split the
// cash picture into three honest buckets — cleared, expected, and at-risk — so
// planning reflects reality instead of wishful thinking.

import Foundation

/// How dependable a recurring expected deposit has historically been.
public enum IncomeReliability: String, Sendable, CaseIterable, Codable {
    /// Arrives on time, essentially always.
    case reliable
    /// Usually arrives, occasionally late.
    case usuallyOnTime
    /// Frequently late, partial, or missed.
    case unreliable

    /// Weight (0...1) applied when estimating how much expected cash to trust.
    public var confidence: Double {
        switch self {
        case .reliable: return 1.0
        case .usuallyOnTime: return 0.7
        case .unreliable: return 0.4
        }
    }
}

/// The lifecycle status of a single expected deposit.
public enum ExpectedIncomeStatus: String, Sendable, CaseIterable, Codable {
    /// Not yet due / not yet arrived.
    case expected
    /// Fully received on or around the expected date.
    case received
    /// Past the expected date with nothing received yet.
    case late
    /// Some — but not all — of the expected amount arrived.
    case partial
    /// Written off for this cycle.
    case missed
}

/// A single expected (not-yet-cleared) deposit.
public struct ExpectedIncome: Sendable, Hashable, Codable, Identifiable {
    public let id: String
    /// Human label, e.g. "Child support" or "Freelance invoice #12".
    public let source: String
    /// The full amount expected, in minor units.
    public let amountMinorUnits: Int64
    /// The amount actually received so far (for partial payments), minor units.
    public let receivedMinorUnits: Int64
    public let expectedDate: Date
    public let reliability: IncomeReliability
    public let status: ExpectedIncomeStatus

    public init(
        id: String = UUID().uuidString,
        source: String,
        amountMinorUnits: Int64,
        receivedMinorUnits: Int64 = 0,
        expectedDate: Date,
        reliability: IncomeReliability = .usuallyOnTime,
        status: ExpectedIncomeStatus = .expected
    ) {
        self.id = id
        self.source = source
        self.amountMinorUnits = amountMinorUnits
        self.receivedMinorUnits = receivedMinorUnits
        self.expectedDate = expectedDate
        self.reliability = reliability
        self.status = status
    }

    /// The outstanding amount still expected but not yet received, minor units.
    public var outstandingMinorUnits: Int64 {
        max(amountMinorUnits - receivedMinorUnits, 0)
    }

    /// Whether the deposit is overdue relative to `now` and not yet resolved.
    public func isOverdue(asOf now: Date) -> Bool {
        (status == .expected || status == .late) && expectedDate < now && outstandingMinorUnits > 0
    }
}

/// An honest three-way split of the household's cash position.
public struct CashBreakdown: Sendable, Hashable, Codable {
    /// Money that has cleared and is available right now, minor units.
    public let clearedMinorUnits: Int64
    /// Money expected soon that is reasonably dependable, minor units.
    public let expectedMinorUnits: Int64
    /// Expected money that is late or unreliable — do not spend against it yet.
    public let atRiskMinorUnits: Int64
    public let currencyCode: String

    public init(
        clearedMinorUnits: Int64,
        expectedMinorUnits: Int64,
        atRiskMinorUnits: Int64,
        currencyCode: String
    ) {
        self.clearedMinorUnits = clearedMinorUnits
        self.expectedMinorUnits = expectedMinorUnits
        self.atRiskMinorUnits = atRiskMinorUnits
        self.currencyCode = currencyCode
    }

    /// Cash you can plan on today: cleared plus dependable expected money.
    public var plannableMinorUnits: Int64 {
        clearedMinorUnits + expectedMinorUnits
    }
}

/// Pure, deterministic expected-income cash-planning logic.
public enum ExpectedIncomeCalculator {

    /// Expected deposits at or below this confidence are treated as *at-risk*
    /// rather than dependable "expected" cash.
    public static let atRiskConfidenceCeiling = IncomeReliability.unreliable.confidence

    /// Splits the cash picture into cleared / expected / at-risk buckets.
    ///
    /// - An expected item that is overdue (late) is always at-risk.
    /// - An `.unreliable` item is at-risk even before it is due.
    /// - `.missed` items contribute nothing.
    /// - `.received` items are assumed already reflected in `clearedCashMinorUnits`
    ///   and are not double-counted here.
    public static func breakdown(
        clearedCashMinorUnits: Int64,
        expectedIncomes: [ExpectedIncome],
        currencyCode: String = "USD",
        asOf now: Date = Date()
    ) -> CashBreakdown {
        var expected: Int64 = 0
        var atRisk: Int64 = 0

        for income in expectedIncomes {
            switch income.status {
            case .received, .missed:
                continue
            case .expected, .late, .partial:
                let outstanding = income.outstandingMinorUnits
                guard outstanding > 0 else { continue }
                let isLate = income.isOverdue(asOf: now)
                let isUnreliable = income.reliability.confidence <= atRiskConfidenceCeiling
                if isLate || isUnreliable {
                    atRisk += outstanding
                } else {
                    expected += outstanding
                }
            }
        }

        return CashBreakdown(
            clearedMinorUnits: clearedCashMinorUnits,
            expectedMinorUnits: expected,
            atRiskMinorUnits: atRisk,
            currencyCode: currencyCode
        )
    }

    /// Expected deposits that are overdue and should surface a gentle reminder.
    public static func overdue(
        _ expectedIncomes: [ExpectedIncome],
        asOf now: Date = Date()
    ) -> [ExpectedIncome] {
        expectedIncomes
            .filter { $0.isOverdue(asOf: now) }
            .sorted { $0.expectedDate < $1.expectedDate }
    }
}
