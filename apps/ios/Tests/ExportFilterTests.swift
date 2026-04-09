// SPDX-License-Identifier: BUSL-1.1

// ExportFilterTests.swift
// FinanceTests
//
// Unit tests for ExportFilter — date range filtering, account selection
// filtering, combined filters, edge cases, and summary generation.
// Refs #680

import XCTest
@testable import FinanceApp

final class ExportFilterTests: XCTestCase {

    // MARK: - Test Data

    /// Fixed reference date: 2024-01-15 12:00:00 UTC
    private let referenceDate = Date(timeIntervalSince1970: 1_705_315_200)

    private lazy var jan1 = calendar.date(
        from: DateComponents(year: 2024, month: 1, day: 1)
    )!
    private lazy var jan10 = calendar.date(
        from: DateComponents(year: 2024, month: 1, day: 10)
    )!
    private lazy var jan15 = calendar.date(
        from: DateComponents(year: 2024, month: 1, day: 15)
    )!
    private lazy var jan20 = calendar.date(
        from: DateComponents(year: 2024, month: 1, day: 20)
    )!
    private lazy var jan31 = calendar.date(
        from: DateComponents(year: 2024, month: 1, day: 31)
    )!
    private lazy var feb15 = calendar.date(
        from: DateComponents(year: 2024, month: 2, day: 15)
    )!

    private let calendar = Calendar.current

    private let checkingAccount = AccountItem(
        id: "acc-1", name: "Main Checking",
        balanceMinorUnits: 10_000_00, currencyCode: "USD",
        type: .checking, icon: "building.columns", isArchived: false
    )

    private let savingsAccount = AccountItem(
        id: "acc-2", name: "Savings",
        balanceMinorUnits: 25_000_00, currencyCode: "USD",
        type: .savings, icon: "banknote", isArchived: false
    )

    private let creditAccount = AccountItem(
        id: "acc-3", name: "Travel Card",
        balanceMinorUnits: -1_200_00, currencyCode: "USD",
        type: .creditCard, icon: "creditcard", isArchived: false
    )

    private var allAccounts: [AccountItem] {
        [checkingAccount, savingsAccount, creditAccount]
    }

    private lazy var transactionJan5Checking = TransactionItem(
        id: "t1", payee: "Grocery Store",
        category: "Groceries", accountName: "Main Checking",
        amountMinorUnits: -50_00, currencyCode: "USD",
        date: calendar.date(
            from: DateComponents(year: 2024, month: 1, day: 5, hour: 10)
        )!,
        type: .expense, status: .cleared
    )

    private lazy var transactionJan10Savings = TransactionItem(
        id: "t2", payee: "Interest Payment",
        category: "Income", accountName: "Savings",
        amountMinorUnits: 25_00, currencyCode: "USD",
        date: calendar.date(
            from: DateComponents(year: 2024, month: 1, day: 10, hour: 9)
        )!,
        type: .income, status: .cleared
    )

    private lazy var transactionJan15Checking = TransactionItem(
        id: "t3", payee: "Gas Station",
        category: "Transport", accountName: "Main Checking",
        amountMinorUnits: -45_00, currencyCode: "USD",
        date: calendar.date(
            from: DateComponents(year: 2024, month: 1, day: 15, hour: 14)
        )!,
        type: .expense, status: .cleared
    )

    private lazy var transactionJan20Card = TransactionItem(
        id: "t4", payee: "Restaurant",
        category: "Dining", accountName: "Travel Card",
        amountMinorUnits: -85_00, currencyCode: "USD",
        date: calendar.date(
            from: DateComponents(year: 2024, month: 1, day: 20, hour: 19)
        )!,
        type: .expense, status: .pending
    )

    private lazy var transactionFeb1Checking = TransactionItem(
        id: "t5", payee: "Payroll",
        category: "Income", accountName: "Main Checking",
        amountMinorUnits: 3_000_00, currencyCode: "USD",
        date: calendar.date(
            from: DateComponents(year: 2024, month: 2, day: 1, hour: 8)
        )!,
        type: .income, status: .cleared
    )

