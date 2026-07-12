// SPDX-License-Identifier: BUSL-1.1
// SafeToSpendCalculatorTests.swift — FinanceTests — Refs #2199

import XCTest
@testable import FinanceShared

final class SafeToSpendCalculatorTests: XCTestCase {
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

    func testReservesOnlyCriticalBillsBeforePayday() {
        let now = date(2026, 6, 10)
        let input = SafeToSpendInput(
            clearedCashMinorUnits: 50_000, // $500
            nextPaydayDate: date(2026, 6, 15),
            obligations: [
                .init(amountMinorUnits: 30_000, dueDate: date(2026, 6, 12), isCritical: true), // rent
                .init(amountMinorUnits: 5_000, dueDate: date(2026, 6, 13), isCritical: false), // non-critical, ignored
                .init(amountMinorUnits: 9_999, dueDate: date(2026, 6, 20), isCritical: true), // after payday, ignored
            ],
            referenceDate: now
        )

        let result = SafeToSpendCalculator.evaluate(input)

        XCTAssertEqual(result.reservedForBillsMinorUnits, 30_000)
        XCTAssertEqual(result.safeToSpendMinorUnits, 20_000) // 500 - 300
    }

    func testSafeToSpendClampsAtZero() {
        let now = date(2026, 6, 10)
        let input = SafeToSpendInput(
            clearedCashMinorUnits: 10_000,
            nextPaydayDate: date(2026, 6, 15),
            obligations: [
                .init(amountMinorUnits: 40_000, dueDate: date(2026, 6, 12), isCritical: true),
            ],
            referenceDate: now
        )

        let result = SafeToSpendCalculator.evaluate(input)

        XCTAssertEqual(result.safeToSpendMinorUnits, 0)
    }

    func testDaysUntilPaydayNeverNegative() {
        let now = date(2026, 6, 20)
        let input = SafeToSpendInput(
            clearedCashMinorUnits: 10_000,
            nextPaydayDate: date(2026, 6, 15), // already passed
            obligations: [],
            referenceDate: now
        )

        let result = SafeToSpendCalculator.evaluate(input)

        XCTAssertEqual(result.daysUntilPayday, 0)
    }

    func testPinnedCategoryDrivesSpendableForCheck() {
        let now = date(2026, 6, 10)
        let input = SafeToSpendInput(
            clearedCashMinorUnits: 50_000,
            nextPaydayDate: date(2026, 6, 15),
            obligations: [],
            pinnedCategoryRemainingMinorUnits: 8_000,
            pinnedCategoryName: "Groceries",
            referenceDate: now
        )

        let result = SafeToSpendCalculator.evaluate(input)

        XCTAssertEqual(result.spendableForCheckMinorUnits, 8_000)
        XCTAssertEqual(result.pinnedCategoryName, "Groceries")
    }

    func testVerdictComfortableTightBeyond() {
        XCTAssertEqual(SafeToSpendCalculator.verdict(purchaseMinorUnits: 2_000, spendableMinorUnits: 10_000), .comfortable)
        XCTAssertEqual(SafeToSpendCalculator.verdict(purchaseMinorUnits: 8_500, spendableMinorUnits: 10_000), .tight)
        XCTAssertEqual(SafeToSpendCalculator.verdict(purchaseMinorUnits: 12_000, spendableMinorUnits: 10_000), .beyond)
    }

    func testVerdictWithNoCushion() {
        XCTAssertEqual(SafeToSpendCalculator.verdict(purchaseMinorUnits: 100, spendableMinorUnits: 0), .beyond)
        XCTAssertEqual(SafeToSpendCalculator.verdict(purchaseMinorUnits: 0, spendableMinorUnits: 0), .comfortable)
    }

    func testRemainingAfterPurchase() {
        XCTAssertEqual(SafeToSpendCalculator.remainingAfter(purchaseMinorUnits: 3_000, spendableMinorUnits: 10_000), 7_000)
        XCTAssertEqual(SafeToSpendCalculator.remainingAfter(purchaseMinorUnits: 12_000, spendableMinorUnits: 10_000), -2_000)
    }
}
