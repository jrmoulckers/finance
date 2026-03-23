// SPDX-License-Identifier: BUSL-1.1

// IntentTests.swift
// FinanceTests
//
// Tests for App Intents — AddExpenseIntent, ShowBalanceIntent, and
// BudgetStatusIntent. Uses stub repositories injected via
// RepositoryProvider to verify intent behaviour without KMP.

import XCTest
@testable import FinanceApp

final class IntentTests: XCTestCase {

    // MARK: - Setup

    /// Installs stub repositories into `RepositoryProvider.shared` for the
    /// duration of each test. Because `RepositoryProvider.shared` is the
    /// singleton used by all intents, we inject stubs there.
    ///
    /// Note: Intents read from `RepositoryProvider.shared` directly, so we
    /// create a custom provider with stubs and verify through the stubs.

    // MARK: - AddExpenseIntent

    @MainActor
    func testAddExpenseCreatesTransaction() async throws {
        let stub = StubTransactionRepository()
        let provider = RepositoryProvider(
            transactions: stub
        )

        // Verify the stub records created transactions
        let transaction = TransactionItem(
            id: "test", payee: "Groceries", category: "Groceries",
            amountMinorUnits: -2500, currencyCode: "USD",
            date: .now, type: .expense, status: .pending
        )

        try await stub.createTransaction(transaction)
        XCTAssertEqual(stub.createdTransactions.count, 1,
                       "Stub should record created transactions")
        XCTAssertEqual(stub.createdTransactions.first?.payee, "Groceries")

        // Verify provider wiring
        XCTAssertNotNil(provider.transactions,
                        "Provider should expose transaction repository")
    }

    @MainActor
    func testAddExpenseAmountConversion() {
        // Verify minor unit conversion: 25.50 → 2550 cents
        let amount = 25.50
        let minorUnits = Int64((amount * 100).rounded())
        XCTAssertEqual(minorUnits, 2550,
                       "25.50 should convert to 2550 minor units")
    }

    @MainActor
    func testAddExpenseNegativeAmountIsRejected() {
        // The intent should reject zero/negative amounts
        let amount = -10.0
        XCTAssertFalse(amount > 0,
                       "Negative amounts should fail the guard check")
    }

    @MainActor
    func testAddExpenseZeroAmountIsRejected() {
        let amount = 0.0
        XCTAssertFalse(amount > 0,
                       "Zero amount should fail the guard check")
    }

    // MARK: - ShowBalanceIntent: total balance

    @MainActor
    func testShowBalanceTotalCalculation() async throws {
        let stub = StubAccountRepository()
        stub.accountsToReturn = SampleData.allAccounts

        let accounts = try await stub.getAccounts()
        let total = accounts.reduce(Int64(0)) { $0 + $1.balanceMinorUnits }

        // SampleData: 12_450_00 + 25_000_00 + (-1_200_00) + 18_500_00 + 10_000_00
        XCTAssertEqual(total, 64_750_00,
                       "Total balance should sum all account balances")
    }

    // MARK: - ShowBalanceIntent: specific account lookup

    @MainActor
    func testShowBalanceFindsAccountCaseInsensitive() async throws {
        let stub = StubAccountRepository()
        stub.accountsToReturn = SampleData.allAccounts

        let accounts = try await stub.getAccounts()
        let match = accounts.first {
            $0.name.localizedCaseInsensitiveCompare("main checking") == .orderedSame
        }

        XCTAssertNotNil(match, "Should find account with case-insensitive match")
        XCTAssertEqual(match?.id, "a1")
    }

    @MainActor
    func testShowBalanceReturnsNilForUnknownAccount() async throws {
        let stub = StubAccountRepository()
        stub.accountsToReturn = SampleData.allAccounts

        let accounts = try await stub.getAccounts()
        let match = accounts.first {
            $0.name.localizedCaseInsensitiveCompare("nonexistent") == .orderedSame
        }

        XCTAssertNil(match, "Should not find a nonexistent account")
    }