    private var allTransactions: [TransactionItem] {
        [
            transactionJan5Checking,
            transactionJan10Savings,
            transactionJan15Checking,
            transactionJan20Card,
            transactionFeb1Checking,
        ]
    }

    // MARK: - No Filters (Pass-Through)

    func testNoFiltersReturnsAllTransactions() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: nil,
            endDate: nil,
            selectedAccountIDs: []
        )

        XCTAssertEqual(
            result.count, allTransactions.count,
            "With no filters, all transactions should be returned"
        )
    }

    func testEmptyAccountSelectionReturnsAll() {
        let result = ExportFilter.filterAccounts(
            allAccounts,
            selectedIDs: []
        )

        XCTAssertEqual(
            result.count, allAccounts.count,
            "Empty selection set should return all accounts"
        )
    }

    // MARK: - Date Range Filtering

    func testStartDateFilterExcludesEarlierTransactions() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: jan10,
            endDate: nil,
            selectedAccountIDs: []
        )

        // Jan 5 should be excluded; Jan 10, 15, 20, Feb 1 remain
        XCTAssertEqual(result.count, 4, "Should exclude transactions before start date")
        XCTAssertFalse(
            result.contains { $0.id == "t1" },
            "Transaction on Jan 5 should be excluded"
        )
    }

    func testEndDateFilterExcludesLaterTransactions() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: nil,
            endDate: jan20,
            selectedAccountIDs: []
        )

        // Jan 5, 10, 15, 20 included; Feb 1 excluded
        XCTAssertEqual(result.count, 4, "Should exclude transactions after end date")
        XCTAssertFalse(
            result.contains { $0.id == "t5" },
            "Transaction on Feb 1 should be excluded"
        )
    }

    func testDateRangeFilterIncludesBoundaryDates() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: jan10,
            endDate: jan20,
            selectedAccountIDs: []
        )

        // Jan 10, 15, 20 should be included (inclusive boundaries)
        XCTAssertEqual(
            result.count, 3,
            "Boundary dates should be inclusive"
        )
        XCTAssertTrue(
            result.contains { $0.id == "t2" },
            "Transaction exactly on start date should be included"
        )
        XCTAssertTrue(
            result.contains { $0.id == "t4" },
            "Transaction exactly on end date should be included"
        )
    }

    func testDateRangeFilterSingleDay() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: jan15,
            endDate: jan15,
            selectedAccountIDs: []
        )

        XCTAssertEqual(
            result.count, 1,
            "Single-day range should include only that day's transactions"
        )
        XCTAssertEqual(
            result.first?.id, "t3",
            "Should include the Jan 15 transaction"
        )
    }

    func testDateRangeFilterExcludesAll() {
        let narrowStart = calendar.date(
            from: DateComponents(year: 2023, month: 6, day: 1)
        )!
        let narrowEnd = calendar.date(
            from: DateComponents(year: 2023, month: 6, day: 30)
        )!

        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: narrowStart,
            endDate: narrowEnd,
            selectedAccountIDs: []
        )

        XCTAssertTrue(
            result.isEmpty,
            "Date range with no matching transactions should return empty"
        )
    }

    // MARK: - Account Filtering

    func testSingleAccountSelection() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: nil,
            endDate: nil,
            selectedAccountIDs: ["acc-1"]
        )

        // t1 (Jan 5 Checking), t3 (Jan 15 Checking), t5 (Feb 1 Checking)
        XCTAssertEqual(
            result.count, 3,
            "Should only include transactions from Main Checking"
        )
        XCTAssertTrue(
            result.allSatisfy { $0.accountName == "Main Checking" },
            "All results should belong to Main Checking"
        )
    }

    func testMultipleAccountSelection() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: nil,
            endDate: nil,
            selectedAccountIDs: ["acc-1", "acc-3"]
        )

        // Checking: t1, t3, t5; Travel Card: t4 — total 4
        XCTAssertEqual(result.count, 4, "Should include transactions from both selected accounts")
        XCTAssertFalse(
            result.contains { $0.accountName == "Savings" },
            "Savings transactions should be excluded"
        )
    }

    func testAllAccountsSelectedEquivalentToNoFilter() {
        let allIDs: Set<String> = ["acc-1", "acc-2", "acc-3"]

        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: nil,
            endDate: nil,
            selectedAccountIDs: allIDs
        )

        XCTAssertEqual(
            result.count, allTransactions.count,
            "Selecting all accounts should return all transactions"
        )
    }

    func testAccountFilterWithNonexistentID() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: nil,
            endDate: nil,
            selectedAccountIDs: ["nonexistent-id"]
        )

        XCTAssertTrue(
            result.isEmpty,
            "Non-existent account ID should match no transactions"
        )
    }

    func testFilterAccountsBySelectedIDs() {
        let result = ExportFilter.filterAccounts(
            allAccounts,
            selectedIDs: ["acc-1", "acc-3"]
        )

        XCTAssertEqual(result.count, 2)
        XCTAssertTrue(result.contains { $0.id == "acc-1" })
        XCTAssertTrue(result.contains { $0.id == "acc-3" })
        XCTAssertFalse(result.contains { $0.id == "acc-2" })
    }

    // MARK: - Combined Filters

    func testDateRangeAndAccountFilter() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: jan10,
            endDate: jan31,
            selectedAccountIDs: ["acc-1"]
        )

        // Date range Jan 10–31 from Checking: t3 (Jan 15)
        XCTAssertEqual(
            result.count, 1,
            "Should apply both date and account filters"
        )
        XCTAssertEqual(result.first?.id, "t3")
    }

    func testDateRangeAndMultipleAccountFilter() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: jan1,
            endDate: jan15,
            selectedAccountIDs: ["acc-1", "acc-2"]
        )

        // Date Jan 1-15 from Checking+Savings: t1 (Jan 5 Checking),
        // t2 (Jan 10 Savings), t3 (Jan 15 Checking)
        XCTAssertEqual(result.count, 3)
    }

    func testCombinedFiltersResultingInEmpty() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: jan20,
            endDate: jan31,
            selectedAccountIDs: ["acc-2"]
        )

        // No Savings transactions between Jan 20-31
        XCTAssertTrue(
            result.isEmpty,
            "Combined filters with no matching data should return empty"
        )
    }

    // MARK: - Edge Cases

    func testEmptyTransactionList() {
        let result = ExportFilter.filterTransactions(
            [],
            accounts: allAccounts,
            startDate: jan1,
            endDate: jan31,
            selectedAccountIDs: ["acc-1"]
        )

        XCTAssertTrue(result.isEmpty, "Empty input should produce empty output")
    }

    func testEmptyAccountList() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: [],
            startDate: nil,
            endDate: nil,
            selectedAccountIDs: ["acc-1"]
        )

        // No accounts to resolve IDs → no names match → all filtered out
        XCTAssertTrue(
            result.isEmpty,
            "Non-empty account selection with empty account list should filter all"
        )
    }

    func testEmptyAccountListWithNoSelection() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: [],
            startDate: nil,
            endDate: nil,
            selectedAccountIDs: []
        )

        XCTAssertEqual(
            result.count, allTransactions.count,
            "Empty account selection with empty account list should pass all through"
        )
    }

    func testFilterAccountsWithEmptyList() {
        let result = ExportFilter.filterAccounts([], selectedIDs: ["acc-1"])
        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - Date Boundary Precision

    func testTransactionAtMidnightStartOfDay() {
        let midnightTransaction = TransactionItem(
            id: "t-midnight", payee: "Midnight Purchase",
            category: "Shopping", accountName: "Main Checking",
            amountMinorUnits: -10_00, currencyCode: "USD",
            date: calendar.date(
                from: DateComponents(year: 2024, month: 1, day: 15, hour: 0, minute: 0, second: 0)
            )!,
            type: .expense, status: .cleared
        )

        let result = ExportFilter.filterTransactions(
            [midnightTransaction],
            accounts: allAccounts,
            startDate: jan15,
            endDate: jan15,
            selectedAccountIDs: []
        )

        XCTAssertEqual(
            result.count, 1,
            "Transaction at midnight of the start date should be included"
        )
    }

    func testTransactionAtEndOfDay() {
        let lateTransaction = TransactionItem(
            id: "t-late", payee: "Late Night Purchase",
            category: "Shopping", accountName: "Main Checking",
            amountMinorUnits: -10_00, currencyCode: "USD",
            date: calendar.date(
                from: DateComponents(year: 2024, month: 1, day: 15, hour: 23, minute: 59, second: 59)
            )!,
            type: .expense, status: .cleared
        )

        let result = ExportFilter.filterTransactions(
            [lateTransaction],
            accounts: allAccounts,
            startDate: jan15,
            endDate: jan15,
            selectedAccountIDs: []
        )

        XCTAssertEqual(
            result.count, 1,
            "Transaction at 23:59:59 of the end date should be included"
        )
    }

    // MARK: - Filter Summary

    func testFilterSummaryAllDefaults() {
        let summary = ExportFilter.filterSummary(
            dateFilterEnabled: false,
            startDate: jan1,
            endDate: jan31,
            selectedAccountCount: 0,
            totalAccountCount: 3,
            format: .csv
        )

        XCTAssertTrue(
            summary.contains("CSV"),
            "Summary should mention the format"
        )
        XCTAssertTrue(
            summary.contains("All time"),
            "Summary should indicate no date filter"
        )
        XCTAssertTrue(
            summary.contains("All"),
            "Summary should indicate all accounts"
        )
    }

    func testFilterSummaryWithDateRange() {
        let summary = ExportFilter.filterSummary(
            dateFilterEnabled: true,
            startDate: jan1,
            endDate: jan31,
            selectedAccountCount: 0,
            totalAccountCount: 3,
            format: .json
        )

        XCTAssertTrue(
            summary.contains("JSON"),
            "Summary should mention JSON format"
        )
        XCTAssertTrue(
            summary.contains("Date range"),
            "Summary should mention date range when enabled"
        )
    }

    func testFilterSummaryWithPartialAccountSelection() {
        let summary = ExportFilter.filterSummary(
            dateFilterEnabled: false,
            startDate: jan1,
            endDate: jan31,
            selectedAccountCount: 2,
            totalAccountCount: 5,
            format: .csv
        )

        XCTAssertTrue(
            summary.contains("2"),
            "Summary should include selected count"
        )
        XCTAssertTrue(
            summary.contains("5"),
            "Summary should include total count"
        )
    }

    func testFilterSummaryWithAllAccountsSelected() {
        let summary = ExportFilter.filterSummary(
            dateFilterEnabled: false,
            startDate: jan1,
            endDate: jan31,
            selectedAccountCount: 3,
            totalAccountCount: 3,
            format: .csv
        )

        // When all are selected, it should show "All" rather than "3 of 3"
        XCTAssertTrue(
            summary.contains("All"),
            "When all accounts are selected, summary should show 'All'"
        )
    }

    // MARK: - Order Preservation

    func testFilterPreservesTransactionOrder() {
        let result = ExportFilter.filterTransactions(
            allTransactions,
            accounts: allAccounts,
            startDate: jan1,
            endDate: feb15,
            selectedAccountIDs: []
        )

        // Verify the original order is preserved
        let resultIDs = result.map(\.id)
        let inputIDs = allTransactions.map(\.id)
        XCTAssertEqual(
            resultIDs, inputIDs,
            "Filter should preserve the original transaction order"
        )
    }

    func testFilterAccountsPreservesOrder() {
        let result = ExportFilter.filterAccounts(
            allAccounts,
            selectedIDs: ["acc-3", "acc-1"]
        )

        // Should match original order: acc-1 before acc-3
        XCTAssertEqual(result[0].id, "acc-1")
        XCTAssertEqual(result[1].id, "acc-3")
    }
}
