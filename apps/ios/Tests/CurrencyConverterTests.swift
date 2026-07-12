// SPDX-License-Identifier: BUSL-1.1

// CurrencyConverterTests.swift
// FinanceTests
//
// Tests that the display-currency roll-up converts foreign spend and honestly
// discloses conversions and stale/offline rates (#2203).

import XCTest
@testable import FinanceApp

final class CurrencyConverterTests: XCTestCase {

    private func converter(now: Date = Date()) -> CurrencyConverter {
        CurrencyConverter(
            displayCurrencyCode: "USD",
            rates: [
                ExchangeRate(currencyCode: "THB", rateToDisplay: 0.03, asOf: now),
                ExchangeRate(currencyCode: "EUR", rateToDisplay: 1.1, asOf: now.addingTimeInterval(-60 * 60 * 48)),
            ]
        )
    }

    func testSameCurrencyIsNotConverted() {
        let result = converter().convert(minorUnits: 1000, from: "USD")
        XCTAssertEqual(result.minorUnits, 1000)
        XCTAssertFalse(result.isConverted)
        XCTAssertFalse(result.usedStaleRate)
    }

    func testForeignCurrencyIsConverted() {
        let now = Date()
        let result = converter(now: now).convert(minorUnits: 10_000, from: "THB", now: now)
        XCTAssertEqual(result.minorUnits, 300, "10000 THB minor units * 0.03 = 300")
        XCTAssertTrue(result.isConverted)
        XCTAssertFalse(result.usedStaleRate)
    }

    func testStaleRateIsFlagged() {
        let now = Date()
        let result = converter(now: now).convert(minorUnits: 1000, from: "EUR", now: now)
        XCTAssertTrue(result.isConverted)
        XCTAssertTrue(result.usedStaleRate, "Rate captured 48h ago exceeds the 24h freshness window")
    }

    func testMissingRateTreatedAsOneToOneButStale() {
        let result = converter().convert(minorUnits: 500, from: "JPY")
        XCTAssertEqual(result.minorUnits, 500, "Money must never silently drop")
        XCTAssertTrue(result.isConverted)
        XCTAssertTrue(result.usedStaleRate)
    }

    func testRollupAggregatesAndDisclosesFlags() {
        let now = Date()
        let rollup = converter(now: now).rollup(
            [
                (minorUnits: 1000, currencyCode: "USD"),
                (minorUnits: 10_000, currencyCode: "THB"),
            ],
            now: now
        )
        XCTAssertEqual(rollup.totalMinorUnits, 1300)
        XCTAssertEqual(rollup.displayCurrencyCode, "USD")
        XCTAssertTrue(rollup.containsConversions)
        XCTAssertFalse(rollup.usedStaleRate)
    }

    func testRollupPropagatesStaleFlag() {
        let now = Date()
        let rollup = converter(now: now).rollup(
            [
                (minorUnits: 1000, currencyCode: "USD"),
                (minorUnits: 1000, currencyCode: "EUR"),
            ],
            now: now
        )
        XCTAssertTrue(rollup.usedStaleRate)
    }
}
