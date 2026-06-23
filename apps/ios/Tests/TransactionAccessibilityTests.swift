// SPDX-License-Identifier: BUSL-1.1

// TransactionAccessibilityTests.swift
// FinanceTests
// References: #2117
//
// Deterministic unit tests for the shared transaction-row VoiceOver label
// builder. These cover amount signs/direction, every status, recurring rows,
// tag inclusion, and missing-field handling. They assert on the *assembly*
// logic using pre-formatted fragments so results are locale-independent.

import XCTest
@testable import FinanceApp
@testable import FinanceShared

final class TransactionAccessibilityTests: XCTestCase {

    typealias TA = TransactionAccessibility

    // MARK: - Direction is conveyed in text (never colour)

    func testExpenseDirectionIsSpokenInWords() {
        let desc = TA.amountDescription(direction: .expense, formattedAmount: "$42.99")
        XCTAssertTrue(desc.contains("Expense"),
                      "Expense direction must be conveyed in text, not colour")
        XCTAssertTrue(desc.contains("$42.99"))
    }

    func testIncomeDirectionIsSpokenInWords() {
        let desc = TA.amountDescription(direction: .income, formattedAmount: "$1,250.00")
        XCTAssertTrue(desc.contains("Income"),
                      "Income direction must be conveyed in text, not colour")
        XCTAssertTrue(desc.contains("$1,250.00"))
    }

    func testTransferDirectionIsSpokenInWords() {
        let desc = TA.amountDescription(direction: .transfer, formattedAmount: "$500.00")
        XCTAssertTrue(desc.contains("Transfer"))
        XCTAssertTrue(desc.contains("$500.00"))
    }

    func testNoneDirectionAnnouncesPlainAmount() {
        let desc = TA.amountDescription(direction: .none, formattedAmount: "$10.00")
        XCTAssertEqual(desc, "$10.00",
                       "Unknown direction should announce the amount with no prefix")
    }

    // MARK: - Full label assembly

    func testFullRowLabelOrderingAndContent() {
        let components = TA.RowComponents(
            amountDescription: "Expense of $42.99",
            payee: "Blue Bottle Coffee",
            category: "Dining",
            accountName: "Checking",
            date: "Jun 23, 2026",
            statusDescription: "Pending",
            isRecurring: false,
            tagNames: ["coffee", "work"]
        )
        let label = TA.rowLabel(components)

        XCTAssertEqual(
            label,
            "Expense of $42.99, Blue Bottle Coffee, Dining, Checking, Jun 23, 2026, Pending, Tags: coffee, work"
        )
        // Amount/direction is announced first.
        XCTAssertTrue(label.hasPrefix("Expense of $42.99"))
    }

    func testRecurringIsAnnounced() {
        let components = TA.RowComponents(
            amountDescription: "Expense of $9.99",
            payee: "Streaming",
            category: "Entertainment",
            isRecurring: true
        )
        let label = TA.rowLabel(components)
        XCTAssertTrue(label.contains("Recurring"),
                      "Recurring transactions must announce their recurring state")
    }

    // MARK: - Status coverage

    func testEachStatusMapsToExpectedText() {
        XCTAssertEqual(TransactionStatusUI.cleared.accessibilityStatusDescription, "",
                       "Cleared is the normal state and should be omitted from the label")
        XCTAssertEqual(TransactionStatusUI.pending.accessibilityStatusDescription,
                       TransactionStatusUI.pending.displayName)
        XCTAssertEqual(TransactionStatusUI.reconciled.accessibilityStatusDescription,
                       TransactionStatusUI.reconciled.displayName)
        XCTAssertEqual(TransactionStatusUI.voided.accessibilityStatusDescription,
                       TransactionStatusUI.voided.displayName)
    }

    func testClearedStatusIsNotInLabel() {
        let components = TA.RowComponents(
            amountDescription: "Income of $100.00",
            payee: "Payroll",
            category: "Salary",
            statusDescription: TransactionStatusUI.cleared.accessibilityStatusDescription
        )
        let label = TA.rowLabel(components)
        XCTAssertEqual(label, "Income of $100.00, Payroll, Salary")
        XCTAssertFalse(label.contains("Cleared"))
    }

