// SPDX-License-Identifier: BUSL-1.1

// FinanceQueryIntentTests.swift
// FinanceTests
//
// Tests for the pure dialog builder behind ``FinanceQueryIntent`` (#2386).
// Verifies, in particular, that Siri never speaks a balance figure aloud —
// sensitive balances are redirected to the in-app, confirmation-gated flow.

import XCTest
@testable import FinanceApp

final class FinanceQueryIntentTests: XCTestCase {

    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private static let referenceDate: Date = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: 2024, month: 6, day: 15, hour: 12))!
    }()

    private func transactions() -> [TransactionItem] {
        [
            TransactionItem(
                id: "1", payee: "Netflix", category: "Entertainment",
                accountName: "Travel Card", amountMinorUnits: -15_00,
                currencyCode: "USD", date: Self.referenceDate, type: .expense
            ),
        ]
    }

    private func accounts() -> [AccountItem] {
        [
            AccountItem(id: "a1", name: "Main Checking", balanceMinorUnits: 9_999_00,
                        currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false),
        ]
    }

    private func categories() -> [CategoryItem] {
        [
            CategoryItem(id: "c1", name: "Groceries", colorHex: "#38A169", icon: "cart"),
            CategoryItem(id: "c2", name: "Dining Out", colorHex: "#DD6B20", icon: "fork.knife"),
            CategoryItem(id: "c3", name: "Entertainment", colorHex: "#805AD5", icon: "film"),
        ]
    }

    private func dialog(for query: String) -> String {
        FinanceQueryIntent.dialogText(
            for: query,
            transactions: transactions(),
            accounts: accounts(),
            categories: categories(),
            calendar: calendar,
            referenceDate: Self.referenceDate
        )
    }

    func testBalanceNeverSpokenAloudViaSiri() {
        let dialog = dialog(for: "What's my balance")
        XCTAssertFalse(dialog.contains("9,999"), "Siri must not speak the balance figure")
        XCTAssertFalse(dialog.contains("9999"))
        XCTAssertTrue(dialog.localizedCaseInsensitiveContains("privacy"))
    }

    func testSpendQueryReturnsSpokenSummary() {
        let dialog = dialog(for: "How much did I spend at Netflix")
        XCTAssertTrue(dialog.localizedCaseInsensitiveContains("spent"))
    }

    func testAmbiguousCategoryReturnsPrompt() {
        let dialog = dialog(for: "How much did I spend on food this week")
        XCTAssertTrue(dialog.localizedCaseInsensitiveContains("did you mean"))
    }

    func testUnrecognizedQueryReturnsFallback() {
        let dialog = dialog(for: "What's the weather")
        XCTAssertTrue(dialog.localizedCaseInsensitiveContains("spending"))
    }
}
