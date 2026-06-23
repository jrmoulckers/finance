// SPDX-License-Identifier: BUSL-1.1
// TodaySpendCalculatorTests.swift — FinanceTests — Refs #2159

import XCTest
@testable import FinanceShared

final class TodaySpendCalculatorTests: XCTestCase {
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

    // MARK: - Today spend

    func testTodaySpendSumsOnlyTodaysOutflows() {
        let today = date(2026, 6, 23)
        let input = TodaySpendInput(
            transactions: [
                .init(amountMinorUnits: -1_200, date: date(2026, 6, 23, hour: 9), isDiscretionary: true),
                .init(amountMinorUnits: -3_050, date: date(2026, 6, 23, hour: 19), isDiscretionary: false),
                .init(amountMinorUnits: -9_999, date: date(2026, 6, 22), isDiscretionary: true), // yesterday
                .init(amountMinorUnits: 50_000, date: date(2026, 6, 23, hour: 8), isDiscretionary: false), // income
            ],
            discretionaryBudgetMinorUnits: 25_000,
            periodStart: date(2026, 6, 1),
            periodEnd: date(2026, 6, 30),
            referenceDate: today,
            calendar: calendar
        )

        let summary = TodaySpendCalculator.summarize(input)

        XCTAssertEqual(summary.todaySpentMinorUnits, 4_250)
    }

    func testIncomeNeverCountsAsSpend() {
        let input = TodaySpendInput(
            transactions: [
                .init(amountMinorUnits: 12_345, date: date(2026, 6, 23), isDiscretionary: true),
            ],
            discretionaryBudgetMinorUnits: 25_000,
            periodStart: date(2026, 6, 1),
            periodEnd: date(2026, 6, 30),
            referenceDate: date(2026, 6, 23),
            calendar: calendar
        )

        let summary = TodaySpendCalculator.summarize(input)

        XCTAssertEqual(summary.todaySpentMinorUnits, 0)
        XCTAssertEqual(summary.periodDiscretionarySpentMinorUnits, 0)
    }

    // MARK: - Fun money

    func testFunMoneyCountsOnlyDiscretionarySpendInPeriod() {
        let input = TodaySpendInput(
            transactions: [
                .init(amountMinorUnits: -5_000, date: date(2026, 6, 10), isDiscretionary: true),
                .init(amountMinorUnits: -4_000, date: date(2026, 6, 15), isDiscretionary: true),
                .init(amountMinorUnits: -8_000, date: date(2026, 6, 15), isDiscretionary: false), // non-discretionary
                .init(amountMinorUnits: -7_000, date: date(2026, 5, 31), isDiscretionary: true), // before period
            ],
            discretionaryBudgetMinorUnits: 25_000,
            periodStart: date(2026, 6, 1),
            periodEnd: date(2026, 6, 30),
            referenceDate: date(2026, 6, 23),
            calendar: calendar
        )

        let summary = TodaySpendCalculator.summarize(input)

        XCTAssertEqual(summary.periodDiscretionarySpentMinorUnits, 9_000)
        XCTAssertEqual(summary.funMoneyRemainingMinorUnits, 16_000)
        XCTAssertFalse(summary.isOverFunBudget)
        XCTAssertEqual(summary.funMoneyProgress, 0.36, accuracy: 0.0001)
    }

    func testFunMoneyGoesNegativeWhenOverspent() {
        let input = TodaySpendInput(
            transactions: [
                .init(amountMinorUnits: -30_000, date: date(2026, 6, 15), isDiscretionary: true),
            ],
            discretionaryBudgetMinorUnits: 25_000,
            periodStart: date(2026, 6, 1),
            periodEnd: date(2026, 6, 30),
            referenceDate: date(2026, 6, 23),
            calendar: calendar
        )

        let summary = TodaySpendCalculator.summarize(input)

        XCTAssertEqual(summary.funMoneyRemainingMinorUnits, -5_000)
        XCTAssertTrue(summary.isOverFunBudget)
        XCTAssertEqual(summary.funMoneyProgress, 1.0, accuracy: 0.0001) // clamped
    }

    func testPeriodBoundsAreInclusive() {
        let input = TodaySpendInput(
            transactions: [
                .init(amountMinorUnits: -1_000, date: date(2026, 6, 1, hour: 0), isDiscretionary: true),
                .init(amountMinorUnits: -2_000, date: date(2026, 6, 30, hour: 23), isDiscretionary: true),
            ],
            discretionaryBudgetMinorUnits: 25_000,
            periodStart: date(2026, 6, 1, hour: 0),
            periodEnd: date(2026, 6, 30, hour: 23),
            referenceDate: date(2026, 6, 23),
            calendar: calendar
        )

        let summary = TodaySpendCalculator.summarize(input)

        XCTAssertEqual(summary.periodDiscretionarySpentMinorUnits, 3_000)
    }