    // MARK: - Missing fields are handled gracefully

    func testMissingFieldsAreOmittedWithoutDanglingSeparators() {
        let components = TA.RowComponents(
            amountDescription: "Expense of $5.00",
            payee: "",
            category: "Misc",
            accountName: "",
            date: "",
            statusDescription: "",
            isRecurring: false,
            tagNames: []
        )
        let label = TA.rowLabel(components)
        XCTAssertEqual(label, "Expense of $5.00, Misc")
        XCTAssertFalse(label.contains(", ,"), "No dangling separators for empty fields")
        XCTAssertFalse(label.hasSuffix(", "))
    }

    func testWhitespaceOnlyFieldsAreTreatedAsMissing() {
        let components = TA.RowComponents(
            amountDescription: "Expense of $5.00",
            payee: "   ",
            category: "Misc",
            tagNames: [" ", "valid"]
        )
        let label = TA.rowLabel(components)
        XCTAssertEqual(label, "Expense of $5.00, Misc, Tags: valid")
    }

    func testEmptyTagsProduceNoTagsSegment() {
        let components = TA.RowComponents(
            amountDescription: "Expense of $5.00",
            payee: "Store",
            category: "Shopping",
            tagNames: []
        )
        let label = TA.rowLabel(components)
        XCTAssertFalse(label.contains("Tags:"))
    }

    // MARK: - TransactionItem bridge

    func testTransactionItemBuildsCompleteLabel() {
        let item = TransactionItem(
            id: "t1",
            payee: "Grocery Mart",
            category: "Groceries",
            accountName: "Checking",
            amountMinorUnits: 5_499,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_750_000_000),
            type: .expense,
            status: .pending,
            isRecurring: true
        )
        let label = item.accessibilityRowLabel()

        XCTAssertTrue(label.contains("Expense of"),
                      "Direction must be spoken in words")
        XCTAssertTrue(label.contains("Grocery Mart"))
        XCTAssertTrue(label.contains("Groceries"))
        XCTAssertTrue(label.contains("Checking"))
        XCTAssertTrue(label.contains("Pending"))
        XCTAssertTrue(label.contains("Recurring"))
    }

    func testDashboardVariantOmitsAccount() {
        let item = TransactionItem(
            id: "t2",
            payee: "Cafe",
            category: "Dining",
            accountName: "Savings",
            amountMinorUnits: 1_200,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_750_000_000),
            type: .expense,
            status: .cleared
        )
        let label = item.accessibilityRowLabel(includeAccount: false)
        XCTAssertFalse(label.contains("Savings"),
                       "Dashboard rows do not show the account and must not announce it")
        XCTAssertTrue(label.contains("Cafe"))
    }

    func testIncomeTransactionAnnouncesIncomeDirection() {
        let item = TransactionItem(
            id: "t3",
            payee: "Payroll",
            category: "Salary",
            accountName: "Checking",
            amountMinorUnits: 250_000,
            currencyCode: "USD",
            date: Date(timeIntervalSince1970: 1_750_000_000),
            type: .income,
            status: .cleared
        )
        let label = item.accessibilityRowLabel()
        XCTAssertTrue(label.contains("Income of"))
        XCTAssertFalse(label.contains("Cleared"))
    }

    // MARK: - Currency formatting helper

    func testFormattedAmountDecimalPlaces() {
        XCTAssertEqual(TA.decimalPlaces(for: "USD"), 2)
        XCTAssertEqual(TA.decimalPlaces(for: "JPY"), 0)
        XCTAssertEqual(TA.decimalPlaces(for: "BHD"), 3)
    }

    func testFormattedAmountProducesNonEmptyString() {
        let formatted = TA.formattedAmount(amountMinorUnits: 125_050, currencyCode: "USD")
        XCTAssertFalse(formatted.isEmpty)
    }
}
