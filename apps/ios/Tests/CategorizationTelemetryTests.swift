// SPDX-License-Identifier: BUSL-1.1

// CategorizationTelemetryTests.swift
// FinanceTests
//
// Tests aggregate, content-free telemetry: counts, source/band breakdowns,
// acceptance rate, and UserDefaults persistence.
//
// References: #2382

import FinanceShared
import XCTest

final class CategorizationTelemetryTests: XCTestCase {

    func testInMemoryAggregation() {
        let telemetry = InMemoryCategorizationTelemetry()

        telemetry.recordSuggestionShown(source: .rules, band: .medium)
        telemetry.recordSuggestionShown(source: .coreML, band: .high)
        telemetry.recordSuggestionShown(source: .fallback, band: .none)
        telemetry.recordAccepted(source: .rules)
        telemetry.recordOverridden(source: .coreML)
        telemetry.recordDisabled()

        let snapshot = telemetry.snapshot()
        XCTAssertEqual(snapshot.suggestionsShown, 3)
        XCTAssertEqual(snapshot.accepted, 1)
        XCTAssertEqual(snapshot.overridden, 1)
        XCTAssertEqual(snapshot.disabled, 1)
        XCTAssertEqual(snapshot.fallbackShown, 1)
        XCTAssertEqual(snapshot.shownBySource["rules"], 1)
        XCTAssertEqual(snapshot.shownBySource["coreML"], 1)
        XCTAssertEqual(snapshot.shownByBand["high"], 1)
    }

    func testAcceptanceRate() {
        let telemetry = InMemoryCategorizationTelemetry()
        XCTAssertEqual(telemetry.snapshot().acceptanceRate, 0.0)

        telemetry.recordAccepted(source: .rules)
        telemetry.recordAccepted(source: .rules)
        telemetry.recordOverridden(source: .rules)

        XCTAssertEqual(telemetry.snapshot().acceptanceRate, 2.0 / 3.0, accuracy: 0.0001)
    }

    func testReset() {
        let telemetry = InMemoryCategorizationTelemetry()
        telemetry.recordSuggestionShown(source: .rules, band: .medium)
        telemetry.reset()
        XCTAssertEqual(telemetry.snapshot().suggestionsShown, 0)
    }

    func testUserDefaultsPersistsAcrossInstances() throws {
        let suiteName = "test.categorization.telemetry.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let first = AggregateCategorizationTelemetry(defaults: defaults, storageKey: "k")
        first.recordSuggestionShown(source: .rules, band: .medium)
        first.recordAccepted(source: .rules)

        // A fresh instance reading the same suite sees the persisted counts.
        let second = AggregateCategorizationTelemetry(defaults: defaults, storageKey: "k")
        let snapshot = second.snapshot()
        XCTAssertEqual(snapshot.suggestionsShown, 1)
        XCTAssertEqual(snapshot.accepted, 1)
    }
}
