// SPDX-License-Identifier: BUSL-1.1

// CategorizationFeatureExtractorTests.swift
// FinanceTests
//
// Deterministic tests for feature extraction (tokens, magnitude buckets, and
// calendar-derived temporal features pinned to UTC).
//
// References: #2382

import FinanceShared
import XCTest

final class CategorizationFeatureExtractorTests: XCTestCase {

    // 2023-11-14T22:13:20Z — a Tuesday.
    private let referenceDate = Date(timeIntervalSince1970: 1_700_000_000)

    func testMagnitudeBuckets() {
        XCTAssertEqual(CategorizationFeatureExtractor.magnitudeBucket(forMinorUnits: 100), 0) // $1
        XCTAssertEqual(CategorizationFeatureExtractor.magnitudeBucket(forMinorUnits: 3_000), 2) // $30
        XCTAssertEqual(CategorizationFeatureExtractor.magnitudeBucket(forMinorUnits: 50_000), 6) // $500
        XCTAssertEqual(CategorizationFeatureExtractor.magnitudeBucket(forMinorUnits: 500_000), 7) // $5000
    }

    func testNegativeAmountUsesAbsoluteMagnitude() {
        let extractor = CategorizationFeatureExtractor.utc
        let input = CategorizationInput(
            merchant: "Starbucks",
            amountMinorUnits: -1_250,
            date: referenceDate
        )
        let features = extractor.features(for: input)
        XCTAssertEqual(features.absoluteAmountMinorUnits, 1_250)
        XCTAssertEqual(features.amountMagnitudeBucket, 1) // $12.50 -> bucket 1
    }

    func testTemporalFeaturesAreDeterministicInUTC() {
        let extractor = CategorizationFeatureExtractor.utc
        let input = CategorizationInput(
            merchant: "Shell",
            amountMinorUnits: 4_000,
            date: referenceDate
        )
        let features = extractor.features(for: input)
        XCTAssertEqual(features.dayOfWeek, 3) // Tuesday (Sun = 1)
        XCTAssertEqual(features.hour, 22)
        XCTAssertFalse(features.isWeekend)
    }

    func testSignatureDerivedFromTokens() {
        let extractor = CategorizationFeatureExtractor.utc
        let input = CategorizationInput(
            merchant: "Whole Foods Market #44",
            amountMinorUnits: 8_000,
            date: referenceDate
        )
        let features = extractor.features(for: input)
        XCTAssertFalse(features.signature.isEmpty)
        XCTAssertTrue(features.tokens.contains("whole"))
        XCTAssertTrue(features.tokens.contains("foods"))
    }
}
