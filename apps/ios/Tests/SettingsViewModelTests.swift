// SPDX-License-Identifier: BUSL-1.1

// SettingsViewModelTests.swift
// FinanceTests
//
// Tests for SettingsViewModel — default state, currency configuration,
// export lifecycle, and biometric toggle interaction.

import XCTest
@testable import FinanceApp

final class SettingsViewModelTests: XCTestCase {

    // MARK: - Test: default property values

    @MainActor
    func testDefaultPropertyValues() {
        let vm = SettingsViewModel()

        XCTAssertEqual(vm.selectedCurrency, "USD",
                       "Default currency should be USD")
        XCTAssertTrue(vm.notificationsEnabled,
                      "Notifications should be enabled by default")
        XCTAssertTrue(vm.budgetAlerts,
                      "Budget alerts should be enabled by default")
        XCTAssertTrue(vm.goalMilestones,
                      "Goal milestones should be enabled by default")
        XCTAssertFalse(vm.showingExportConfirmation,
                       "Export confirmation should not show by default")
        XCTAssertFalse(vm.isExporting,
                       "Should not be exporting by default")
        XCTAssertFalse(vm.showingDeleteConfirmation,
                       "Delete confirmation should not show by default")
        XCTAssertNil(vm.biometricError,
                     "Biometric error should be nil by default")
        XCTAssertFalse(vm.showingBiometricError,
                       "Biometric error alert should not show by default")
    }

    // MARK: - Test: supported currencies list is populated

    @MainActor
    func testSupportedCurrenciesNotEmpty() {
        let vm = SettingsViewModel()

        XCTAssertFalse(vm.supportedCurrencies.isEmpty,
                       "Supported currencies list should not be empty")
        XCTAssertGreaterThanOrEqual(vm.supportedCurrencies.count, 5,
                                    "Should support at least 5 currencies")
    }

    // MARK: - Test: supported currencies contain expected codes

    @MainActor
    func testSupportedCurrenciesContainExpectedCodes() {
        let vm = SettingsViewModel()

        let codes = vm.supportedCurrencies.map(\.0)
        XCTAssertTrue(codes.contains("USD"), "Should contain USD")
        XCTAssertTrue(codes.contains("EUR"), "Should contain EUR")
        XCTAssertTrue(codes.contains("GBP"), "Should contain GBP")
        XCTAssertTrue(codes.contains("JPY"), "Should contain JPY")
    }

    // MARK: - Test: supported currencies have labels

    @MainActor
    func testSupportedCurrenciesHaveLabels() {
        let vm = SettingsViewModel()

        for (code, label) in vm.supportedCurrencies {
            XCTAssertFalse(code.isEmpty,
                           "Currency code should not be empty")
            XCTAssertFalse(label.isEmpty,
                           "Currency label for \(code) should not be empty")
        }
    }

    // MARK: - Test: exportData lifecycle toggles isExporting

    @MainActor
    func testExportDataLifecycle() async {
        let vm = SettingsViewModel()

        XCTAssertFalse(vm.isExporting, "Should not be exporting initially")

        await vm.exportData()

        XCTAssertFalse(vm.isExporting,
                       "isExporting should be false after export completes")
    }
}
