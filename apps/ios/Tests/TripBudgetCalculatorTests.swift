// SPDX-License-Identifier: BUSL-1.1

// TripBudgetCalculatorTests.swift
// FinanceTests
//
// Tests trip/country budget membership and spend measurement, including
// timezone-preserved day matching and multi-currency roll-up (#2205, #2203).

import XCTest
@testable import FinanceApp

final class TripBudgetCalculatorTests: XCTestCase {

    private func day(_ year: Int, _ month: Int, _ dayOfMonth: Int, zone: String = "Asia/Bangkok") -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: zone)!
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = dayOfMonth
        components.hour = 12
        return calendar.date(from: components)!
    }

    private func expense(
        id: String = UUID().uuidString,
        amount: Int64,
        currency: String = "THB",
        on date: Date,
        zone: String = "Asia/Bangkok",
        tags: [String] = []
    ) -> TransactionItem {
        TransactionItem(
            id: id,
            payee: "Merchant",
            category: "Food",
            amountMinorUnits: -amount,
            currencyCode: currency,
            date: date,
            type: .expense,
            tagNames: tags,
            timestamp: date,
            timeZoneIdentifier: zone
        )
    }

    private func makeTrip(tag: String = "", currency: String = "THB", limit: Int64 = 100_000) -> TripBudget {
        TripBudget(
            id: "trip1",
            name: "Bangkok Jan",
            country: "Thailand",
            currencyCode: currency,
            limitMinorUnits: limit,
            startDate: day(2026, 1, 1),
            endDate: day(2026, 1, 31),
            matchTag: tag
        )
    }

    func testMatchesByDateRange() {
        let trip = makeTrip()
        let inRange = expense(amount: 500, on: day(2026, 1, 15))
        let outOfRange = expense(amount: 500, on: day(2026, 2, 15))
        XCTAssertTrue(TripBudgetCalculator.matches(inRange, trip: trip))
        XCTAssertFalse(TripBudgetCalculator.matches(outOfRange, trip: trip))
    }

    func testMatchesRequiresTagWhenSpecified() {
        let trip = makeTrip(tag: "thailand")
        let tagged = expense(amount: 500, on: day(2026, 1, 10), tags: ["Thailand"])
        let untagged = expense(amount: 500, on: day(2026, 1, 10))
        XCTAssertTrue(TripBudgetCalculator.matches(tagged, trip: trip), "Tag match is case-insensitive")
        XCTAssertFalse(TripBudgetCalculator.matches(untagged, trip: trip))
    }

    func testProgressSumsExpensesInTripCurrency() {
        let trip = makeTrip(limit: 10_000)
        let transactions = [
            expense(amount: 3000, on: day(2026, 1, 5)),
            expense(amount: 2000, on: day(2026, 1, 6)),
            expense(amount: 9999, on: day(2026, 2, 6)), // out of range
        ]
        let progress = TripBudgetCalculator.progress(for: trip, in: transactions)
        XCTAssertEqual(progress.spentMinorUnits, 5000)
        XCTAssertEqual(progress.transactionCount, 2)
        XCTAssertFalse(progress.isOverBudget)
        XCTAssertEqual(progress.remainingMinorUnits, 5000)
    }

    func testProgressConvertsForeignSpendWithConverter() {
        let trip = makeTrip(currency: "THB", limit: 100_000)
        let now = Date()
        let converter = CurrencyConverter(
            displayCurrencyCode: "THB",
            rates: [ExchangeRate(currencyCode: "USD", rateToDisplay: 33.0, asOf: now)]
        )
        let transactions = [
            expense(amount: 1000, currency: "THB", on: day(2026, 1, 5)),
            expense(amount: 100, currency: "USD", on: day(2026, 1, 6)),
        ]
        let progress = TripBudgetCalculator.progress(for: trip, in: transactions, converter: converter, now: now)
        XCTAssertEqual(progress.spentMinorUnits, 1000 + 3300)
        XCTAssertTrue(progress.containsConversions)
        XCTAssertFalse(progress.usedStaleRate)
    }

    func testProgressWithoutConverterFlagsMixedCurrency() {
        let trip = makeTrip(currency: "THB")
        let transactions = [
            expense(amount: 1000, currency: "THB", on: day(2026, 1, 5)),
            expense(amount: 100, currency: "USD", on: day(2026, 1, 6)),
        ]
        let progress = TripBudgetCalculator.progress(for: trip, in: transactions)
        XCTAssertTrue(progress.containsConversions, "Mixed currency without converter must be disclosed")
        XCTAssertTrue(progress.usedStaleRate)
    }
}
