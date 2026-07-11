// SPDX-License-Identifier: BUSL-1.1

// NetWorthTrendCalculatorTests.swift
// FinanceTests
//
// Tests for the pure net-worth trend reconstruction and projection (#2116).

import XCTest
@testable import FinanceApp

final class NetWorthTrendCalculatorTests: XCTestCase {

    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var comps = DateComponents()
        comps.year = year
        comps.month = month
        comps.day = day
        return calendar.date(from: comps)!
    }

    private func txn(
        amount: Int64,
        date: Date,
        type: TransactionTypeUI = .expense
    ) -> TransactionItem {
        TransactionItem(
            id: UUID().uuidString,
            payee: "x",
            category: "y",
            accountName: "z",
            amountMinorUnits: amount,
            currencyCode: "USD",
            date: date,
            type: type,
            status: .cleared
        )
    }

    func testHistoryHasRequestedNumberOfPoints() {
        let points = NetWorthTrendCalculator.history(
            currentNetWorthMinorUnits: 100_000,
            transactions: [],
            months: 6,
            now: date(2023, 11, 15),
            calendar: calendar
        )
        XCTAssertEqual(points.count, 6)
    }

    func testHistoryEndsAtCurrentNetWorth() {
        let points = NetWorthTrendCalculator.history(
            currentNetWorthMinorUnits: 100_000,
            transactions: [],
            months: 3,
            now: date(2023, 11, 15),
            calendar: calendar
        )
        XCTAssertEqual(points.last?.valueMinorUnits, 100_000)
        // No flows means a flat line.
        XCTAssertTrue(points.allSatisfy { $0.valueMinorUnits == 100_000 })
    }

    func testHistorySubtractsCurrentMonthIncomeGoingBackwards() {
        let now = date(2023, 11, 15)
        let points = NetWorthTrendCalculator.history(
            currentNetWorthMinorUnits: 100_000,
            transactions: [txn(amount: 5_000, date: date(2023, 11, 10), type: .income)],
            months: 3,
            now: now,
            calendar: calendar
        )
        // Current month gained 5_000, so the prior months sit 5_000 lower.
        XCTAssertEqual(points.last?.valueMinorUnits, 100_000)
        XCTAssertEqual(points.first?.valueMinorUnits, 95_000)
    }

    func testTransfersAreIgnored() {
        let now = date(2023, 11, 15)
        let points = NetWorthTrendCalculator.history(
            currentNetWorthMinorUnits: 100_000,
            transactions: [txn(amount: -50_000, date: date(2023, 11, 10), type: .transfer)],
            months: 3,
            now: now,
            calendar: calendar
        )
        XCTAssertTrue(points.allSatisfy { $0.valueMinorUnits == 100_000 })
    }

    func testAverageMonthlySavings() {
        let now = date(2023, 11, 15)
        let avg = NetWorthTrendCalculator.averageMonthlySavings(
            transactions: [txn(amount: 6_000, date: date(2023, 11, 10), type: .income)],
            months: 3,
            now: now,
            calendar: calendar
        )
        XCTAssertEqual(avg, 2_000)
    }

    func testProjectionIsLinearAtSavingsPace() {
        let anchor = NetWorthTrendPoint(
            date: date(2023, 11, 1),
            valueMinorUnits: 100_000,
            isProjected: false
        )
        let projection = NetWorthTrendCalculator.projection(
            from: anchor,
            monthlySavingsMinorUnits: 2_000,
            months: 3,
            calendar: calendar
        )
        XCTAssertEqual(projection.count, 3)
        XCTAssertEqual(projection.map(\.valueMinorUnits), [102_000, 104_000, 106_000])
        XCTAssertTrue(projection.allSatisfy(\.isProjected))
    }

    func testProjectionZeroMonthsIsEmpty() {
        let anchor = NetWorthTrendPoint(
            date: date(2023, 11, 1),
            valueMinorUnits: 100_000,
            isProjected: false
        )
        let projection = NetWorthTrendCalculator.projection(
            from: anchor,
            monthlySavingsMinorUnits: 2_000,
            months: 0,
            calendar: calendar
        )
        XCTAssertTrue(projection.isEmpty)
    }

    func testRangeMonthsMapping() {
        XCTAssertEqual(NetWorthTrendRange.threeMonths.months, 3)
        XCTAssertEqual(NetWorthTrendRange.sixMonths.months, 6)
        XCTAssertEqual(NetWorthTrendRange.oneYear.months, 12)
        XCTAssertNil(NetWorthTrendRange.all.months)
    }
}