    func testZeroBudgetReportsNoProgressAndNoBudget() {
        let summary = TodaySpendSummary(
            todaySpentMinorUnits: 1_000,
            periodDiscretionarySpentMinorUnits: 2_000,
            discretionaryBudgetMinorUnits: 0,
            currencyCode: "USD",
            updatedAt: .now
        )

        XCTAssertFalse(summary.hasDiscretionaryBudget)
        XCTAssertEqual(summary.funMoneyProgress, 0)
    }

    func testEmptySummaryIsZeroedAndStale() {
        let summary = TodaySpendSummary.empty()

        XCTAssertEqual(summary.todaySpentMinorUnits, 0)
        XCTAssertEqual(summary.discretionaryBudgetMinorUnits, 0)
        XCTAssertTrue(TodaySpendFreshness.isStale(updatedAt: summary.updatedAt, now: .now))
    }

    // MARK: - Determinism & Codable

    func testSummaryIsDeterministicForSameInput() {
        let makeInput = {
            TodaySpendInput(
                transactions: [
                    .init(amountMinorUnits: -1_111, date: self.date(2026, 6, 23), isDiscretionary: true),
                    .init(amountMinorUnits: -2_222, date: self.date(2026, 6, 12), isDiscretionary: true),
                ],
                discretionaryBudgetMinorUnits: 25_000,
                periodStart: self.date(2026, 6, 1),
                periodEnd: self.date(2026, 6, 30),
                referenceDate: self.date(2026, 6, 23),
                updatedAt: self.date(2026, 6, 23, hour: 20),
                calendar: self.calendar
            )
        }

        XCTAssertEqual(TodaySpendCalculator.summarize(makeInput()), TodaySpendCalculator.summarize(makeInput()))
    }

    func testSummaryRoundTripsThroughCodable() throws {
        let summary = TodaySpendSummary.empty(currencyCode: "EUR", updatedAt: date(2026, 6, 23, hour: 18))
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let data = try encoder.encode(summary)
        let decoded = try decoder.decode(TodaySpendSummary.self, from: data)

        XCTAssertEqual(decoded, summary)
    }
}

// MARK: - Freshness & refresh policy (timeline entry logic)

final class TodaySpendTimelineTests: XCTestCase {
    func testFreshnessUsesSixHourThresholdByDefault() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let fresh = now.addingTimeInterval(-5 * 60 * 60)
        let stale = now.addingTimeInterval(-7 * 60 * 60)

        XCTAssertFalse(TodaySpendFreshness.isStale(updatedAt: fresh, now: now))
        XCTAssertTrue(TodaySpendFreshness.isStale(updatedAt: stale, now: now))
    }

    func testFutureTimestampIsNeverStale() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let future = now.addingTimeInterval(60 * 60)

        XCTAssertEqual(TodaySpendFreshness.age(of: future, now: now), 0)
        XCTAssertFalse(TodaySpendFreshness.isStale(updatedAt: future, now: now))
    }

    func testRelaxedCadenceWhenFunBudgetHasHeadroom() {
        let summary = TodaySpendSummary(
            todaySpentMinorUnits: 1_000,
            periodDiscretionarySpentMinorUnits: 5_000,
            discretionaryBudgetMinorUnits: 25_000,
            currencyCode: "USD",
            updatedAt: .now
        )

        XCTAssertEqual(
            TodaySpendRefreshPolicy.refreshInterval(for: summary),
            TodaySpendRefreshPolicy.relaxedInterval
        )
    }

    func testTightCadenceWhenFunBudgetNearlyDepleted() {
        let summary = TodaySpendSummary(
            todaySpentMinorUnits: 1_000,
            periodDiscretionarySpentMinorUnits: 23_000,
            discretionaryBudgetMinorUnits: 25_000,
            currencyCode: "USD",
            updatedAt: .now
        )

        XCTAssertGreaterThanOrEqual(summary.funMoneyProgress, TodaySpendRefreshPolicy.lowBudgetThreshold)
        XCTAssertEqual(
            TodaySpendRefreshPolicy.refreshInterval(for: summary),
            TodaySpendRefreshPolicy.tightInterval
        )
    }

    func testTightCadenceWhenOverBudget() {
        let summary = TodaySpendSummary(
            todaySpentMinorUnits: 1_000,
            periodDiscretionarySpentMinorUnits: 30_000,
            discretionaryBudgetMinorUnits: 25_000,
            currencyCode: "USD",
            updatedAt: .now
        )

        XCTAssertEqual(
            TodaySpendRefreshPolicy.refreshInterval(for: summary),
            TodaySpendRefreshPolicy.tightInterval
        )
    }

    func testNextRefreshDateAdvancesByInterval() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let summary = TodaySpendSummary.empty()

        let next = TodaySpendRefreshPolicy.nextRefreshDate(after: now, summary: summary)

        XCTAssertEqual(
            next.timeIntervalSince(now),
            TodaySpendRefreshPolicy.refreshInterval(for: summary),
            accuracy: 0.5
        )
        XCTAssertGreaterThan(next, now)
    }
}
