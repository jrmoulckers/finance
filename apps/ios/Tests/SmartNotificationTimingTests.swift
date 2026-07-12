// SPDX-License-Identifier: BUSL-1.1
// SmartNotificationTimingTests.swift — FinanceTests — Refs #2391

import XCTest
@testable import FinanceShared

final class SmartNotificationTimingTests: XCTestCase {

    func testFallsBackWhenNotEnoughSignals() {
        let engagement = [
            HourEngagement(hour: 8, deliveredCount: 2, actedCount: 2),
        ]
        let hour = SmartNotificationTiming.recommendedHour(
            engagement: engagement,
            quietHours: .overnightDefault,
            fallbackHour: 9
        )
        XCTAssertEqual(hour, 9)
        XCTAssertFalse(SmartNotificationTiming.canPersonalize(engagement: engagement))
    }

    func testPersonalizesToHighestActionRate() {
        let engagement = [
            HourEngagement(hour: 8, deliveredCount: 10, actedCount: 2), // 20%
            HourEngagement(hour: 18, deliveredCount: 10, actedCount: 8), // 80%
            HourEngagement(hour: 12, deliveredCount: 5, actedCount: 2), // 40%
        ]
        let hour = SmartNotificationTiming.recommendedHour(engagement: engagement, quietHours: .overnightDefault, fallbackHour: 9)
        XCTAssertEqual(hour, 18)
        XCTAssertTrue(SmartNotificationTiming.canPersonalize(engagement: engagement))
    }

    func testNeverRecommendsQuietHours() {
        let engagement = [
            HourEngagement(hour: 23, deliveredCount: 10, actedCount: 9), // best, but quiet
            HourEngagement(hour: 17, deliveredCount: 10, actedCount: 5),
        ]
        let hour = SmartNotificationTiming.recommendedHour(
            engagement: engagement,
            quietHours: .overnightDefault,
            fallbackHour: 9
        )
        XCTAssertEqual(hour, 17)
    }

    func testDisabledReturnsFallback() {
        let engagement = [
            HourEngagement(hour: 18, deliveredCount: 20, actedCount: 18),
        ]
        let hour = SmartNotificationTiming.recommendedHour(
            engagement: engagement,
            quietHours: .overnightDefault,
            fallbackHour: 9,
            smartTimingEnabled: false
        )
        XCTAssertEqual(hour, 9)
    }

    func testFallbackNudgedOutOfQuietHours() {
        // Fallback at 2am should be pushed to the quiet-window end (7am).
        let hour = SmartNotificationTiming.recommendedHour(
            engagement: [],
            quietHours: .overnightDefault,
            fallbackHour: 2
        )
        XCTAssertEqual(hour, 7)
    }

    func testQuietHoursWrapsMidnight() {
        let quiet = QuietHours(startHour: 22, endHour: 7)
        XCTAssertTrue(quiet.contains(23))
        XCTAssertTrue(quiet.contains(2))
        XCTAssertFalse(quiet.contains(7))
        XCTAssertFalse(quiet.contains(12))
    }

    func testQuietHoursDaytimeWindow() {
        let quiet = QuietHours(startHour: 9, endHour: 17)
        XCTAssertTrue(quiet.contains(12))
        XCTAssertFalse(quiet.contains(8))
        XCTAssertFalse(quiet.contains(17))
    }

    func testHealthAggregatesCountsOnly() {
        let engagement = [
            HourEngagement(hour: 8, deliveredCount: 10, actedCount: 3),
            HourEngagement(hour: 18, deliveredCount: 10, actedCount: 7),
        ]
        let health = SmartNotificationTiming.health(engagement: engagement)
        XCTAssertEqual(health.totalDelivered, 20)
        XCTAssertEqual(health.totalActed, 10)
        XCTAssertEqual(health.openRate, 0.5, accuracy: 0.0001)
    }

    func testActionRateZeroWhenNothingDelivered() {
        let entry = HourEngagement(hour: 8, deliveredCount: 0, actedCount: 0)
        XCTAssertEqual(entry.actionRate, 0)
    }
}
