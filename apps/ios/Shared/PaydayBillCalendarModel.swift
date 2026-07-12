// SPDX-License-Identifier: BUSL-1.1
// PaydayBillCalendarModel.swift - FinanceShared - Refs #2196
//
// A pure, dependency-free model that lines bill due dates up with payday reality.
// For a stressed caregiver, totals aren't enough — timing is the whole game. This
// turns a flat list of bills and expected paydays into a calendar the app can
// render, and answers the question that matters: "What hits before my next
// paycheck, and which weeks are tight?"
//
// All money is in integer minor units (cents). No UI/KMP dependencies.

import Foundation

/// A single dated money event on the planning calendar.
public struct BillCalendarEvent: Sendable, Hashable, Codable, Identifiable {
    public let id: String
    public let name: String
    public let amountMinorUnits: Int64
    public let dueDate: Date
    /// One-off kid/life expenses (school fees, birthday parties, sports signups)
    /// live in the same planning view as recurring bills.
    public let isOneOff: Bool

    public init(
        id: String = UUID().uuidString,
        name: String,
        amountMinorUnits: Int64,
        dueDate: Date,
        isOneOff: Bool = false
    ) {
        self.id = id
        self.name = name
        self.amountMinorUnits = amountMinorUnits
        self.dueDate = dueDate
        self.isOneOff = isOneOff
    }
}

/// A day on the calendar that has at least one money event.
public struct BillCalendarDay: Sendable, Hashable, Identifiable {
    /// Start-of-day date; also serves as a stable identifier.
    public let date: Date
    public let events: [BillCalendarEvent]
    /// Whether a payday lands on this day.
    public let isPayday: Bool
    /// Whether this day falls on or before the next payday from the reference date.
    public let isBeforeNextPayday: Bool

    public var id: Date { date }

    public var totalMinorUnits: Int64 {
        events.reduce(Int64(0)) { $0 + $1.amountMinorUnits }
    }

    public init(date: Date, events: [BillCalendarEvent], isPayday: Bool, isBeforeNextPayday: Bool) {
        self.date = date
        self.events = events
        self.isPayday = isPayday
        self.isBeforeNextPayday = isBeforeNextPayday
    }
}

/// A pay-period window (one payday to the next) with its cash-flow health.
public struct PayPeriodSummary: Sendable, Hashable, Identifiable {
    public let start: Date
    public let end: Date
    public let billsDueMinorUnits: Int64
    public let expectedIncomeMinorUnits: Int64

    public var id: Date { start }

    /// A week/period is "high-risk" when bills due exceed the income expected to
    /// cover them within the window.
    public var isHighRisk: Bool {
        billsDueMinorUnits > expectedIncomeMinorUnits
    }

    public init(start: Date, end: Date, billsDueMinorUnits: Int64, expectedIncomeMinorUnits: Int64) {
        self.start = start
        self.end = end
        self.billsDueMinorUnits = billsDueMinorUnits
        self.expectedIncomeMinorUnits = expectedIncomeMinorUnits
    }
}

/// An expected income deposit used to gauge pay-period cash-flow health.
public struct PaydayDeposit: Sendable, Hashable, Codable {
    public let date: Date
    public let amountMinorUnits: Int64

    public init(date: Date, amountMinorUnits: Int64) {
        self.date = date
        self.amountMinorUnits = amountMinorUnits
    }
}

/// How often a paycheck or reliable deposit lands.
public enum PayFrequency: String, Sendable, CaseIterable, Codable {
    case weekly, biweekly, semimonthly, monthly

    public var displayName: String {
        switch self {
        case .weekly: return "Weekly"
        case .biweekly: return "Every 2 weeks"
        case .semimonthly: return "Twice a month"
        case .monthly: return "Monthly"
        }
    }
}

/// Pure generator for upcoming payday dates from an anchor + frequency, so the
/// bill calendar and grocery mode can align bills to real paycheck timing.
public enum PaydaySchedule {

    /// Generates the next `count` paydays on or after `referenceDate`.
    ///
    /// - Semimonthly pays on the anchor's day-of-month and the 15th/last-day
    ///   partner, approximated here as the anchor day and 14 days later.
    public static func upcomingPaydays(
        anchor: Date,
        frequency: PayFrequency,
        from referenceDate: Date = Date(),
        count: Int = 6,
        calendar: Calendar = .current
    ) -> [Date] {
        guard count > 0 else { return [] }
        let today = calendar.startOfDay(for: referenceDate)
        var result: [Date] = []
        var current = calendar.startOfDay(for: anchor)

        // Wind forward to the first payday on/after today (bounded to avoid loops).
        var guardCount = 0
        while current < today && guardCount < 1_000 {
            current = advance(current, frequency: frequency, calendar: calendar)
            guardCount += 1
        }

        while result.count < count && guardCount < 2_000 {
            if current >= today {
                result.append(current)
            }
            current = advance(current, frequency: frequency, calendar: calendar)
            guardCount += 1
        }
        return result
    }

