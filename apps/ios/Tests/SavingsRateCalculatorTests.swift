// SPDX-License-Identifier: BUSL-1.1

// SavingsRateCalculatorTests.swift
// FinanceTests
//
// Deterministic unit tests for the pure savings-rate calculator (#2162).
// Covers the happy path plus the edge cases the FIRE dashboard depends on:
// zero / negative income, overspending, zero spending, trailing pooling,
// trend thresholds, and partial-period (elapsed-fraction) handling.

import XCTest
@testable import FinanceShared

final class SavingsRateCalculatorTests: XCTestCase {

    private let accuracy = 0.0001

    // MARK: - savingsRate: happy path

    func testTypicalFireSavingsRate() {
        // $10,000 income, $3,500 spending -> 65% saved.
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: 10_000_00,
            spendingMinorUnits: 3_500_00
        )

        XCTAssertTrue(result.isDefined)
        XCTAssertEqual(result.percent, 65.0, accuracy: accuracy)
        XCTAssertEqual(result.savedMinorUnits, 6_500_00)
        XCTAssertEqual(result.incomeMinorUnits, 10_000_00)
        XCTAssertEqual(result.spendingMinorUnits, 3_500_00)
    }

    func testZeroSpendingIsHundredPercent() {
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: 4_250_00,
            spendingMinorUnits: 0
        )

        XCTAssertTrue(result.isDefined)
        XCTAssertEqual(result.percent, 100.0, accuracy: accuracy)
        XCTAssertEqual(result.savedMinorUnits, 4_250_00)
    }

    func testFractionalPercentPrecision() {
        // 1 minor unit spent out of 3 -> 66.666...% saved.
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: 3,
            spendingMinorUnits: 1
        )

        XCTAssertTrue(result.isDefined)
        XCTAssertEqual(result.percent, 200.0 / 3.0, accuracy: accuracy)
        XCTAssertEqual(result.savedMinorUnits, 2)
    }

    // MARK: - savingsRate: edge cases

    func testZeroIncomeIsUndefined() {
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: 0,
            spendingMinorUnits: 1_200_00
        )

        XCTAssertFalse(result.isDefined, "Rate must be undefined when there is no income")
        XCTAssertEqual(result.percent, 0, "Undefined rate reports 0, not a misleading value")
        XCTAssertEqual(result.savedMinorUnits, -1_200_00, "Saved still reflects income - spending")
    }

    func testNegativeIncomeIsUndefined() {
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: -500_00,
            spendingMinorUnits: 100_00
        )

        XCTAssertFalse(result.isDefined)
        XCTAssertEqual(result.percent, 0)
        XCTAssertEqual(result.savedMinorUnits, -600_00)
    }

    func testOverspendingProducesNegativeRate() {
        // Spent $1,500 on $1,000 income -> -50% (dissaving).
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: 1_000_00,
            spendingMinorUnits: 1_500_00
        )

        XCTAssertTrue(result.isDefined)
        XCTAssertEqual(result.percent, -50.0, accuracy: accuracy)
        XCTAssertEqual(result.savedMinorUnits, -500_00)
    }

    func testBreakEvenIsZeroPercent() {
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: 2_000_00,
            spendingMinorUnits: 2_000_00
        )

        XCTAssertTrue(result.isDefined)
        XCTAssertEqual(result.percent, 0.0, accuracy: accuracy)
        XCTAssertEqual(result.savedMinorUnits, 0)
    }

    func testLargeValuesDoNotOverflow() {
        // ~ $90 billion income, well within Int64, must stay exact.
        let result = SavingsRateCalculator.savingsRate(
            incomeMinorUnits: 9_000_000_000_00,
            spendingMinorUnits: 4_500_000_000_00
        )

        XCTAssertTrue(result.isDefined)
        XCTAssertEqual(result.percent, 50.0, accuracy: accuracy)
        XCTAssertEqual(result.savedMinorUnits, 4_500_000_000_00)
    }

    func testUndefinedConstant() {
        let undefined = SavingsRateResult.undefined
        XCTAssertFalse(undefined.isDefined)
        XCTAssertEqual(undefined.percent, 0)
        XCTAssertEqual(undefined.savedMinorUnits, 0)
    }

    func testExtremeOverflowSaturatesWithoutCrashing() {
        // Int64.min - 1 overflows; with positive spending the saved amount
        // saturates to Int64.max rather than trapping.
        let result = SavingsRateCalculator.savingsRate(incomeMinorUnits: .min, spendingMinorUnits: 1)

        XCTAssertFalse(result.isDefined, "Non-positive income is undefined")
        XCTAssertEqual(result.savedMinorUnits, .max)
    }

    // MARK: - trend

    func testTrendImproving() {
        let previous = SavingsRateCalculator.savingsRate(incomeMinorUnits: 1_000_00, spendingMinorUnits: 600_00) // 40%
        let current = SavingsRateCalculator.savingsRate(incomeMinorUnits: 1_000_00, spendingMinorUnits: 350_00)  // 65%

        let trend = SavingsRateCalculator.trend(current: current, previous: previous)

        guard case let .improving(delta) = trend else {
            return XCTFail("Expected improving trend, got \(trend)")
        }
        XCTAssertEqual(delta, 25.0, accuracy: accuracy)
        XCTAssertEqual(trend.signedDeltaPoints, 25.0, accuracy: accuracy)
    }

    func testTrendDeclining() {
        let previous = SavingsRateCalculator.savingsRate(incomeMinorUnits: 1_000_00, spendingMinorUnits: 350_00) // 65%
        let current = SavingsRateCalculator.savingsRate(incomeMinorUnits: 1_000_00, spendingMinorUnits: 600_00)  // 40%

        let trend = SavingsRateCalculator.trend(current: current, previous: previous)

        guard case let .declining(delta) = trend else {
            return XCTFail("Expected declining trend, got \(trend)")
        }
        XCTAssertEqual(delta, 25.0, accuracy: accuracy)
        XCTAssertEqual(trend.signedDeltaPoints, -25.0, accuracy: accuracy)
    }

    func testTrendFlatWithinThreshold() {
        // 0.05 point change is below the 0.1 threshold -> flat.
        let previous = SavingsRateResult(percent: 65.00, savedMinorUnits: 0, incomeMinorUnits: 100, spendingMinorUnits: 0, isDefined: true)
        let current = SavingsRateResult(percent: 65.05, savedMinorUnits: 0, incomeMinorUnits: 100, spendingMinorUnits: 0, isDefined: true)

        XCTAssertEqual(SavingsRateCalculator.trend(current: current, previous: previous), .flat)
    }

    func testTrendNotEnoughDataWhenPreviousUndefined() {
        let current = SavingsRateCalculator.savingsRate(incomeMinorUnits: 1_000_00, spendingMinorUnits: 350_00)
        let previous = SavingsRateResult.undefined

        XCTAssertEqual(SavingsRateCalculator.trend(current: current, previous: previous), .notEnoughData)
        XCTAssertEqual(SavingsRateTrend.notEnoughData.signedDeltaPoints, 0)
    }

    func testTrendNotEnoughDataWhenCurrentUndefined() {
        let previous = SavingsRateCalculator.savingsRate(incomeMinorUnits: 1_000_00, spendingMinorUnits: 350_00)
        let current = SavingsRateResult.undefined

        XCTAssertEqual(SavingsRateCalculator.trend(current: current, previous: previous), .notEnoughData)
    }

    // MARK: - trailingAverage

    func testTrailingAveragePoolsIncomeAndSpending() {
        // Three months pooled: income 3000+5000+2000 = 10000, spending 1000+1000+1000 = 3000 -> 70%.
        let m1 = SavingsRateCalculator.savingsRate(incomeMinorUnits: 3_000_00, spendingMinorUnits: 1_000_00)
        let m2 = SavingsRateCalculator.savingsRate(incomeMinorUnits: 5_000_00, spendingMinorUnits: 1_000_00)
        let m3 = SavingsRateCalculator.savingsRate(incomeMinorUnits: 2_000_00, spendingMinorUnits: 1_000_00)

        let pooled = SavingsRateCalculator.trailingAverage(of: [m1, m2, m3])

        XCTAssertTrue(pooled.isDefined)
        XCTAssertEqual(pooled.percent, 70.0, accuracy: accuracy)
        XCTAssertEqual(pooled.incomeMinorUnits, 10_000_00)
        XCTAssertEqual(pooled.spendingMinorUnits, 3_000_00)
    }

    func testTrailingAverageIgnoresUndefinedPeriods() {
        let defined = SavingsRateCalculator.savingsRate(incomeMinorUnits: 1_000_00, spendingMinorUnits: 200_00) // 80%
        let undefined = SavingsRateResult.undefined

        let pooled = SavingsRateCalculator.trailingAverage(of: [undefined, defined, undefined])

        XCTAssertTrue(pooled.isDefined)
        XCTAssertEqual(pooled.percent, 80.0, accuracy: accuracy)
    }

    func testTrailingAverageEmptyIsUndefined() {
        XCTAssertEqual(SavingsRateCalculator.trailingAverage(of: []), .undefined)
        XCTAssertEqual(
            SavingsRateCalculator.trailingAverage(of: [.undefined, .undefined]),
            .undefined
        )
    }

    // MARK: - elapsedFraction (partial periods)

    func testElapsedFractionMidway() {
        let start = Date(timeIntervalSince1970: 0)
        let end = Date(timeIntervalSince1970: 100)
        let asOf = Date(timeIntervalSince1970: 50)

        XCTAssertEqual(
            SavingsRateCalculator.elapsedFraction(start: start, end: end, asOf: asOf),
            0.5,
            accuracy: accuracy
        )
    }

    func testElapsedFractionClampsBeforeStartAndAfterEnd() {
        let start = Date(timeIntervalSince1970: 100)
        let end = Date(timeIntervalSince1970: 200)

        XCTAssertEqual(
            SavingsRateCalculator.elapsedFraction(start: start, end: end, asOf: Date(timeIntervalSince1970: 50)),
            0.0,
            accuracy: accuracy
        )
        XCTAssertEqual(
            SavingsRateCalculator.elapsedFraction(start: start, end: end, asOf: Date(timeIntervalSince1970: 500)),
            1.0,
            accuracy: accuracy
        )
    }

    func testElapsedFractionZeroDurationIsZero() {
        let instant = Date(timeIntervalSince1970: 100)
        XCTAssertEqual(
            SavingsRateCalculator.elapsedFraction(start: instant, end: instant, asOf: instant),
            0.0,
            accuracy: accuracy
        )
    }

    func testPartialPeriodRateMatchesFullPeriodRate() {
        // Scaling income and spending by the same elapsed fraction must not
        // change the ratio — proving partial-period rates are comparable.
        let full = SavingsRateCalculator.savingsRate(incomeMinorUnits: 6_000_00, spendingMinorUnits: 2_100_00)
        let half = SavingsRateCalculator.savingsRate(incomeMinorUnits: 3_000_00, spendingMinorUnits: 1_050_00)

        XCTAssertEqual(full.percent, half.percent, accuracy: accuracy)
    }
}
