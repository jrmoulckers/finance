// SPDX-License-Identifier: BUSL-1.1
// CompactLayoutMetricsTests.swift — FinanceTests — Refs #2190

import XCTest
@testable import FinanceShared

final class CompactLayoutMetricsTests: XCTestCase {

    func testRegularWidthUsesThreeUpSummary() {
        let input = SizeClassInput(isCompactWidth: false, isAccessibilityTextSize: false)
        XCTAssertEqual(CompactLayoutMetrics.summaryColumns(for: input), 3)
        XCTAssertEqual(CompactLayoutMetrics.quickAccessColumns(for: input), 3)
        XCTAssertEqual(CompactLayoutMetrics.billsSummaryColumns(for: input), 3)
    }

    func testCompactWidthStacksSummaryAndUsesTwoUpQuickAccess() {
        let input = SizeClassInput(isCompactWidth: true, isAccessibilityTextSize: false)
        XCTAssertEqual(CompactLayoutMetrics.summaryColumns(for: input), 1)
        XCTAssertEqual(CompactLayoutMetrics.quickAccessColumns(for: input), 2)
    }

    func testAccessibilityTextForcesSingleColumn() {
        let input = SizeClassInput(isCompactWidth: false, isAccessibilityTextSize: true)
        XCTAssertEqual(CompactLayoutMetrics.summaryColumns(for: input), 1)
        XCTAssertEqual(CompactLayoutMetrics.quickAccessColumns(for: input), 1)
    }

    func testStepperUsesShortLabelsWhenTight() {
        XCTAssertTrue(CompactLayoutMetrics.stepperUsesShortLabels(for: SizeClassInput(isCompactWidth: true, isAccessibilityTextSize: false)))
        XCTAssertTrue(CompactLayoutMetrics.stepperUsesShortLabels(for: SizeClassInput(isCompactWidth: false, isAccessibilityTextSize: true)))
        XCTAssertFalse(CompactLayoutMetrics.stepperUsesShortLabels(for: SizeClassInput(isCompactWidth: false, isAccessibilityTextSize: false)))
    }
}
