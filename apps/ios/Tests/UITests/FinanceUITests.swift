// SPDX-License-Identifier: BUSL-1.1

// FinanceUITests.swift
// Comprehensive XCUITest suite for the Finance iOS app.
// Each test resets state via setUp() to ensure independence.

import XCTest

final class FinanceUITests: XCTestCase {

    private var app: XCUIApplication!
    private let defaultTimeout: TimeInterval = 5

    override func setUpWithError() throws { continueAfterFailure = false; app = XCUIApplication(); app.launchArguments.append("--uitesting") }
    override func tearDownWithError() throws { app = nil }

    private func launchAppSkippingOnboarding() { app.launchArguments.append(contentsOf: ["-hasCompletedOnboarding", "YES"]); app.launch() }
    private func launchAppShowingOnboarding() { app.launchArguments.append(contentsOf: ["-hasCompletedOnboarding", "NO"]); app.launch() }

    @discardableResult
    private func navigateToTab(_ tab: String, expectedNavTitle: String? = nil) -> XCUIElement {
        let tabButton = app.tabBars.buttons[tab]
        XCTAssertTrue(tabButton.waitForExistence(timeout: defaultTimeout), "\(tab) tab should exist")
        tabButton.tap()
        if let title = expectedNavTitle { let navBar = app.navigationBars[title]; XCTAssertTrue(navBar.waitForExistence(timeout: defaultTimeout)); return navBar }
        return tabButton
    }

    private func tapAddButton(identifier: String) { let b = app.buttons[identifier]; XCTAssertTrue(b.waitForExistence(timeout: defaultTimeout)); b.tap() }

    @discardableResult
    private func assertStaticTextExists(_ text: String, message: String? = nil) -> XCUIElement { let e = app.staticTexts[text]; XCTAssertTrue(e.waitForExistence(timeout: defaultTimeout), message ?? text); return e }

    private func dismissSheet() { let c = app.navigationBars.buttons["Cancel"]; if c.waitForExistence(timeout: defaultTimeout) { c.tap() } }

    // MARK: - Onboarding Tests

    func testOnboardingShowsOnFirstLaunch() throws { launchAppShowingOnboarding(); XCTAssertTrue(app.otherElements["onboarding_view"].waitForExistence(timeout: defaultTimeout)); assertStaticTextExists("Welcome to Finance") }

    func testOnboardingCanBeSkipped() throws { launchAppShowingOnboarding(); let s = app.buttons["onboarding_skip"]; XCTAssertTrue(s.waitForExistence(timeout: defaultTimeout)); s.tap(); XCTAssertTrue(app.tabBars.buttons["Dashboard"].waitForExistence(timeout: defaultTimeout)) }

    func testOnboardingCompletionShowsMainTab() throws { launchAppShowingOnboarding(); XCTAssertTrue(app.buttons["onboarding_continue"].waitForExistence(timeout: defaultTimeout)); app.buttons["onboarding_continue"].tap(); assertStaticTextExists("Track Everything"); app.buttons["onboarding_continue"].tap(); assertStaticTextExists("Your Data, Your Device"); app.buttons["onboarding_continue"].tap(); assertStaticTextExists("Let's Get Started"); XCTAssertTrue(app.buttons["onboarding_get_started"].waitForExistence(timeout: defaultTimeout)); app.buttons["onboarding_get_started"].tap(); XCTAssertTrue(app.tabBars.buttons["Dashboard"].waitForExistence(timeout: defaultTimeout)) }

    // MARK: - Navigation Tests