    private static func advance(_ date: Date, frequency: PayFrequency, calendar: Calendar) -> Date {
        switch frequency {
        case .weekly:
            return calendar.date(byAdding: .day, value: 7, to: date) ?? date
        case .biweekly, .semimonthly:
            return calendar.date(byAdding: .day, value: 14, to: date) ?? date
        case .monthly:
            return calendar.date(byAdding: .month, value: 1, to: date) ?? date
        }
    }
}

/// Pure, deterministic bill-calendar + payday-alignment logic.
public enum BillCalendarCalculator {

    /// Groups events into calendar days, marking paydays and the "before next
    /// payday" window. Days with no events are omitted (the UI fills the grid).
    ///
    /// - Parameters:
    ///   - events: All dated money events to place.
    ///   - paydays: Expected income dates.
    ///   - referenceDate: "Now" — used to find the next payday.
    ///   - calendar: Calendar for day bucketing (injectable for tests).
    public static func days(
        events: [BillCalendarEvent],
        paydays: [Date],
        referenceDate: Date = Date(),
        calendar: Calendar = .current
    ) -> [BillCalendarDay] {
        let paydayDays = Set(paydays.map { calendar.startOfDay(for: $0) })
        let nextPayday = self.nextPayday(after: referenceDate, paydays: paydays, calendar: calendar)
        let today = calendar.startOfDay(for: referenceDate)

        let grouped = Dictionary(grouping: events) { calendar.startOfDay(for: $0.dueDate) }

        return grouped
            .map { day, dayEvents -> BillCalendarDay in
                let beforeNext: Bool
                if let nextPayday {
                    beforeNext = day >= today && day <= calendar.startOfDay(for: nextPayday)
                } else {
                    beforeNext = false
                }
                return BillCalendarDay(
                    date: day,
                    events: dayEvents.sorted { $0.amountMinorUnits > $1.amountMinorUnits },
                    isPayday: paydayDays.contains(day),
                    isBeforeNextPayday: beforeNext
                )
            }
            .sorted { $0.date < $1.date }
    }

    /// The next payday strictly on or after `referenceDate`, or `nil` if none.
    public static func nextPayday(
        after referenceDate: Date,
        paydays: [Date],
        calendar: Calendar = .current
    ) -> Date? {
        let today = calendar.startOfDay(for: referenceDate)
        return paydays
            .map { calendar.startOfDay(for: $0) }
            .filter { $0 >= today }
            .min()
    }

    /// Events that fall between now and the next payday (inclusive) — the
    /// "what hits before my paycheck?" answer.
    public static func dueBeforeNextPayday(
        events: [BillCalendarEvent],
        paydays: [Date],
        referenceDate: Date = Date(),
        calendar: Calendar = .current
    ) -> [BillCalendarEvent] {
        guard let nextPayday = nextPayday(after: referenceDate, paydays: paydays, calendar: calendar) else {
            return []
        }
        let today = calendar.startOfDay(for: referenceDate)
        let payDay = calendar.startOfDay(for: nextPayday)
        return events
            .filter {
                let day = calendar.startOfDay(for: $0.dueDate)
                return day >= today && day <= payDay
            }
            .sorted { $0.dueDate < $1.dueDate }
    }

    /// Total amount due before the next payday, in minor units.
    public static func totalDueBeforeNextPayday(
        events: [BillCalendarEvent],
        paydays: [Date],
        referenceDate: Date = Date(),
        calendar: Calendar = .current
    ) -> Int64 {
        dueBeforeNextPayday(
            events: events,
            paydays: paydays,
            referenceDate: referenceDate,
            calendar: calendar
        ).reduce(Int64(0)) { $0 + $1.amountMinorUnits }
    }

    /// Builds pay-period summaries between consecutive paydays, attributing bills
    /// and expected income to the window they fall in. The final open-ended
    /// window (after the last payday) is included so upcoming risk is visible.
    public static func payPeriods(
        events: [BillCalendarEvent],
        deposits: [PaydayDeposit],
        calendar: Calendar = .current
    ) -> [PayPeriodSummary] {
        guard !deposits.isEmpty else { return [] }
        let sortedDeposits = deposits.sorted { $0.date < $1.date }
        let boundaries = sortedDeposits.map { calendar.startOfDay(for: $0.date) }

        var summaries: [PayPeriodSummary] = []
        for (index, start) in boundaries.enumerated() {
            let end: Date
            let isLast = index == boundaries.count - 1
            if isLast {
                end = calendar.date(byAdding: .day, value: 30, to: start) ?? start
            } else {
                // Period runs up to (but not including) the next payday.
                end = calendar.date(byAdding: .day, value: -1, to: boundaries[index + 1]) ?? boundaries[index + 1]
            }

            let billsDue = events
                .filter {
                    let day = calendar.startOfDay(for: $0.dueDate)
                    return day >= start && day <= end
                }
                .reduce(Int64(0)) { $0 + $1.amountMinorUnits }

            // Income for the window is the deposit that opens it.
            let income = sortedDeposits[index].amountMinorUnits

            summaries.append(
                PayPeriodSummary(
                    start: start,
                    end: end,
                    billsDueMinorUnits: billsDue,
                    expectedIncomeMinorUnits: income
                )
            )
        }
        return summaries
    }
}
