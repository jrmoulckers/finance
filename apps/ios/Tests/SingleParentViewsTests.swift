// SPDX-License-Identifier: BUSL-1.1

// SingleParentViewsTests.swift
// FinanceTests
//
// Instantiation + body-render coverage for the single-parent workflow screens
// and unit tests for their persistence stores. Views are exercised via `.body`
// (mirroring IconViewTests) so the new SwiftUI surfaces contribute coverage.
//
// References: #2199, #2196, #2193, #2201, #2190

import FinanceShared
import SwiftUI
import XCTest
@testable import FinanceApp

final class SingleParentViewsTests: XCTestCase {

    // MARK: - Helpers

    private func makeDefaults(_ name: String) -> UserDefaults {
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func sampleBill(id: String, name: String, amount: Int64, daysOut: Int) -> BillItem {
        let due = Calendar.current.date(byAdding: .day, value: daysOut, to: Date()) ?? Date()
        return BillItem(
            id: id,
            name: name,
            payee: name,
            amountMinorUnits: amount,
            currencyCode: "USD",
            frequency: .monthly,
            dueDate: due,
            nextDueDate: due,
            categoryName: "Bills",
            icon: "bolt",
            isAutoPay: false,
            notes: "",
            status: .upcoming,
            reminderDaysBefore: 3,
            createdAt: Date()
        )
    }

    // MARK: - GroceryModeView (#2199)

    @MainActor
    func testGroceryModeViewInstantiatesAndRenders() {
        let defaults = makeDefaults("grocery.view")
        defer { defaults.removePersistentDomain(forName: "grocery.view") }
        let store = GroceryModeStore(defaults: defaults)
        store.clearedCashMinorUnits = 40_000
        store.billsBeforePaydayMinorUnits = 15_000
        let payday = PaydaySettingsStore(defaults: defaults)

        let view = GroceryModeView(store: store, paydayStore: payday)
        _ = view.body
    }

    @MainActor
    func testGroceryModeViewWithPinnedCategory() {
        let defaults = makeDefaults("grocery.pinned")
        defer { defaults.removePersistentDomain(forName: "grocery.pinned") }
        let store = GroceryModeStore(defaults: defaults)
        store.pinnedCategoryName = "Groceries"
        store.pinnedCategoryRemainingMinorUnits = 12_000
        _ = GroceryModeView(store: store, paydayStore: PaydaySettingsStore(defaults: defaults)).body
    }

    func testGroceryMinorUnitsParsing() {
        XCTAssertEqual(GroceryModeView.minorUnits(from: "12.34", currencyCode: "USD"), 1234)
        XCTAssertEqual(GroceryModeView.minorUnits(from: "12,34", currencyCode: "USD"), 1234)
        XCTAssertEqual(GroceryModeView.minorUnits(from: "0", currencyCode: "USD"), 0)
        XCTAssertEqual(GroceryModeView.minorUnits(from: "abc", currencyCode: "USD"), 0)
        XCTAssertEqual(GroceryModeView.minorUnits(from: "1000", currencyCode: "JPY"), 1000)
        XCTAssertFalse(GroceryModeView.currencySymbol("USD").isEmpty)
    }

    // MARK: - BillCalendarView (#2196)

    @MainActor
    func testBillCalendarViewRendersWithBills() {
        let defaults = makeDefaults("billcal.view")
        defer { defaults.removePersistentDomain(forName: "billcal.view") }
        let payday = PaydaySettingsStore(defaults: defaults)
        payday.typicalPaycheckMinorUnits = 200_000

        let bills = [
            sampleBill(id: "b1", name: "Rent", amount: 120_000, daysOut: 3),
            sampleBill(id: "b2", name: "Electric", amount: 8_000, daysOut: 10),
        ]
        _ = BillCalendarView(bills: bills, paydayStore: payday).body
    }

    @MainActor
    func testBillCalendarViewRendersEmpty() {
        let defaults = makeDefaults("billcal.empty")
        defer { defaults.removePersistentDomain(forName: "billcal.empty") }
        _ = BillCalendarView(bills: [], paydayStore: PaydaySettingsStore(defaults: defaults)).body
    }

    // MARK: - ExpectedIncomeView (#2193)

    @MainActor
    func testExpectedIncomeViewRendersWithItems() {
        let defaults = makeDefaults("income.view")
        defer { defaults.removePersistentDomain(forName: "income.view") }
        let store = ExpectedIncomeStore(defaults: defaults)
        store.clearedCashMinorUnits = 25_000
        store.add(ExpectedIncome(
            source: "Child support",
            amountMinorUnits: 60_000,
            expectedDate: Calendar.current.date(byAdding: .day, value: -3, to: Date()) ?? Date(),
            reliability: .unreliable,
            status: .late
        ))
        _ = ExpectedIncomeView(store: store).body
    }

    @MainActor
    func testExpectedIncomeViewRendersEmpty() {
        let defaults = makeDefaults("income.empty")
        defer { defaults.removePersistentDomain(forName: "income.empty") }
        _ = ExpectedIncomeView(store: ExpectedIncomeStore(defaults: defaults)).body
    }

    // MARK: - FamilySetupView (#2201)

    @MainActor
    func testFamilySetupViewRenders() {
        _ = FamilySetupView().body
    }

    // MARK: - Setup sheets (coverage for presented content)

    @MainActor
    func testGrocerySetupSheetRenders() {
        let defaults = makeDefaults("grocery.sheet")
        defer { defaults.removePersistentDomain(forName: "grocery.sheet") }
        let store = GroceryModeStore(defaults: defaults)
        store.clearedCashMinorUnits = 30_000
        store.pinnedCategoryName = "Groceries"
        store.pinnedCategoryRemainingMinorUnits = 5_000
        _ = GroceryModeSetupSheet(store: store, paydayStore: PaydaySettingsStore(defaults: defaults)).body
    }

    @MainActor
    func testPaydaySetupSheetRenders() {
        let defaults = makeDefaults("payday.sheet")
        defer { defaults.removePersistentDomain(forName: "payday.sheet") }
        let payday = PaydaySettingsStore(defaults: defaults)
        payday.typicalPaycheckMinorUnits = 180_000
        _ = PaydaySetupSheet(paydayStore: payday).body
    }

    @MainActor
    func testExpectedIncomeEditorSheetRenders() {
        let defaults = makeDefaults("income.sheet")
        defer { defaults.removePersistentDomain(forName: "income.sheet") }
        let store = ExpectedIncomeStore(defaults: defaults)
        // New-income editor.
        _ = ExpectedIncomeEditorSheet(store: store, existing: nil, referenceDate: Date()).body
        // Edit-existing editor (drives the delete section + load path).
        let income = ExpectedIncome(
            source: "Child support",
            amountMinorUnits: 50_000,
            expectedDate: Date(),
            reliability: .unreliable,
            status: .partial
        )
        store.add(income)
        _ = ExpectedIncomeEditorSheet(store: store, existing: income, referenceDate: Date()).body
    }

    // MARK: - GroceryModeStore

    func testGroceryModeStoreSafeToSpend() {
        let defaults = makeDefaults("grocery.store")
        defer { defaults.removePersistentDomain(forName: "grocery.store") }
        let store = GroceryModeStore(defaults: defaults)
        store.clearedCashMinorUnits = 50_000
        store.billsBeforePaydayMinorUnits = 20_000

        let payday = Calendar.current.date(byAdding: .day, value: 10, to: Date()) ?? Date()
        let result = store.result(nextPayday: payday)

        XCTAssertEqual(result.reservedForBillsMinorUnits, 20_000)
        XCTAssertEqual(result.safeToSpendMinorUnits, 30_000)
        XCTAssertEqual(result.spendableForCheckMinorUnits, 30_000)
    }

    func testGroceryModeStorePinnedPreferred() {
        let defaults = makeDefaults("grocery.store.pin")
        defer { defaults.removePersistentDomain(forName: "grocery.store.pin") }
        let store = GroceryModeStore(defaults: defaults)
        store.clearedCashMinorUnits = 50_000
        store.pinnedCategoryName = "Groceries"
        store.pinnedCategoryRemainingMinorUnits = 8_000

        let payday = Calendar.current.date(byAdding: .day, value: 5, to: Date()) ?? Date()
        XCTAssertEqual(store.result(nextPayday: payday).spendableForCheckMinorUnits, 8_000)
    }

    // MARK: - ExpectedIncomeStore

    func testExpectedIncomeStorePersistsAndBreaksDown() {
        let defaults = makeDefaults("income.store")
        defer { defaults.removePersistentDomain(forName: "income.store") }
        let store = ExpectedIncomeStore(defaults: defaults)
        store.clearedCashMinorUnits = 10_000
        store.add(ExpectedIncome(
            source: "Reliable gig",
            amountMinorUnits: 30_000,
            expectedDate: Calendar.current.date(byAdding: .day, value: 5, to: Date()) ?? Date(),
            reliability: .reliable,
            status: .expected
        ))
        store.add(ExpectedIncome(
            source: "Flaky support",
            amountMinorUnits: 40_000,
            expectedDate: Calendar.current.date(byAdding: .day, value: 5, to: Date()) ?? Date(),
            reliability: .unreliable,
            status: .expected
        ))

        let breakdown = store.breakdown()
        XCTAssertEqual(breakdown.clearedMinorUnits, 10_000)
        XCTAssertEqual(breakdown.expectedMinorUnits, 30_000)
        XCTAssertEqual(breakdown.atRiskMinorUnits, 40_000)

        // Round-trips through UserDefaults.
        let reloaded = ExpectedIncomeStore(defaults: defaults)
        XCTAssertEqual(reloaded.items.count, 2)
    }

    func testExpectedIncomeStoreStatusAndRemoval() {
        let defaults = makeDefaults("income.store.mut")
        defer { defaults.removePersistentDomain(forName: "income.store.mut") }
        let store = ExpectedIncomeStore(defaults: defaults)
        let income = ExpectedIncome(
            source: "Invoice",
            amountMinorUnits: 20_000,
            expectedDate: Date(),
            reliability: .usuallyOnTime,
            status: .expected
        )
        store.add(income)
        store.setStatus(id: income.id, status: .received, receivedMinorUnits: 20_000)
        XCTAssertEqual(store.items.first?.status, .received)

        store.remove(id: income.id)
        XCTAssertTrue(store.items.isEmpty)
    }

    // MARK: - PaydaySettingsStore

    func testPaydaySettingsStoreGeneratesPaydays() {
        let defaults = makeDefaults("payday.store")
        defer { defaults.removePersistentDomain(forName: "payday.store") }
        let store = PaydaySettingsStore(defaults: defaults)
        store.frequency = .biweekly
        store.anchorDate = Calendar.current.date(byAdding: .day, value: 3, to: Date()) ?? Date()

        let paydays = store.upcomingPaydays(count: 3)
        XCTAssertEqual(paydays.count, 3)
        XCTAssertNotNil(store.nextPayday())

        store.typicalPaycheckMinorUnits = 150_000
        let deposits = store.deposits(count: 3)
        XCTAssertEqual(deposits.count, 3)
        XCTAssertEqual(deposits.first?.amountMinorUnits, 150_000)
    }
}