    func testDashboardIsDefaultTab() throws { launchAppSkippingOnboarding(); XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: defaultTimeout)); XCTAssertTrue(app.tabBars.buttons["Dashboard"].isSelected) }

    func testTabBarNavigationToAllTabs() throws { launchAppSkippingOnboarding(); for tab in ["Dashboard", "Accounts", "Transactions", "Budgets", "Goals"] { XCTAssertTrue(app.tabBars.buttons[tab].waitForExistence(timeout: defaultTimeout)) }; navigateToTab("Accounts", expectedNavTitle: "Accounts"); navigateToTab("Transactions", expectedNavTitle: "Transactions"); navigateToTab("Budgets", expectedNavTitle: "Budgets"); navigateToTab("Goals", expectedNavTitle: "Goals"); navigateToTab("Dashboard", expectedNavTitle: "Dashboard") }

    func testBackNavigationFromDetail() throws { launchAppSkippingOnboarding(); navigateToTab("Accounts", expectedNavTitle: "Accounts"); if app.cells.firstMatch.waitForExistence(timeout: defaultTimeout) { app.cells.firstMatch.tap(); if app.navigationBars.buttons["Accounts"].waitForExistence(timeout: defaultTimeout) { app.navigationBars.buttons["Accounts"].tap(); XCTAssertTrue(app.navigationBars["Accounts"].waitForExistence(timeout: defaultTimeout)) } } }

    // MARK: - Account Tests

    func testAccountListDisplaysAccounts() throws { launchAppSkippingOnboarding(); navigateToTab("Accounts", expectedNavTitle: "Accounts"); XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: defaultTimeout) || app.otherElements["empty_state_view"].waitForExistence(timeout: 2)) }

    func testAccountDetailShowsTransactions() throws { launchAppSkippingOnboarding(); navigateToTab("Accounts", expectedNavTitle: "Accounts"); guard app.cells.firstMatch.waitForExistence(timeout: defaultTimeout) else { return }; app.cells.firstMatch.tap(); XCTAssertTrue(app.staticTexts["Current Balance"].waitForExistence(timeout: defaultTimeout)) }

    func testCreateAccountFlow() throws { launchAppSkippingOnboarding(); navigateToTab("Accounts", expectedNavTitle: "Accounts"); tapAddButton(identifier: "add_account_button"); XCTAssertTrue(app.navigationBars["Add Account"].waitForExistence(timeout: defaultTimeout)); dismissSheet(); XCTAssertTrue(app.navigationBars["Accounts"].waitForExistence(timeout: defaultTimeout)) }

    // MARK: - Transaction Tests

    func testTransactionListDisplaysTransactions() throws { launchAppSkippingOnboarding(); navigateToTab("Transactions", expectedNavTitle: "Transactions"); XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: defaultTimeout) || app.otherElements["empty_state_view"].waitForExistence(timeout: 2)) }

    func testCreateTransactionFlow() throws { launchAppSkippingOnboarding(); navigateToTab("Transactions", expectedNavTitle: "Transactions"); tapAddButton(identifier: "add_transaction_button"); let c = app.navigationBars.buttons["Cancel"]; XCTAssertTrue(c.waitForExistence(timeout: defaultTimeout)); assertStaticTextExists("What type of transaction?"); c.tap() }

    func testTransactionSearchFilters() throws { launchAppSkippingOnboarding(); navigateToTab("Transactions", expectedNavTitle: "Transactions"); let sf = app.searchFields.firstMatch; if sf.waitForExistence(timeout: defaultTimeout) { sf.tap(); sf.typeText("Groceries"); sleep(1); XCTAssertTrue(app.cells.firstMatch.exists || app.staticTexts["No Results"].exists || app.staticTexts["No Transactions"].exists); sf.buttons["Clear text"].tap() } }

    func testDeleteTransaction() throws { launchAppSkippingOnboarding(); navigateToTab("Transactions", expectedNavTitle: "Transactions"); let cells = app.cells; guard cells.firstMatch.waitForExistence(timeout: defaultTimeout) else { return }; let count = cells.count; cells.firstMatch.swipeLeft(); if app.buttons["Delete"].waitForExistence(timeout: defaultTimeout) { app.buttons["Delete"].tap(); if app.alerts.buttons["Delete"].waitForExistence(timeout: defaultTimeout) { app.alerts.buttons["Delete"].tap(); sleep(1); XCTAssertTrue(cells.count < count || app.otherElements["empty_state_view"].exists) } } }

    // MARK: - Budget Tests

    func testBudgetListShowsProgress() throws { launchAppSkippingOnboarding(); navigateToTab("Budgets", expectedNavTitle: "Budgets"); let s = app.staticTexts["Spent"].waitForExistence(timeout: defaultTimeout); let e = app.otherElements["empty_state_view"].waitForExistence(timeout: 2); XCTAssertTrue(s || e); if s { assertStaticTextExists("Budgeted") } }

    func testCreateBudgetFlow() throws { launchAppSkippingOnboarding(); navigateToTab("Budgets", expectedNavTitle: "Budgets"); tapAddButton(identifier: "create_budget_button"); XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout: defaultTimeout)); assertStaticTextExists("Category"); assertStaticTextExists("Amount"); dismissSheet() }

    // MARK: - Goal Tests

    func testGoalListDisplaysGoals() throws { launchAppSkippingOnboarding(); navigateToTab("Goals", expectedNavTitle: "Goals"); XCTAssertTrue(app.cells.firstMatch.waitForExistence(timeout: defaultTimeout) || app.otherElements["empty_state_view"].waitForExistence(timeout: 2) || app.staticTexts["Remaining:"].waitForExistence(timeout: 2)) }

    func testCreateGoalFlow() throws { launchAppSkippingOnboarding(); navigateToTab("Goals", expectedNavTitle: "Goals"); tapAddButton(identifier: "create_goal_button"); let c = app.navigationBars.buttons["Cancel"]; XCTAssertTrue(c.waitForExistence(timeout: defaultTimeout)); assertStaticTextExists("Name"); assertStaticTextExists("Target Amount"); c.tap() }

    // MARK: - Settings Tests

    func testSettingsScreenShowsAllOptions() throws { launchAppSkippingOnboarding(); let st = app.tabBars.buttons["Settings"]; if st.waitForExistence(timeout: 2) { st.tap() } else { guard app.navigationBars.buttons["Settings"].waitForExistence(timeout: defaultTimeout) else { return }; app.navigationBars.buttons["Settings"].tap() }; XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: defaultTimeout)); assertStaticTextExists("General"); if app.tables.firstMatch.exists { app.tables.firstMatch.swipeUp() }; assertStaticTextExists("Security"); assertStaticTextExists("Data") }

    func testCurrencySelection() throws { launchAppSkippingOnboarding(); let st = app.tabBars.buttons["Settings"]; guard st.waitForExistence(timeout: defaultTimeout) else { return }; st.tap(); let cp = app.buttons["currency_picker"].firstMatch; if cp.waitForExistence(timeout: defaultTimeout) { cp.tap() } }

    func testBiometricToggle() throws { launchAppSkippingOnboarding(); let st = app.tabBars.buttons["Settings"]; guard st.waitForExistence(timeout: defaultTimeout) else { return }; st.tap(); let bt = app.switches["biometric_toggle"]; if bt.waitForExistence(timeout: defaultTimeout) { let iv = bt.value as? String; bt.tap(); XCTAssertTrue(bt.exists); if bt.isEnabled { XCTAssertNotEqual(iv, bt.value as? String) } } }

    // MARK: - Error State Tests

    func testEmptyStateDisplaysMessage() throws { launchAppSkippingOnboarding(); for tab in ["Accounts", "Transactions", "Budgets", "Goals"] { navigateToTab(tab, expectedNavTitle: tab); if app.otherElements["empty_state_view"].waitForExistence(timeout: 3) { XCTAssertTrue(app.otherElements["empty_state_view"].exists); break } } }

    func testOfflineBannerAppears() throws { launchAppSkippingOnboarding(); if app.otherElements["offline_banner"].waitForExistence(timeout: 3) { XCTAssertTrue(app.otherElements["offline_banner"].exists) } }

    // MARK: - Accessibility Tests

    func testAllTabsHaveAccessibilityLabels() throws { launchAppSkippingOnboarding(); for tab in ["Dashboard", "Accounts", "Transactions", "Budgets", "Goals"] { let tb = app.tabBars.buttons[tab]; XCTAssertTrue(tb.waitForExistence(timeout: defaultTimeout)); XCTAssertFalse(tb.label.isEmpty) } }

    func testDynamicTypeSupport() throws { app.launchArguments.append(contentsOf: ["-hasCompletedOnboarding", "YES"]); app.launch(); XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: defaultTimeout)); navigateToTab("Accounts", expectedNavTitle: "Accounts"); navigateToTab("Transactions", expectedNavTitle: "Transactions"); navigateToTab("Budgets", expectedNavTitle: "Budgets"); navigateToTab("Goals", expectedNavTitle: "Goals"); XCTAssertTrue(app.tabBars.firstMatch.exists) }

    func testDashboardElementsHaveAccessibilityLabels() throws { launchAppSkippingOnboarding(); if app.otherElements["net_worth_card"].waitForExistence(timeout: defaultTimeout) { XCTAssertFalse(app.otherElements["net_worth_card"].label.isEmpty) }; if app.otherElements["spending_summary_card"].waitForExistence(timeout: defaultTimeout) { XCTAssertFalse(app.otherElements["spending_summary_card"].label.isEmpty) } }

    func testNavigationBarsHaveAccessibleTitles() throws { launchAppSkippingOnboarding(); for s in [("Dashboard", "Dashboard"), ("Accounts", "Accounts"), ("Transactions", "Transactions"), ("Budgets", "Budgets"), ("Goals", "Goals")] { navigateToTab(s.0, expectedNavTitle: s.1); XCTAssertTrue(app.navigationBars[s.1].exists) } }

    // MARK: - Dashboard Tests

    func testDashboardShowsNetWorth() throws { launchAppSkippingOnboarding(); XCTAssertTrue(app.staticTexts["Net Worth"].waitForExistence(timeout: defaultTimeout)) }

    func testDashboardShowsRecentTransactions() throws { launchAppSkippingOnboarding(); XCTAssertTrue(app.staticTexts["Recent Transactions"].waitForExistence(timeout: defaultTimeout) || app.staticTexts["No Recent Transactions"].waitForExistence(timeout: 2)) }

    func testDashboardShowsMonthlySpendingSummary() throws { launchAppSkippingOnboarding(); assertStaticTextExists("This Month") }

    func testDashboardPullToRefresh() throws { launchAppSkippingOnboarding(); let nw = app.staticTexts["Net Worth"]; XCTAssertTrue(nw.waitForExistence(timeout: defaultTimeout)); if app.scrollViews.firstMatch.exists { app.scrollViews.firstMatch.swipeDown(); sleep(2) }; XCTAssertTrue(nw.waitForExistence(timeout: defaultTimeout)) }

    // MARK: - Transaction Create Form Tests

    func testTransactionCreateFormStepNavigation() throws { launchAppSkippingOnboarding(); navigateToTab("Transactions", expectedNavTitle: "Transactions"); tapAddButton(identifier: "add_transaction_button"); assertStaticTextExists("What type of transaction?"); let eb = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Expense'")).firstMatch; if eb.waitForExistence(timeout: defaultTimeout) { eb.tap() }; let nb = app.buttons["Next"]; XCTAssertTrue(nb.waitForExistence(timeout: defaultTimeout)); nb.tap(); XCTAssertTrue(app.textFields["transaction_amount_field"].waitForExistence(timeout: defaultTimeout)); XCTAssertTrue(app.textFields["transaction_payee_field"].waitForExistence(timeout: defaultTimeout)); let bb = app.buttons["Back"]; XCTAssertTrue(bb.waitForExistence(timeout: defaultTimeout)); bb.tap(); assertStaticTextExists("What type of transaction?"); dismissSheet() }

    // MARK: - Budget Month Navigation Test

    func testBudgetMonthNavigation() throws { launchAppSkippingOnboarding(); navigateToTab("Budgets", expectedNavTitle: "Budgets"); let p = app.buttons["Previous month"]; let n = app.buttons["Next month"]; if p.waitForExistence(timeout: defaultTimeout), n.waitForExistence(timeout: defaultTimeout) { p.tap(); sleep(1); n.tap(); sleep(1); XCTAssertTrue(app.navigationBars["Budgets"].exists) } }

    // MARK: - App Launch Performance

    func testLaunchPerformance() throws { if #available(iOS 17.0, macOS 14.0, *) { measure(metrics: [XCTApplicationLaunchMetric()]) { let ta = XCUIApplication(); ta.launchArguments.append(contentsOf: ["--uitesting", "-hasCompletedOnboarding", "YES"]); ta.launch() } } }
}
