// SPDX-License-Identifier: BUSL-1.1
// WatchDataSenderTests.swift - Tests for WatchDataSender. Refs #649
import XCTest
@testable import FinanceApp

final class WatchDataSenderTests: XCTestCase {
    @MainActor private func makeSender(accounts: [AccountItem] = SampleData.allAccounts, transactions: [TransactionItem] = SampleData.allTransactions, budgets: [BudgetItem] = SampleData.allBudgets, accountError: Error? = nil, transactionError: Error? = nil, budgetError: Error? = nil) -> WatchDataSender {
        let ar = StubAccountRepository(); ar.accountsToReturn = accounts; ar.errorToThrow = accountError
        let tr = StubTransactionRepository(); tr.transactionsToReturn = transactions; tr.errorToThrow = transactionError
        let br = StubBudgetRepository(); br.budgetsToReturn = budgets; br.errorToThrow = budgetError
        return WatchDataSender(accountRepository: ar, transactionRepository: tr, budgetRepository: br, activateSession: false)
    }
    @MainActor func testPackageDataIncludesBalance() {
        let r = WatchDataSender.packageData(balance: 64_750_00, currencyCode: "USD", transactions: [], budgets: [])
        XCTAssertEqual(WatchDataSender.parseInt64(r["balance"]), 64_750_00)
    }
    @MainActor func testPackageDataIncludesCurrencyCode() {
        XCTAssertEqual(WatchDataSender.packageData(balance: 0, currencyCode: "EUR", transactions: [], budgets: [])["currencyCode"] as? String, "EUR")
    }
    @MainActor func testPackageDataIncludesTimestamp() {
        let before = Date().timeIntervalSince1970
        let r = WatchDataSender.packageData(balance: 0, currencyCode: "USD", transactions: [], budgets: [])
        XCTAssertNotNil(r["lastUpdated"] as? TimeInterval)
        if let ts = r["lastUpdated"] as? TimeInterval { XCTAssertGreaterThanOrEqual(ts, before) }
    }
    @MainActor func testPackageDataSerializesTransactions() {
        let tx = SampleData.expenseTransaction
        let arr = WatchDataSender.packageData(balance: 0, currencyCode: "USD", transactions: [tx], budgets: [])["transactions"] as? [[String: Any]]
        XCTAssertEqual(arr?.count, 1)
        if let f = arr?.first { XCTAssertEqual(f["id"] as? String, tx.id); XCTAssertEqual(WatchDataSender.parseInt64(f["amountMinorUnits"]), tx.amountMinorUnits) }
    }
    @MainActor func testPackageDataSerializesBudgets() {
        let b = SampleData.groceriesBudget
        let arr = WatchDataSender.packageData(balance: 0, currencyCode: "USD", transactions: [], budgets: [b])["budgets"] as? [[String: Any]]
        XCTAssertEqual(arr?.count, 1)
        if let f = arr?.first { XCTAssertEqual(WatchDataSender.parseInt64(f["spentMinorUnits"]), b.spentMinorUnits); XCTAssertEqual(WatchDataSender.parseInt64(f["budgetedMinorUnits"]), b.limitMinorUnits) }
    }
    @MainActor func testFetchPayloadComputesBalance() async throws {
        let p = try await makeSender().fetchPayload()
        XCTAssertEqual(WatchDataSender.parseInt64(p["balance"]), 12_450_00 + 25_000_00 + (-1_200_00) + 18_500_00 + 10_000_00)
    }
    @MainActor func testFetchPayloadDefaultsUSD() async throws {
        XCTAssertEqual(try await makeSender(accounts: []).fetchPayload()["currencyCode"] as? String, "USD")
    }
    @MainActor func testFetchPayloadLimitsTransactions() async throws {
        var m: [TransactionItem] = []; for i in 0..<8 { m.append(TransactionItem(id: "t\(i)", payee: "P", category: "G", amountMinorUnits: -100, currencyCode: "USD", date: Date(timeIntervalSince1970: Double(1_700_000_000 + i*86400)), type: .expense, status: .cleared)) }
        XCTAssertEqual((try await makeSender(transactions: m).fetchPayload()["transactions"] as? [[String: Any]])?.count, 5)
    }
    @MainActor func testFetchPayloadLimitsBudgets() async throws {
        XCTAssertEqual((try await makeSender(budgets: SampleData.allBudgets).fetchPayload()["budgets"] as? [[String: Any]])?.count, 3)
    }
    @MainActor func testFetchPayloadThrowsOnError() async {
        do { _ = try await makeSender(accountError: TestError.simulated).fetchPayload(); XCTFail("Should throw") } catch { XCTAssertTrue(error is TestError) }
    }
    @MainActor func testParseInt64() { XCTAssertEqual(WatchDataSender.parseInt64(42 as Int), 42); XCTAssertNil(WatchDataSender.parseInt64(42.5)); XCTAssertNil(WatchDataSender.parseInt64(nil)) }
    @MainActor func testNegativeBalance() async throws {
        let cc = AccountItem(id: "cc", name: "C", balanceMinorUnits: -500_00, currencyCode: "USD", type: .creditCard, icon: "creditcard", isArchived: false)
        XCTAssertEqual(WatchDataSender.parseInt64(try await makeSender(accounts: [cc], transactions: [], budgets: []).fetchPayload()["balance"]), -500_00)
    }
    @MainActor func testExpenseFlag() {
        let txs = WatchDataSender.packageData(balance: 0, currencyCode: "USD", transactions: [SampleData.expenseTransaction, SampleData.incomeTransaction], budgets: [])["transactions"] as? [[String: Any]]
        XCTAssertEqual(txs?.first { ($0["id"] as? String) == SampleData.expenseTransaction.id }?["isExpense"] as? Bool, true)
        XCTAssertEqual(txs?.first { ($0["id"] as? String) == SampleData.incomeTransaction.id }?["isExpense"] as? Bool, false)
    }
}

