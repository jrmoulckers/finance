// SPDX-License-Identifier: BUSL-1.1

// CompoundGrowthProjectorTests.swift
// FinanceTests
//
// Tests for the pure compound-growth projection math (#2118, #2116).

import XCTest
@testable import FinanceApp

final class CompoundGrowthProjectorTests: XCTestCase {

    func testProjectReturnsYearsPlusOnePoints() {
        let points = CompoundGrowthProjector.project(
            currentMinorUnits: 100_000,
            monthlyContributionMinorUnits: 10_000,
            annualReturnRate: 0.07,
            years: 10
        )
        XCTAssertEqual(points.count, 11)
    }

    func testFirstPointIsPresentBalance() {
        let points = CompoundGrowthProjector.project(
            currentMinorUnits: 250_000,
            monthlyContributionMinorUnits: 0,
            annualReturnRate: 0.07,
            years: 5
        )
        let first = points.first!
        XCTAssertFalse(first.isProjected)
        XCTAssertEqual(first.valueMinorUnits, 250_000)
        XCTAssertEqual(first.contributedMinorUnits, 250_000)
        XCTAssertEqual(first.growthMinorUnits, 0)
    }

    func testZeroReturnAccumulatesContributionsOnly() {
        let points = CompoundGrowthProjector.project(
            currentMinorUnits: 0,
            monthlyContributionMinorUnits: 100,
            annualReturnRate: 0.0,
            years: 1
        )
        let last = points.last!
        // 12 months * 100 = 1200, no market growth.
        XCTAssertEqual(last.valueMinorUnits, 1_200)
        XCTAssertEqual(last.contributedMinorUnits, 1_200)
        XCTAssertEqual(last.growthMinorUnits, 0)
    }

    func testPositiveReturnProducesGrowth() {
        let points = CompoundGrowthProjector.project(
            currentMinorUnits: 100_000,
            monthlyContributionMinorUnits: 5_000,
            annualReturnRate: 0.08,
            years: 20
        )
        let last = points.last!
        XCTAssertTrue(last.isProjected)
        XCTAssertGreaterThan(last.valueMinorUnits, last.contributedMinorUnits)
        XCTAssertGreaterThan(last.growthMinorUnits, 0)
    }

    func testYearsClampedToZeroReturnsSinglePoint() {
        let points = CompoundGrowthProjector.project(
            currentMinorUnits: 100_000,
            monthlyContributionMinorUnits: 1_000,
            annualReturnRate: 0.07,
            years: -5
        )
        XCTAssertEqual(points.count, 1)
    }

    func testFutureValueMatchesProjectAtHorizon() {
        let years = 3
        let points = CompoundGrowthProjector.project(
            currentMinorUnits: 500_000,
            monthlyContributionMinorUnits: 20_000,
            annualReturnRate: 0.06,
            years: years
        )
        let fv = CompoundGrowthProjector.futureValue(
            currentMinorUnits: 500_000,
            monthlyContributionMinorUnits: 20_000,
            annualReturnRate: 0.06,
            months: years * 12
        )
        XCTAssertEqual(points.last!.valueMinorUnits, fv)
    }

    func testFutureValueZeroMonthsReturnsCurrent() {
        let fv = CompoundGrowthProjector.futureValue(
            currentMinorUnits: 123_456,
            monthlyContributionMinorUnits: 1_000,
            annualReturnRate: 0.07,
            months: 0
        )
        XCTAssertEqual(fv, 123_456)
    }
}