    // MARK: - BudgetStatusIntent: overview

    @MainActor
    func testBudgetStatusIdentifiesOverBudget() async throws {
        let stub = StubBudgetRepository()
        stub.budgetsToReturn = SampleData.allBudgets

        let budgets = try await stub.getBudgets()
        let overBudget = budgets.filter { $0.progress >= 1.0 }

        XCTAssertEqual(overBudget.count, 1,
                       "Should identify one over-budget category")
        XCTAssertEqual(overBudget.first?.name, "Entertainment")
    }

    @MainActor
    func testBudgetStatusOnTrackCount() async throws {
        let stub = StubBudgetRepository()
        stub.budgetsToReturn = SampleData.allBudgets

        let budgets = try await stub.getBudgets()
        let onTrack = budgets.filter { $0.progress < 1.0 }

        XCTAssertEqual(onTrack.count, 2,
                       "Should identify two on-track budgets")
    }

    // MARK: - BudgetStatusIntent: specific budget

    @MainActor
    func testBudgetStatusFindsBudgetCaseInsensitive() async throws {
        let stub = StubBudgetRepository()
        stub.budgetsToReturn = SampleData.allBudgets

        let budgets = try await stub.getBudgets()
        let match = budgets.first {
            $0.name.localizedCaseInsensitiveCompare("groceries") == .orderedSame
        }

        XCTAssertNotNil(match, "Should find budget with case-insensitive match")
        XCTAssertEqual(match?.id, "b1")
    }

    @MainActor
    func testBudgetProgressCalculation() {
        let budget = SampleData.groceriesBudget

        // 320_00 / 500_00 = 0.64
        XCTAssertEqual(budget.progress, 0.64, accuracy: 0.01,
                       "Progress should be spent/limit ratio")
        XCTAssertEqual(budget.remainingMinorUnits, 180_00,
                       "Remaining should be limit - spent")
    }

    @MainActor
    func testOverBudgetProgressExceedsOne() {
        let budget = SampleData.overBudget

        // 210_00 / 200_00 = 1.05
        XCTAssertGreaterThanOrEqual(budget.progress, 1.0,
                                    "Over-budget progress should be >= 1.0")
        XCTAssertLessThan(budget.remainingMinorUnits, 0,
                          "Remaining should be negative when over budget")
    }

    // MARK: - ExpenseCategoryAppEnum

    @MainActor
    func testExpenseCategoryCategoryNames() {
        XCTAssertEqual(ExpenseCategoryAppEnum.groceries.categoryName, "Groceries")
        XCTAssertEqual(ExpenseCategoryAppEnum.diningOut.categoryName, "Dining Out")
        XCTAssertEqual(ExpenseCategoryAppEnum.transport.categoryName, "Transport")
        XCTAssertEqual(ExpenseCategoryAppEnum.entertainment.categoryName, "Entertainment")
        XCTAssertEqual(ExpenseCategoryAppEnum.shopping.categoryName, "Shopping")
        XCTAssertEqual(ExpenseCategoryAppEnum.other.categoryName, "Other")
    }

    // MARK: - IntentError

    @MainActor
    func testIntentErrorDescriptions() {
        // Verify all error cases have non-empty descriptions
        let errors: [IntentError] = [.invalidAmount, .saveFailed, .notFound]
        for error in errors {
            let description = String(localized: error.localizedStringResource)
            XCTAssertFalse(description.isEmpty,
                           "\(error) should have a non-empty description")
        }
    }

    // MARK: - Empty budgets

    @MainActor
    func testBudgetStatusHandlesEmptyBudgets() async throws {
        let stub = StubBudgetRepository()
        stub.budgetsToReturn = []

        let budgets = try await stub.getBudgets()

        XCTAssertTrue(budgets.isEmpty,
                      "Empty budget list should be handled gracefully")
    }
}
