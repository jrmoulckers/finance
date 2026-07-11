// SPDX-License-Identifier: BUSL-1.1

// QuickExpenseComposerTests.swift
// FinanceTests
//
// Tests for one-thumb quick expense composition and remembered defaults (#2167).

import XCTest
@testable import FinanceApp

final class QuickExpenseComposerTests: XCTestCase {

    private var defaults: UserDefaults!
    private let suiteName = "QuickExpenseComposerTests.suite"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    func testPresetsAreNonEmptyWithUniqueIds() {
        let presets = QuickExpenseComposer.presets
        XCTAssertFalse(presets.isEmpty)
        XCTAssertEqual(Set(presets.map(\.id)).count, presets.count)
        for preset in presets {
            XCTAssertFalse(preset.label.isEmpty)
            XCTAssertFalse(preset.categoryId.isEmpty)
            XCTAssertFalse(preset.systemImage.isEmpty)
        }
    }

    func testMakeTransactionStoresNegativeExpenseAmount() {
        let txn = QuickExpenseComposer.makeTransaction(
            amountMinorUnits: 12_50,
            payee: "Blue Bottle",
            categoryName: "Dining Out",
            accountName: "Main Checking",
            currencyCode: "USD"
        )
        XCTAssertEqual(txn.amountMinorUnits, -12_50)
        XCTAssertEqual(txn.type, .expense)
        XCTAssertEqual(txn.payee, "Blue Bottle")
        XCTAssertEqual(txn.category, "Dining Out")
        XCTAssertEqual(txn.accountName, "Main Checking")
    }

    func testMakeTransactionNegativeInputStillStoredNegative() {
        let txn = QuickExpenseComposer.makeTransaction(
            amountMinorUnits: -500,
            payee: "x",
            categoryName: "c",
            accountName: "a",
            currencyCode: "USD"
        )
        XCTAssertEqual(txn.amountMinorUnits, -500)
    }

    func testMakeTransactionEmptyPayeeFallsBack() {
        let txn = QuickExpenseComposer.makeTransaction(
            amountMinorUnits: 300,
            payee: "   ",
            categoryName: "Cash",
            accountName: "Wallet",
            currencyCode: "USD"
        )
        XCTAssertFalse(txn.payee.isEmpty)
    }

    func testRememberedAccountRoundTrips() {
        XCTAssertNil(QuickExpenseComposer.lastAccountId(defaults: defaults))
        QuickExpenseComposer.setLastAccountId("a1", defaults: defaults)
        XCTAssertEqual(QuickExpenseComposer.lastAccountId(defaults: defaults), "a1")
        QuickExpenseComposer.setLastAccountId(nil, defaults: defaults)
        XCTAssertNil(QuickExpenseComposer.lastAccountId(defaults: defaults))
    }

    func testRememberedCategoryRoundTrips() {
        QuickExpenseComposer.setLastCategoryId("c2", defaults: defaults)
        XCTAssertEqual(QuickExpenseComposer.lastCategoryId(defaults: defaults), "c2")
        QuickExpenseComposer.setLastCategoryId("", defaults: defaults)
        XCTAssertNil(QuickExpenseComposer.lastCategoryId(defaults: defaults))
    }
}
