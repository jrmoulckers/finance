// SPDX-License-Identifier: BUSL-1.1

// PaydaySettingsStore.swift
// Finance
//
// Persists the user's payday anchor + cadence so the bill calendar and grocery
// mode can line bills up with real paycheck timing. Thin wrapper over
// UserDefaults; all date math lives in `PaydaySchedule` (FinanceShared).
//
// References: #2196, #2199

import FinanceShared
import Foundation
import Observation

@Observable
final class PaydaySettingsStore {
    private let defaults: UserDefaults

    private enum Key {
        static let anchor = "payday.anchor.timeInterval"
        static let frequency = "payday.frequency"
        static let paycheck = "payday.typicalPaycheckMinorUnits"
    }

    /// The date a known paycheck lands; future paydays are generated from it.
    var anchorDate: Date {
        didSet { defaults.set(anchorDate.timeIntervalSince1970, forKey: Key.anchor) }
    }

    /// How often the paycheck recurs.
    var frequency: PayFrequency {
        didSet { defaults.set(frequency.rawValue, forKey: Key.frequency) }
    }

    /// A typical take-home paycheck amount, used to gauge pay-period risk.
    var typicalPaycheckMinorUnits: Int64 {
        didSet { defaults.set(typicalPaycheckMinorUnits, forKey: Key.paycheck) }
    }

    init(defaults: UserDefaults = .standard, referenceDate: Date = Date()) {
        self.defaults = defaults
        self.typicalPaycheckMinorUnits = Int64(defaults.integer(forKey: Key.paycheck))
        if let stored = defaults.object(forKey: Key.anchor) as? Double {
            self.anchorDate = Date(timeIntervalSince1970: stored)
        } else {
            // Default to two weeks out so the calendar has a sensible horizon.
            self.anchorDate = Calendar.current.date(byAdding: .day, value: 14, to: referenceDate) ?? referenceDate
        }
        if let raw = defaults.string(forKey: Key.frequency),
           let freq = PayFrequency(rawValue: raw) {
            self.frequency = freq
        } else {
            self.frequency = .biweekly
        }
    }

    /// The next `count` paydays on or after `referenceDate`.
    func upcomingPaydays(count: Int = 6, from referenceDate: Date = Date()) -> [Date] {
        PaydaySchedule.upcomingPaydays(
            anchor: anchorDate,
            frequency: frequency,
            from: referenceDate,
            count: count
        )
    }

    /// The soonest upcoming payday, if any.
    func nextPayday(from referenceDate: Date = Date()) -> Date? {
        upcomingPaydays(count: 1, from: referenceDate).first
    }

    /// Upcoming paydays as deposits carrying the typical paycheck amount, for
    /// pay-period risk analysis.
    func deposits(count: Int = 6, from referenceDate: Date = Date()) -> [PaydayDeposit] {
        upcomingPaydays(count: count, from: referenceDate).map {
            PaydayDeposit(date: $0, amountMinorUnits: typicalPaycheckMinorUnits)
        }
    }
}
