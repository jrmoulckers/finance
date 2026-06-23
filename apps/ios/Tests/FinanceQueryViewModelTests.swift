// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryViewModelTests.swift
// FinanceTests
//
// Tests for ``FinanceQueryViewModel`` orchestration (#2386): the parse →
// clarify → answer pipeline and, crucially, the requirement that sensitive
// balances are not spoken aloud without explicit confirmation. Speech is
// injected via ``SilentVoiceOutput`` so nothing is actually spoken.

import XCTest
@testable import FinanceApp

@MainActor
final class FinanceQueryViewModelTests: XCTestCase {

    // MARK: - Builders

    private func makeViewModel(
        transactions: [TransactionItem] = [],
        accounts: [AccountItem] = [],
        categories: [CategoryItem] = [],
        transactionError: Error? = nil
    ) -> (FinanceQueryViewModel, SilentVoiceOutput) {
        let txnStub = StubTransactionRepository()
        txnStub.transactionsToReturn = transactions
        txnStub.errorToThrow = transactionError

        let acctStub = StubAccountRepository()
        acctStub.accountsToReturn = accounts

        let catStub = StubCategoryRepository()
        catStub.categoriesToReturn = categories

        let voice = SilentVoiceOutput()
        let viewModel = FinanceQueryViewModel(
            transactions: txnStub,
            accounts: acctStub,
            categories: catStub,
            voice: voice,
            speechRecognizer: UnavailableSpeechRecognizer()
        )
        return (viewModel, voice)
    }

    private func sampleTransactions() -> [TransactionItem] {
        [
            TransactionItem(
                id: "1", payee: "Netflix", category: "Entertainment",
                accountName: "Travel Card", amountMinorUnits: -15_00,
                currencyCode: "USD", date: .now, type: .expense
            ),
            TransactionItem(
                id: "2", payee: "Whole Foods", category: "Groceries",
                accountName: "Main Checking", amountMinorUnits: -40_00,
                currencyCode: "USD", date: .now, type: .expense
            ),
        ]
    }

    private func sampleCategories() -> [CategoryItem] {
        [
            CategoryItem(id: "c1", name: "Groceries", colorHex: "#38A169", icon: "cart"),
            CategoryItem(id: "c2", name: "Dining Out", colorHex: "#DD6B20", icon: "fork.knife"),
        ]
    }

    private func sampleAccounts() -> [AccountItem] {
        [
            AccountItem(id: "a1", name: "Main Checking", balanceMinorUnits: 1_200_00,
                        currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false),
        ]
    }

    // MARK: - Spend Query (non-sensitive speaks immediately)

    func testSpendQueryAnswersAndSpeaksImmediately() async {
        let (viewModel, voice) = makeViewModel(
            transactions: sampleTransactions(),
            accounts: sampleAccounts(),
            categories: sampleCategories()
        )
        viewModel.inputText = "How much did I spend at Netflix"
        await viewModel.submit()

        guard case .answered(let result) = viewModel.phase else {
            return XCTFail("Expected answered phase, got \(viewModel.phase)")
        }
        XCTAssertFalse(result.requiresSpokenConfirmation)

        viewModel.requestSpeak()
        XCTAssertNil(viewModel.pendingSpokenConfirmation)
        XCTAssertEqual(voice.spokenText.count, 1, "Non-sensitive answers speak immediately")
    }

    // MARK: - Balance Query (sensitive requires confirmation)

    func testBalanceQueryRequiresConfirmationBeforeSpeaking() async {
        let (viewModel, voice) = makeViewModel(accounts: sampleAccounts())
        viewModel.inputText = "What's my balance"
        await viewModel.submit()

        guard case .answered(let result) = viewModel.phase else {
            return XCTFail("Expected answered phase, got \(viewModel.phase)")
        }
        XCTAssertTrue(result.requiresSpokenConfirmation)

        // Requesting speak must NOT speak yet — it should stage a confirmation.
        viewModel.requestSpeak()
        XCTAssertNotNil(viewModel.pendingSpokenConfirmation)
        XCTAssertTrue(voice.spokenText.isEmpty, "Sensitive balance must not be spoken without confirmation")

        // Confirming finally speaks it.
        viewModel.confirmSpeak()
        XCTAssertNil(viewModel.pendingSpokenConfirmation)
        XCTAssertEqual(voice.spokenText.count, 1)
    }

    func testCancelSpeakDoesNotSpeakBalance() async {
        let (viewModel, voice) = makeViewModel(accounts: sampleAccounts())
        viewModel.inputText = "What's my balance"
        await viewModel.submit()

        viewModel.requestSpeak()
        XCTAssertNotNil(viewModel.pendingSpokenConfirmation)

        viewModel.cancelSpeak()
        XCTAssertNil(viewModel.pendingSpokenConfirmation)
        XCTAssertTrue(voice.spokenText.isEmpty, "Cancelling must never speak the balance")
    }

    // MARK: - Clarification Flow

    func testAmbiguousCategoryEntersClarificationThenResolves() async {
        let (viewModel, _) = makeViewModel(
            transactions: sampleTransactions(),
            accounts: sampleAccounts(),
            categories: sampleCategories()
        )
        viewModel.inputText = "How much did I spend on food this week"
        await viewModel.submit()

        guard case .clarifying(.ambiguousCategory(let phrase, let options)) = viewModel.phase else {
            return XCTFail("Expected ambiguousCategory clarification, got \(viewModel.phase)")
        }
        XCTAssertEqual(phrase, "food")
        XCTAssertTrue(options.contains("Groceries"))

        await viewModel.resolveCategory("Groceries")
        guard case .answered(let result) = viewModel.phase else {
            return XCTFail("Expected answered phase after resolution, got \(viewModel.phase)")
        }
        XCTAssertEqual(result.plan.kind, .spend(.category("Groceries")))
    }

    // MARK: - Unrecognized

    func testUnrecognizedQuery() async {
        let (viewModel, _) = makeViewModel()
        viewModel.inputText = "What's the weather today"
        await viewModel.submit()
        XCTAssertEqual(viewModel.phase, .unrecognized)
    }

    // MARK: - Empty Input

    func testEmptyInputStaysIdle() async {
        let (viewModel, _) = makeViewModel()
        viewModel.inputText = "   "
        await viewModel.submit()
        XCTAssertEqual(viewModel.phase, .idle)
    }

    // MARK: - Error Handling

    func testDataLoadFailureSurfacesError() async {
        let (viewModel, _) = makeViewModel(transactionError: TestError.simulated)
        viewModel.inputText = "How much did I spend at Netflix"
        await viewModel.submit()

        XCTAssertTrue(viewModel.showError)
        XCTAssertEqual(viewModel.phase, .idle)
    }

    // MARK: - Reset

    func testResetClearsState() async {
        let (viewModel, _) = makeViewModel(accounts: sampleAccounts())
        viewModel.inputText = "What's my balance"
        await viewModel.submit()
        viewModel.requestSpeak()

        viewModel.reset()
        XCTAssertEqual(viewModel.phase, .idle)
        XCTAssertTrue(viewModel.inputText.isEmpty)
        XCTAssertNil(viewModel.pendingSpokenConfirmation)
    }

    // MARK: - Speech Availability

    func testSpeechInputUnavailableByDefault() {
        let (viewModel, _) = makeViewModel()
        XCTAssertFalse(viewModel.isSpeechInputAvailable)
    }
}
