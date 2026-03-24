// SPDX-License-Identifier: BUSL-1.1

// DeepLinkHandlerTests.swift
// FinanceTests
//
// Tests for DeepLinkHandler URL parsing and navigation state management.
// Refs #470

import Testing
@testable import Finance

// MARK: - URL Parsing Tests

@Suite("DeepLinkHandler — URL Parsing")
struct DeepLinkHandlerParsingTests {

    @Test("Parses /auth/callback as authCallback")
    @MainActor
    func parsesAuthCallback() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/auth/callback?code=abc123")!

        let result = handler.parse(url)

        #expect(result == .authCallback(url: url))
    }

    @Test("Parses /auth/callback with query parameters")
    @MainActor
    func parsesAuthCallbackWithQueryParams() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/auth/callback?code=xyz&state=nonce")!

        let result = handler.parse(url)

        #expect(result == .authCallback(url: url))
    }

    @Test("Parses /invite/{code} as invite")
    @MainActor
    func parsesInviteCode() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/invite/ABC123")!

        let result = handler.parse(url)

        #expect(result == .invite(code: "ABC123"))
    }

    @Test("Rejects /invite/ with empty code")
    @MainActor
    func rejectsEmptyInviteCode() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/invite/")!

        let result = handler.parse(url)

        #expect(result == .unknown(url: url))
    }

    @Test("Parses /account/{id} as account")
    @MainActor
    func parsesAccountId() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/account/acc-uuid-123")!

        let result = handler.parse(url)

        #expect(result == .account(id: "acc-uuid-123"))
    }

    @Test("Parses /transaction/{id} as transaction")
    @MainActor
    func parsesTransactionId() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/transaction/txn-uuid-456")!

        let result = handler.parse(url)

        #expect(result == .transaction(id: "txn-uuid-456"))
    }

    @Test("Parses custom scheme finance://account/{id}")
    @MainActor
    func parsesCustomSchemeAccount() {
        let handler = DeepLinkHandler()
        let url = URL(string: "finance://account/acc-789")!

        let result = handler.parse(url)

        #expect(result == .account(id: "acc-789"))
    }

    @Test("Parses custom scheme finance://transaction/{id}")
    @MainActor
    func parsesCustomSchemeTransaction() {
        let handler = DeepLinkHandler()
        let url = URL(string: "finance://transaction/txn-101")!

        let result = handler.parse(url)

        #expect(result == .transaction(id: "txn-101"))
    }

    @Test("Returns unknown for unrecognized path")
    @MainActor
    func returnsUnknownForBadPath() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/settings/profile")!

        let result = handler.parse(url)

        #expect(result == .unknown(url: url))
    }

    @Test("Strips trailing slashes from path segments")
    @MainActor
    func stripsTrailingSlashes() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/account/acc-123/")!

        let result = handler.parse(url)

        #expect(result == .account(id: "acc-123"))
    }
}

// MARK: - Navigation State Tests

@Suite("DeepLinkHandler — Navigation State")
struct DeepLinkHandlerNavigationTests {

    @Test("handle() sets selectedTab to accounts for account deep link")
    @MainActor
    func setsTabForAccount() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/account/acc-1")!

        handler.handle(url)

