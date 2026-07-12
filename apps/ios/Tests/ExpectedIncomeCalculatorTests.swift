// SPDX-License-Identifier: BUSL-1.1
// ExpectedIncomeCalculatorTests.swift — FinanceTests — Refs #2193

import XCTest
@testable import FinanceShared

final class ExpectedIncomeCalculatorTests: XCTestCase {
    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        return calendar
    }()

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 12
        return calendar.date(from: components)!
    }

    func testReliableFutureIncomeCountsAsExpected() {
        let now = date(2026, 6, 10)
        let incomes = [
            ExpectedIncome(source: "Child support", amountMinorUnits: 80_000, expectedDate: date(2026, 6, 15), reliability: .reliable),
        ]

        let breakdown = ExpectedIncomeCalculator.breakdown(
            clearedCashMinorUnits: 20_000,
            expectedIncomes: incomes,
            asOf: now
        )

        XCTAssertEqual(breakdown.clearedMinorUnits, 20_000)
        XCTAssertEqual(breakdown.expectedMinorUnits, 80_000)
        XCTAssertEqual(breakdown.atRiskMinorUnits, 0)
        XCTAssertEqual(breakdown.plannableMinorUnits, 100_000)
    }

    func testUnreliableIncomeIsAtRiskEvenBeforeDue() {
        let now = date(2026, 6, 10)
        let incomes = [
            ExpectedIncome(source: "Child support", amountMinorUnits: 80_000, expectedDate: date(2026, 6, 15), reliability: .unreliable),
        ]

        let breakdown = ExpectedIncomeCalculator.breakdown(
            clearedCashMinorUnits: 0,
            expectedIncomes: incomes,
            asOf: now
        )

        XCTAssertEqual(breakdown.expectedMinorUnits, 0)
        XCTAssertEqual(breakdown.atRiskMinorUnits, 80_000)
        XCTAssertEqual(breakdown.plannableMinorUnits, 0)
    }

    func testOverdueReliableIncomeBecomesAtRisk() {
        let now = date(2026, 6, 20)
        let incomes = [
            ExpectedIncome(source: "Child support", amountMinorUnits: 80_000, expectedDate: date(2026, 6, 15), reliability: .reliable, status: .late),
        ]

        let breakdown = ExpectedIncomeCalculator.breakdown(
            clearedCashMinorUnits: 0,
            expectedIncomes: incomes,
            asOf: now
        )

        XCTAssertEqual(breakdown.atRiskMinorUnits, 80_000)
        XCTAssertEqual(breakdown.expectedMinorUnits, 0)
    }

    func testPartialPaymentCountsOnlyOutstanding() {
        let now = date(2026, 6, 10)
        let incomes = [
            ExpectedIncome(
                source: "Child support",
                amountMinorUnits: 80_000,
                receivedMinorUnits: 50_000,
                expectedDate: date(2026, 6, 15),
                reliability: .reliable,
                status: .partial
            ),
        ]

        let breakdown = ExpectedIncomeCalculator.breakdown(
            clearedCashMinorUnits: 0,
            expectedIncomes: incomes,
            asOf: now
        )

        XCTAssertEqual(breakdown.expectedMinorUnits, 30_000)
    }

    func testReceivedAndMissedAreExcluded() {
        let now = date(2026, 6, 10)
        let incomes = [
            ExpectedIncome(source: "Received", amountMinorUnits: 40_000, expectedDate: date(2026, 6, 5), reliability: .reliable, status: .received),
            ExpectedIncome(source: "Missed", amountMinorUnits: 40_000, expectedDate: date(2026, 6, 5), reliability: .reliable, status: .missed),
        ]

        let breakdown = ExpectedIncomeCalculator.breakdown(
            clearedCashMinorUnits: 10_000,
            expectedIncomes: incomes,
            asOf: now
        )

        XCTAssertEqual(breakdown.expectedMinorUnits, 0)
        XCTAssertEqual(breakdown.atRiskMinorUnits, 0)
        XCTAssertEqual(breakdown.clearedMinorUnits, 10_000)
    }

    func testOverdueSurfacesForReminders() {
        let now = date(2026, 6, 20)
        let incomes = [
            ExpectedIncome(source: "Late one", amountMinorUnits: 80_000, expectedDate: date(2026, 6, 15), reliability: .usuallyOnTime),
            ExpectedIncome(source: "Future one", amountMinorUnits: 20_000, expectedDate: date(2026, 6, 25), reliability: .reliable),
        ]

        let overdue = ExpectedIncomeCalculator.overdue(incomes, asOf: now)

        XCTAssertEqual(overdue.count, 1)
        XCTAssertEqual(overdue.first?.source, "Late one")
    }

    func testReliabilityConfidenceOrdering() {
        XCTAssertGreaterThan(IncomeReliability.reliable.confidence, IncomeReliability.usuallyOnTime.confidence)
        XCTAssertGreaterThan(IncomeReliability.usuallyOnTime.confidence, IncomeReliability.unreliable.confidence)
    }
}
