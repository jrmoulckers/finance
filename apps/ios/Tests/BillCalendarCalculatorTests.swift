// SPDX-License-Identifier: BUSL-1.1
// BillCalendarCalculatorTests.swift — FinanceTests — Refs #2196

import XCTest
@testable import FinanceShared

final class BillCalendarCalculatorTests: XCTestCase {
    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        return calendar
    }()

    private func date(_ year: Int, _ month: Int, _ day: Int, hour: Int = 12) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = hour
        return calendar.date(from: components)!
    }

    func testNextPaydayPicksSoonestFuture() {
        let paydays = [date(2026, 6, 1), date(2026, 6, 15), date(2026, 6, 30)]
        let next = BillCalendarCalculator.nextPayday(after: date(2026, 6, 10), paydays: paydays, calendar: calendar)
        XCTAssertEqual(next.map { calendar.startOfDay(for: $0) }, calendar.startOfDay(for: date(2026, 6, 15)))
    }

    func testDueBeforeNextPaydayFiltersWindow() {
        let events = [
            BillCalendarEvent(name: "Rent", amountMinorUnits: 120_000, dueDate: date(2026, 6, 12)),
            BillCalendarEvent(name: "Field trip", amountMinorUnits: 4_000, dueDate: date(2026, 6, 14), isOneOff: true),
            BillCalendarEvent(name: "Internet", amountMinorUnits: 6_000, dueDate: date(2026, 6, 18)), // after payday
        ]
        let paydays = [date(2026, 6, 15)]

        let due = BillCalendarCalculator.dueBeforeNextPayday(
            events: events,
            paydays: paydays,
            referenceDate: date(2026, 6, 10),
            calendar: calendar
        )

        XCTAssertEqual(due.map(\.name), ["Rent", "Field trip"])
        let total = BillCalendarCalculator.totalDueBeforeNextPayday(
            events: events,
            paydays: paydays,
            referenceDate: date(2026, 6, 10),
            calendar: calendar
        )
        XCTAssertEqual(total, 124_000)
    }

    func testDaysGroupAndFlagPaydayAndWindow() {
        let events = [
            BillCalendarEvent(name: "Rent", amountMinorUnits: 120_000, dueDate: date(2026, 6, 12, hour: 9)),
            BillCalendarEvent(name: "Water", amountMinorUnits: 3_000, dueDate: date(2026, 6, 12, hour: 18)),
            BillCalendarEvent(name: "Sports", amountMinorUnits: 5_000, dueDate: date(2026, 6, 20), isOneOff: true),
        ]
        let paydays = [date(2026, 6, 15)]

        let days = BillCalendarCalculator.days(
            events: events,
            paydays: paydays,
            referenceDate: date(2026, 6, 10),
            calendar: calendar
        )

        XCTAssertEqual(days.count, 2)
        let firstDay = days[0]
        XCTAssertEqual(firstDay.events.count, 2)
        XCTAssertEqual(firstDay.totalMinorUnits, 123_000)
        XCTAssertTrue(firstDay.isBeforeNextPayday)
        XCTAssertFalse(firstDay.isPayday)
        // Highest amount sorts first within a day.
        XCTAssertEqual(firstDay.events.first?.name, "Rent")

        let secondDay = days[1]
        XCTAssertFalse(secondDay.isBeforeNextPayday) // June 20 is after payday
    }

    func testPayPeriodsFlagHighRiskWeeks() {
        let events = [
            BillCalendarEvent(name: "Rent", amountMinorUnits: 120_000, dueDate: date(2026, 6, 3)),
            BillCalendarEvent(name: "Camp", amountMinorUnits: 40_000, dueDate: date(2026, 6, 18), isOneOff: true),
        ]
        let deposits = [
            PaydayDeposit(date: date(2026, 6, 1), amountMinorUnits: 130_000),
            PaydayDeposit(date: date(2026, 6, 15), amountMinorUnits: 30_000),
        ]

        let periods = BillCalendarCalculator.payPeriods(events: events, deposits: deposits, calendar: calendar)

        XCTAssertEqual(periods.count, 2)
        // First period: 130k income vs 120k bills → not high risk.
        XCTAssertFalse(periods[0].isHighRisk)
        // Second period: 30k income vs 40k camp → high risk.
        XCTAssertTrue(periods[1].isHighRisk)
    }

    func testNoPaydaysYieldsEmptyWindow() {
        let events = [BillCalendarEvent(name: "Rent", amountMinorUnits: 120_000, dueDate: date(2026, 6, 12))]
        let due = BillCalendarCalculator.dueBeforeNextPayday(events: events, paydays: [], referenceDate: date(2026, 6, 10), calendar: calendar)
        XCTAssertTrue(due.isEmpty)
    }

    func testUpcomingPaydaysBiweeklyFromAnchor() {
        let paydays = PaydaySchedule.upcomingPaydays(
            anchor: date(2026, 6, 5),
            frequency: .biweekly,
            from: date(2026, 6, 10),
            count: 3,
            calendar: calendar
        )
        XCTAssertEqual(paydays.count, 3)
        XCTAssertEqual(paydays.map { calendar.startOfDay(for: $0) }, [
            calendar.startOfDay(for: date(2026, 6, 19)),
            calendar.startOfDay(for: date(2026, 7, 3)),
            calendar.startOfDay(for: date(2026, 7, 17)),
        ])
    }

    func testUpcomingPaydaysMonthlyIncludesTodayAnchor() {
        let paydays = PaydaySchedule.upcomingPaydays(
            anchor: date(2026, 6, 1),
            frequency: .monthly,
            from: date(2026, 6, 1),
            count: 2,
            calendar: calendar
        )
        XCTAssertEqual(paydays.first.map { calendar.startOfDay(for: $0) }, calendar.startOfDay(for: date(2026, 6, 1)))
        XCTAssertEqual(paydays.count, 2)
    }
}
