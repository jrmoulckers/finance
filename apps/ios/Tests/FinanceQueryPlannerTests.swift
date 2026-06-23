// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryPlannerTests.swift
// FinanceTests
//
// Tests for ``FinanceQueryPlanner`` execution over an in-memory local store
// (#2386). All amounts are asserted in minor units to avoid locale-dependent
// currency-formatting flakiness.

import XCTest
@testable import FinanceApp

final class FinanceQueryPlannerTests: XCTestCase {

    // MARK: - Fixtures

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private func makeTransactions() -> [TransactionItem] {
        [
            TransactionItem(
                id: "1", payee: "Whole Foods", category: "Groceries",
                accountName: "Main Checking", amountMinorUnits: -50_00,
                currencyCode: "USD", date: date(2024, 6, 10), type: .expense
            ),
            TransactionItem(
                id: "2", payee: "Trader Joe's", category: "Groceries",
                accountName: "Main Checking", amountMinorUnits: -30_00,
                currencyCode: "USD", date: date(2024, 6, 12), type: .expense
            ),
            TransactionItem(
                id: "3", payee: "Netflix", category: "Entertainment",
                accountName: "Travel Card", amountMinorUnits: -15_00,
                currencyCode: "USD", date: date(2024, 6, 5), type: .expense
            ),
            // Outside June — should be excluded from "this month".
            TransactionItem(
                id: "4", payee: "Whole Foods", category: "Groceries",
                accountName: "Main Checking", amountMinorUnits: -99_00,
                currencyCode: "USD", date: date(2024, 5, 20), type: .expense
            ),
            // Income — should never count toward spend.
            TransactionItem(
                id: "5", payee: "Payroll", category: "Income",
                accountName: "Main Checking", amountMinorUnits: 4_000_00,
                currencyCode: "USD", date: date(2024, 6, 1), type: .income
            ),
        ]
    }

    private func makeAccounts() -> [AccountItem] {
        [
            AccountItem(id: "a1", name: "Main Checking", balanceMinorUnits: 1_200_00,
                        currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false),
            AccountItem(id: "a2", name: "Savings", balanceMinorUnits: 5_000_00,
                        currencyCode: "USD", type: .savings, icon: "banknote", isArchived: false),
        ]
    }

    private func juneRange() -> FinanceQueryDateRange {
        let interval = calendar.dateInterval(of: .month, for: date(2024, 6, 15))!
        return FinanceQueryDateRange(start: interval.start, end: interval.end, label: "this month")
    }

    // MARK: - Spend by Category

    func testSpendByCategoryWithDateRange() {
        let plan = FinanceQueryPlan(
            kind: .spend(.category("Groceries")),
            dateRange: juneRange(),
            rawInput: "groceries this month"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: makeTransactions(), accounts: [])

        // 50 + 30 (June groceries); the May 99 is excluded.
        XCTAssertEqual(result.amountMinorUnits, 80_00)
        XCTAssertEqual(result.matchCount, 2)
        XCTAssertFalse(result.requiresSpokenConfirmation)
        XCTAssertFalse(result.typedSummary.isEmpty)
        XCTAssertFalse(result.spokenSummary.isEmpty)
    }

    func testSpendByCategoryAllTime() {
        let plan = FinanceQueryPlan(
            kind: .spend(.category("Groceries")),
            dateRange: nil,
            rawInput: "groceries"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: makeTransactions(), accounts: [])

        // 50 + 30 + 99 across all time.
        XCTAssertEqual(result.amountMinorUnits, 179_00)
        XCTAssertEqual(result.matchCount, 3)
    }

    // MARK: - Spend by Merchant

    func testSpendByMerchant() {
        let plan = FinanceQueryPlan(
            kind: .spend(.merchant("Netflix")),
            dateRange: nil,
            rawInput: "at netflix"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: makeTransactions(), accounts: [])
        XCTAssertEqual(result.amountMinorUnits, 15_00)
        XCTAssertEqual(result.matchCount, 1)
    }

    // MARK: - Spend by Account

    func testSpendByAccount() {
        let plan = FinanceQueryPlan(
            kind: .spend(.account("Main Checking")),
            dateRange: juneRange(),
            rawInput: "main checking this month"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: makeTransactions(), accounts: [])
        // June expenses on Main Checking: 50 + 30 (income excluded).
        XCTAssertEqual(result.amountMinorUnits, 80_00)
        XCTAssertEqual(result.matchCount, 2)
    }

    // MARK: - Date-Range Total

    func testTotalSpendForDateRange() {
        let plan = FinanceQueryPlan(
            kind: .spend(.all),
            dateRange: juneRange(),
            rawInput: "last month"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: makeTransactions(), accounts: [])
        // All June expenses: 50 + 30 + 15.
        XCTAssertEqual(result.amountMinorUnits, 95_00)
        XCTAssertEqual(result.matchCount, 3)
    }

    // MARK: - No Matches

    func testNoMatchesProducesZeroResult() {
        let plan = FinanceQueryPlan(
            kind: .spend(.category("Transport")),
            dateRange: nil,
            rawInput: "transport"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: makeTransactions(), accounts: [])
        XCTAssertEqual(result.amountMinorUnits, 0)
        XCTAssertEqual(result.matchCount, 0)
        XCTAssertFalse(result.typedSummary.isEmpty)
    }

    // MARK: - Balance (sensitive)

    func testTotalBalanceIsSensitive() {
        let plan = FinanceQueryPlan(
            kind: .balance(account: nil),
            dateRange: nil,
            rawInput: "balance"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: [], accounts: makeAccounts())
        XCTAssertEqual(result.amountMinorUnits, 6_200_00)
        XCTAssertEqual(result.matchCount, 2)
        XCTAssertTrue(result.requiresSpokenConfirmation)
    }

    func testSpecificAccountBalance() {
        let plan = FinanceQueryPlan(
            kind: .balance(account: "Savings"),
            dateRange: nil,
            rawInput: "savings balance"
        )
        let result = FinanceQueryPlanner(calendar: calendar)
            .execute(plan, transactions: [], accounts: makeAccounts())
        XCTAssertEqual(result.amountMinorUnits, 5_000_00)
        XCTAssertEqual(result.matchCount, 1)
        XCTAssertTrue(result.requiresSpokenConfirmation)
    }
}
