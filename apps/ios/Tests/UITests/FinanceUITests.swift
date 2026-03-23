// SPDX-License-Identifier: BUSL-1.1

// FinanceUITests.swift
// FinanceUITests
//
// UI test stubs for the Finance iOS app. These tests verify high-level
// navigation, screen loading, and critical user flows using XCUITest.
//
// Note: UI tests require a running app target and an iOS Simulator.
// Configure the FinanceUITests target in the Xcode project to run these.

import XCTest

final class FinanceUITests: XCTestCase {

    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
    }

    // MARK: - Tab Bar Navigation

    func testTabBarNavigation() throws {
        // Verify all primary tabs exist and are tappable
        XCTAssertTrue(app.tabBars.buttons["Dashboard"].exists,
                      "Dashboard tab should exist")
        XCTAssertTrue(app.tabBars.buttons["Accounts"].exists,
                      "Accounts tab should exist")
        XCTAssertTrue(app.tabBars.buttons["Transactions"].exists,
                      "Transactions tab should exist")
    }

    func testTabBarBudgetsTab() throws {
        XCTAssertTrue(app.tabBars.buttons["Budgets"].exists,
                      "Budgets tab should exist")
    }

    func testTabBarGoalsTab() throws {
        XCTAssertTrue(app.tabBars.buttons["Goals"].exists,
                      "Goals tab should exist")
    }

    func testTabBarSettingsTab() throws {
        XCTAssertTrue(app.tabBars.buttons["Settings"].exists,
                      "Settings tab should exist")
    }

    // MARK: - Dashboard

    func testDashboardLoads() throws {
        XCTAssertTrue(app.staticTexts["Net Worth"].waitForExistence(timeout: 5),
                      "Net Worth label should appear on dashboard")
    }

    func testDashboardShowsRecentTransactions() throws {
        // The dashboard shows a "Recent Transactions" section header
        XCTAssertTrue(
            app.staticTexts["Recent Transactions"].waitForExistence(timeout: 5),
            "Recent Transactions section should appear on dashboard"
        )
    }

    // MARK: - Accounts

    func testAccountsScreenLoads() throws {
        app.tabBars.buttons["Accounts"].tap()

        // Wait for the accounts list to appear
        XCTAssertTrue(
            app.navigationBars["Accounts"].waitForExistence(timeout: 5),
            "Accounts navigation bar should appear"
        )
    }

    // MARK: - Transactions

    func testTransactionsScreenLoads() throws {
        app.tabBars.buttons["Transactions"].tap()

        XCTAssertTrue(
            app.navigationBars["Transactions"].waitForExistence(timeout: 5),
            "Transactions navigation bar should appear"
        )
    }

    // MARK: - Settings

    func testSettingsScreenLoads() throws {
        app.tabBars.buttons["Settings"].tap()

        XCTAssertTrue(
            app.navigationBars["Settings"].waitForExistence(timeout: 5),
            "Settings navigation bar should appear"
        )
    }

    // MARK: - Accessibility

    func testDashboardAccessibility() throws {
        // Verify key elements have accessibility identifiers or labels
        // that VoiceOver can use for navigation
        let netWorthElement = app.staticTexts["Net Worth"]
        XCTAssertTrue(netWorthElement.waitForExistence(timeout: 5),
                      "Net Worth should be accessible to VoiceOver")
    }
}
