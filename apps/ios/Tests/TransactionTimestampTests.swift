// SPDX-License-Identifier: BUSL-1.1

// TransactionTimestampTests.swift
// FinanceTests
//
// Tests that a purchase keeps its original local day and time after the device
// crosses into another timezone (#2206).

import XCTest
@testable import FinanceApp

final class TransactionTimestampTests: XCTestCase {

    private let bangkok = TimeZone(identifier: "Asia/Bangkok")!
    private let lisbon = TimeZone(identifier: "Europe/Lisbon")!

    /// 2026-01-05 23:50 local Bangkok time as an absolute instant.
    private func lateNightBangkokInstant() -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = bangkok
        var components = DateComponents()
        components.year = 2026
        components.month = 1
        components.day = 5
        components.hour = 23
        components.minute = 50
        return calendar.date(from: components)!
    }

    func testLocalDayAnchoredToCaptureZoneNotDeviceZone() {
        let instant = lateNightBangkokInstant()

        let bangkokStamp = TransactionTimestamp(instant: instant, timeZone: bangkok)
        let lisbonStamp = TransactionTimestamp(instant: instant, timeZone: lisbon)

        var bangkokCal = Calendar(identifier: .gregorian)
        bangkokCal.timeZone = bangkok
        let bangkokDayComponents = bangkokCal.dateComponents([.day], from: bangkokStamp.localDay)
        XCTAssertEqual(bangkokDayComponents.day, 5, "Purchase stays on Jan 5 in Bangkok")

        // In Lisbon the same instant is still the 5th's afternoon, so the two
        // local days differ — proving day is anchored to the capture zone.
        XCTAssertNotEqual(bangkokStamp.localDay, lisbonStamp.localDay)
    }

    func testResolveTimeZoneFallsBackToCurrentForInvalidIdentifier() {
        let zone = TransactionTimestamp.resolveTimeZone("Not/AZone")
        XCTAssertEqual(zone, .current)
    }

    func testResolveTimeZoneUsesValidIdentifier() {
        let zone = TransactionTimestamp.resolveTimeZone("Asia/Bangkok")
        XCTAssertEqual(zone.identifier, "Asia/Bangkok")
    }

    func testDiffersFromDeviceZoneDetectsBorderCrossing() {
        let stamp = TransactionTimestamp(instant: lateNightBangkokInstant(), timeZone: bangkok)
        XCTAssertTrue(stamp.differsFromDeviceZone(deviceZone: lisbon))
        XCTAssertFalse(stamp.differsFromDeviceZone(deviceZone: bangkok))
    }

    func testInitFromIdentifierPreservesZone() {
        let stamp = TransactionTimestamp(instant: lateNightBangkokInstant(), timeZoneIdentifier: "Asia/Bangkok")
        XCTAssertEqual(stamp.timeZone.identifier, "Asia/Bangkok")
    }
}