        #expect(handler.selectedTab == .accounts)
        #expect(handler.pendingAccountId == "acc-1")
        #expect(handler.pendingTransactionId == nil)
    }

    @Test("handle() sets selectedTab to transactions for transaction deep link")
    @MainActor
    func setsTabForTransaction() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/transaction/txn-1")!

        handler.handle(url)

        #expect(handler.selectedTab == .transactions)
        #expect(handler.pendingTransactionId == "txn-1")
        #expect(handler.pendingAccountId == nil)
    }

    @Test("handle() sets isProcessingAuthCallback for auth callback")
    @MainActor
    func setsAuthProcessing() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/auth/callback?code=test")!

        handler.handle(url)

        #expect(handler.isProcessingAuthCallback == true)
        #expect(handler.pendingAccountId == nil)
    }

    @Test("handle() sets pendingInviteCode for invite")
    @MainActor
    func setsPendingInvite() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/invite/HOUSEHOLD-CODE")!

        handler.handle(url)

        #expect(handler.pendingInviteCode == "HOUSEHOLD-CODE")
        #expect(handler.isProcessingAuthCallback == false)
    }

    @Test("completeAuthCallback() clears auth state")
    @MainActor
    func completesAuthCallback() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/auth/callback")!)

        handler.completeAuthCallback()

        #expect(handler.isProcessingAuthCallback == false)
        #expect(handler.currentDeepLink == nil)
    }

    @Test("completeInvite() clears invite state")
    @MainActor
    func completesInvite() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/invite/CODE")!)

        handler.completeInvite()

        #expect(handler.pendingInviteCode == nil)
        #expect(handler.currentDeepLink == nil)
    }

    @Test("consumeAccountNavigation() clears pending account")
    @MainActor
    func consumesAccountNav() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/account/acc-1")!)

        handler.consumeAccountNavigation()

        #expect(handler.pendingAccountId == nil)
        #expect(handler.currentDeepLink == nil)
    }

    @Test("consumeTransactionNavigation() clears pending transaction")
    @MainActor
    func consumesTransactionNav() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/transaction/txn-1")!)

        handler.consumeTransactionNavigation()

        #expect(handler.pendingTransactionId == nil)
        #expect(handler.currentDeepLink == nil)
    }

    @Test("reset() clears all state")
    @MainActor
    func resetsAll() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/account/acc-1")!)

        handler.reset()

        #expect(handler.currentDeepLink == nil)
        #expect(handler.selectedTab == nil)
        #expect(handler.pendingAccountId == nil)
        #expect(handler.pendingTransactionId == nil)
        #expect(handler.isProcessingAuthCallback == false)
        #expect(handler.pendingInviteCode == nil)
    }

    @Test("Subsequent deep links clear previous entity state")
    @MainActor
    func subsequentLinksClearPrevious() {
        let handler = DeepLinkHandler()

        // First: navigate to account
        handler.handle(URL(string: "https://finance.app/account/acc-1")!)
        #expect(handler.pendingAccountId == "acc-1")

        // Second: navigate to transaction — should clear account state
        handler.handle(URL(string: "https://finance.app/transaction/txn-1")!)
        #expect(handler.pendingAccountId == nil)
        #expect(handler.pendingTransactionId == "txn-1")
        #expect(handler.selectedTab == .transactions)
    }
}

// MARK: - App Clip Deep Link Tests (#648)

@Suite("DeepLinkHandler - App Clip Expense")
struct DeepLinkHandlerClipTests {
    @Test("Parses /clip/expense without parameters")
    @MainActor
    func parsesClipExpenseNoParams() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/clip/expense")!
        let result = handler.parse(url)
        #expect(result == .clipExpense(amount: nil, category: nil))
    }
    @Test("Parses /clip/expense with amount and category")
    @MainActor
    func parsesClipExpenseWithAmountAndCategory() {
        let handler = DeepLinkHandler()
        let url = URL(string: "https://finance.app/clip/expense?amount=42.99&category=food")!
        let result = handler.parse(url)
        #expect(result == .clipExpense(amount: 4299, category: "food"))
    }
    @Test("handle() sets hasPendingClipExpense")
    @MainActor
    func handleSetsClipState() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/clip/expense?amount=5.00&category=food")!)
        #expect(handler.hasPendingClipExpense == true)
        #expect(handler.pendingClipAmount == 500)
        #expect(handler.selectedTab == .transactions)
    }
    @Test("consumeClipExpense() clears state")
    @MainActor
    func consumeClipExpenseClearsState() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/clip/expense?amount=10.00")!)
        handler.consumeClipExpense()
        #expect(handler.hasPendingClipExpense == false)
        #expect(handler.currentDeepLink == nil)
    }
    @Test("reset() clears clip state")
    @MainActor
    func resetClearsClipState() {
        let handler = DeepLinkHandler()
        handler.handle(URL(string: "https://finance.app/clip/expense?amount=25.00")!)
        handler.reset()
        #expect(handler.hasPendingClipExpense == false)
        #expect(handler.currentDeepLink == nil)
    }
}
