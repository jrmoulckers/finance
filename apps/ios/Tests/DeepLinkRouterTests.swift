// SPDX-License-Identifier: BUSL-1.1

// DeepLinkRouterTests.swift
// FinanceTests
//
// Tests for DeepLinkRouter — route parsing, tab navigation, navigation paths,
// auth/invite delegation, and unknown-link alert behavior.
// Refs #470

import XCTest
@testable import FinanceApp

final class DeepLinkRouterTests: XCTestCase {

    // MARK: - Test: /auth/callback delegates to UniversalLinkHandler

    @MainActor
    func testAuthCallbackRouteIsProcessed() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/auth/callback?code=abc123")!

        router.handle(url)

        XCTAssertTrue(
            router.linkHandler.isProcessingAuthCallback,
            "Auth callback should mark the link handler as processing"
        )
        XCTAssertFalse(
            router.showUnknownLinkAlert,
            "Auth callback should not trigger unknown link alert"
        )
        // Tab should remain unchanged — auth callbacks don't navigate
        XCTAssertEqual(
            router.selectedTab, .dashboard,
            "Auth callback should not change the selected tab"
        )
    }

    // MARK: - Test: /auth/callback without query params still routes

    @MainActor
    func testAuthCallbackWithoutQueryParams() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/auth/callback")!

        router.handle(url)

        XCTAssertTrue(
            router.linkHandler.isProcessingAuthCallback,
            "Auth callback without query params should still be processed"
        )
        XCTAssertFalse(router.showUnknownLinkAlert)
    }

    // MARK: - Test: /invite/{code} delegates to UniversalLinkHandler

    @MainActor
    func testInviteRouteWithCode() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/invite/ABC123")!

        router.handle(url)

        XCTAssertTrue(
            router.linkHandler.hasPendingInvite,
            "Invite should mark a pending invite on the link handler"
        )
        XCTAssertEqual(
            router.linkHandler.pendingInviteCode, "ABC123",
            "Invite code should be extracted correctly"
        )
        XCTAssertFalse(
            router.showUnknownLinkAlert,
            "Valid invite should not trigger unknown link alert"
        )
    }

    // MARK: - Test: /invite/ without code is handled gracefully

    @MainActor
    func testInviteRouteWithoutCodeDoesNotCrash() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/invite/")!

        router.handle(url)

        // /invite/ without a code should be parsed by the handler as unknown
        // and should not set a pending invite
        XCTAssertFalse(
            router.showUnknownLinkAlert,
            "Invite without code should not trigger unknown link alert"
        )
    }

    // MARK: - Test: /account/{id} switches to accounts tab and pushes path

    @MainActor
    func testAccountRouteSwitchesTab() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/account/acct-42")!

        router.handle(url)

        XCTAssertEqual(
            router.selectedTab, .accounts,
            "Account deep link should switch to the accounts tab"
        )
        XCTAssertFalse(
            router.accountsPath.isEmpty,
            "Account deep link should push a route onto the accounts path"
        )
        XCTAssertFalse(
            router.showUnknownLinkAlert,
            "Account deep link should not trigger unknown link alert"
        )
    }

    // MARK: - Test: /account/{id} resets existing accounts path before pushing

    @MainActor
    func testAccountRouteResetsPathBeforePush() {
        let router = DeepLinkRouter()

        // Simulate an existing account in the path
        router.accountsPath.append(AccountRoute(id: "old-account"))
        XCTAssertEqual(router.accountsPath.count, 1)

        let url = URL(string: "https://finance.app/account/new-account")!
        router.handle(url)

        // Path should have been reset and a new route pushed
        XCTAssertEqual(
            router.accountsPath.count, 1,
            "Account path should contain exactly one entry after deep link"
        )
    }

    // MARK: - Test: /account without ID is ignored

    @MainActor
    func testAccountRouteWithoutIdIsIgnored() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/account")!

        router.handle(url)

        XCTAssertEqual(
            router.selectedTab, .dashboard,
            "Account link without ID should not change tab"
        )
        XCTAssertTrue(
            router.accountsPath.isEmpty,
            "Account link without ID should not push onto path"
        )
        XCTAssertFalse(router.showUnknownLinkAlert)
    }

    // MARK: - Test: /transaction/{id} switches to transactions tab and pushes path

    @MainActor
    func testTransactionRouteSwitchesTab() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/transaction/txn-99")!

        router.handle(url)

        XCTAssertEqual(
            router.selectedTab, .transactions,
            "Transaction deep link should switch to the transactions tab"
        )
        XCTAssertFalse(
            router.transactionsPath.isEmpty,
            "Transaction deep link should push a route onto the transactions path"
        )
        XCTAssertFalse(
            router.showUnknownLinkAlert,
            "Transaction deep link should not trigger unknown link alert"
        )
    }

    // MARK: - Test: /transaction/{id} resets existing transactions path

    @MainActor
    func testTransactionRouteResetsPathBeforePush() {
        let router = DeepLinkRouter()

        router.transactionsPath.append(TransactionRoute(id: "old-txn"))
        XCTAssertEqual(router.transactionsPath.count, 1)

        let url = URL(string: "https://finance.app/transaction/new-txn")!
        router.handle(url)

        XCTAssertEqual(
            router.transactionsPath.count, 1,
            "Transaction path should contain exactly one entry after deep link"
        )
    }

    // MARK: - Test: /transaction without ID is ignored

    @MainActor
    func testTransactionRouteWithoutIdIsIgnored() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/transaction")!

        router.handle(url)

        XCTAssertEqual(
            router.selectedTab, .dashboard,
            "Transaction link without ID should not change tab"
        )
        XCTAssertTrue(
            router.transactionsPath.isEmpty,
            "Transaction link without ID should not push onto path"
        )
        XCTAssertFalse(router.showUnknownLinkAlert)
    }

    // MARK: - Test: Unknown URL shows alert

    @MainActor
    func testUnknownRouteShowsAlert() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/settings/unknown")!

        router.handle(url)

        XCTAssertTrue(
            router.showUnknownLinkAlert,
            "Unknown deep link should show alert"
        )
        XCTAssertEqual(
            router.unknownLinkURL, url.absoluteString,
            "Unknown link URL should be captured for the alert message"
        )
    }

    // MARK: - Test: Empty path triggers unknown link alert

    @MainActor
    func testEmptyPathShowsUnknownAlert() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/")!

        router.handle(url)

        XCTAssertTrue(
            router.showUnknownLinkAlert,
            "Root URL with no path should trigger unknown link alert"
        )
    }

    // MARK: - Test: Bare host (no trailing slash) triggers unknown link alert

    @MainActor
    func testBareHostShowsUnknownAlert() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app")!

        router.handle(url)

        XCTAssertTrue(
            router.showUnknownLinkAlert,
            "Bare host URL should trigger unknown link alert"
        )
    }

    // MARK: - Test: Custom scheme URLs are routed correctly

    @MainActor
    func testCustomSchemeAccountRoute() {
        let router = DeepLinkRouter()
        let url = URL(string: "finance://account/acct-custom")!

        router.handle(url)

        XCTAssertEqual(
            router.selectedTab, .accounts,
            "Custom scheme account link should switch to accounts tab"
        )
        XCTAssertFalse(
            router.accountsPath.isEmpty,
            "Custom scheme account link should push onto accounts path"
        )
    }

    // MARK: - Test: Account route does not affect transactions path

    @MainActor
    func testAccountRouteDoesNotAffectTransactionsPath() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/account/acct-1")!

        router.handle(url)

        XCTAssertTrue(
            router.transactionsPath.isEmpty,
            "Account deep link should not modify the transactions path"
        )
    }

    // MARK: - Test: Transaction route does not affect accounts path

    @MainActor
    func testTransactionRouteDoesNotAffectAccountsPath() {
        let router = DeepLinkRouter()
        let url = URL(string: "https://finance.app/transaction/txn-1")!

        router.handle(url)

        XCTAssertTrue(
            router.accountsPath.isEmpty,
            "Transaction deep link should not modify the accounts path"
        )
    }

    // MARK: - Test: Default tab is dashboard

    @MainActor
    func testDefaultTabIsDashboard() {
        let router = DeepLinkRouter()

        XCTAssertEqual(
            router.selectedTab, .dashboard,
            "Default selected tab should be dashboard"
        )
    }

    // MARK: - Test: Successive deep links update state correctly

    @MainActor
    func testSuccessiveDeepLinksUpdateState() {
        let router = DeepLinkRouter()

        // First: navigate to account
        router.handle(URL(string: "https://finance.app/account/a1")!)
        XCTAssertEqual(router.selectedTab, .accounts)
        XCTAssertFalse(router.accountsPath.isEmpty)

        // Second: navigate to transaction
        router.handle(URL(string: "https://finance.app/transaction/t1")!)
        XCTAssertEqual(router.selectedTab, .transactions)
        XCTAssertFalse(router.transactionsPath.isEmpty)
    }
}
