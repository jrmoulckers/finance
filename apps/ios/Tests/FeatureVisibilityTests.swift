// SPDX-License-Identifier: BUSL-1.1

// FeatureVisibilityTests.swift
// FinanceTests
//
// Tests for the low-noise / minimalist mode visibility store (#2122).

import XCTest
@testable import FinanceApp

final class FeatureVisibilityTests: XCTestCase {

    private var defaults: UserDefaults!
    private let suiteName = "FeatureVisibilityTests.suite"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    func testUnsetKeyDefaultsToVisible() {
        XCTAssertTrue(FeatureVisibility.isVisible(FeatureVisibility.investmentsKey, defaults: defaults))
    }

    func testExplicitFalseHidesFeature() {
        defaults.set(false, forKey: FeatureVisibility.billsKey)
        XCTAssertFalse(FeatureVisibility.isVisible(FeatureVisibility.billsKey, defaults: defaults))
    }

    func testFirePresetHidesBillsReportsAndMoodTags() {
        FeatureVisibility.apply(FeatureVisibility.firePreset(), to: defaults)

        XCTAssertTrue(FeatureVisibility.isVisible(FeatureVisibility.investmentsKey, defaults: defaults))
        XCTAssertTrue(FeatureVisibility.isVisible(FeatureVisibility.budgetsTabKey, defaults: defaults))
        XCTAssertTrue(FeatureVisibility.isVisible(FeatureVisibility.goalsTabKey, defaults: defaults))
        XCTAssertFalse(FeatureVisibility.isVisible(FeatureVisibility.billsKey, defaults: defaults))
        XCTAssertFalse(FeatureVisibility.isVisible(FeatureVisibility.reportsKey, defaults: defaults))
        XCTAssertFalse(defaults.bool(forKey: FeatureVisibility.moodTagsKey))
    }

    func testFullPresetRestoresEverything() {
        FeatureVisibility.apply(FeatureVisibility.firePreset(), to: defaults)
        FeatureVisibility.apply(FeatureVisibility.fullPreset(), to: defaults)

        for key in FeatureVisibility.visibilityKeys {
            XCTAssertTrue(FeatureVisibility.isVisible(key, defaults: defaults), "\(key) should be visible")
        }
        XCTAssertFalse(FeatureVisibility.hasHiddenFeatures(defaults: defaults))
    }

    func testHasHiddenFeatures() {
        XCTAssertFalse(FeatureVisibility.hasHiddenFeatures(defaults: defaults))
        defaults.set(false, forKey: FeatureVisibility.reportsKey)
        XCTAssertTrue(FeatureVisibility.hasHiddenFeatures(defaults: defaults))
    }
}
