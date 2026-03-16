// SPDX-License-Identifier: BUSL-1.1

// TransactionFiltersTests.swift
// FinanceTests
//
// Tests for TransactionFilters — date presets, type filtering, category
// selection, amount range, combined filters, and computed properties.

import XCTest
@testable import FinanceApp

final class TransactionFiltersTests: XCTestCase {

    // MARK: - Test Data

    /// Deterministic transactions spanning multiple dates, types, categories, and amounts.
    /// Using fixed timestamps so date-based tests are predictable.
    private static func makeTestTransactions() -> [TransactionItem] {
        let calendar = Calendar.current
        let now = Date.now

        let todayMorning = calendar.startOfDay(for: now).addingTimeInterval(3600 * 10) // 10 AM today
        let yesterday = calendar.date(byAdding: .day, value: -1, to: todayMorning)!
        let lastWeek = calendar.date(byAdding: .day, value: -8, to: todayMorning)!
        let lastMonth = calendar.date(byAdding: .month, value: -2, to: todayMorning)!
        let lastYear = calendar.date(byAdding: .year, value: -2, to: todayMorning)!

        return [
            // Today — expense — Groceries — $85.40
            TransactionItem(
                id: "t1", payee: "Whole Foods",
                category: "Groceries", accountName: "Checking",
                amountMinorUnits: -85_40, currencyCode: "USD",
                date: todayMorning, type: .expense, status: .cleared
            ),
            // Today — income — Income — $4,250.00
            TransactionItem(
                id: "t2", payee: "Payroll",
                category: "Income", accountName: "Checking",
                amountMinorUnits: 4_250_00, currencyCode: "USD",
                date: todayMorning, type: .income, status: .cleared
            ),
            // Yesterday — transfer — Transfer — $500.00
            TransactionItem(
                id: "t3", payee: "Transfer to Savings",
                category: "Transfer", accountName: "Checking",
                amountMinorUnits: -500_00, currencyCode: "USD",
                date: yesterday, type: .transfer, status: .cleared
            ),
            // Last week — expense — Entertainment — $15.99
            TransactionItem(
                id: "t4", payee: "Netflix",
                category: "Entertainment", accountName: "Travel Card",
                amountMinorUnits: -15_99, currencyCode: "USD",
                date: lastWeek, type: .expense, status: .cleared
            ),
            // 2 months ago — expense — Transport — $45.00
            TransactionItem(
                id: "t5", payee: "Shell Gas",
                category: "Transport", accountName: "Travel Card",
                amountMinorUnits: -45_00, currencyCode: "USD",
                date: lastMonth, type: .expense, status: .pending
            ),
            // 2 years ago — expense — Groceries — $120.00
            TransactionItem(
                id: "t6", payee: "Costco",
                category: "Groceries", accountName: "Checking",
                amountMinorUnits: -120_00, currencyCode: "USD",
                date: lastYear, type: .expense, status: .cleared
            ),
        ]
    }

    // MARK: - Default Filters (No Effect)

    func testDefaultFiltersPassAllTransactions() {
        let transactions = Self.makeTestTransactions()
        let filters = TransactionFilters.default

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, transactions.count,
                       "Default filters should pass all transactions through unchanged")
    }

    func testDefaultFiltersIsActiveIsFalse() {
        let filters = TransactionFilters.default
        XCTAssertFalse(filters.isActive, "Default filters should report isActive == false")
    }

    func testDefaultFiltersActiveCountIsZero() {
        let filters = TransactionFilters.default
        XCTAssertEqual(filters.activeCount, 0, "Default filters should have activeCount == 0")
    }

    // MARK: - Date Preset Filtering

    func testDatePresetToday() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .today

        let result = filters.apply(to: transactions)

        // Only t1 and t2 are today
        XCTAssertEqual(result.count, 2, "Today preset should include only today's transactions")
        XCTAssertTrue(result.allSatisfy { Calendar.current.isDateInToday($0.date) },
                      "All results should be from today")
    }

    func testDatePresetThisWeek() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .thisWeek

        let result = filters.apply(to: transactions)

        // Should include today (t1, t2) and possibly yesterday (t3) if it's in the same week
        let calendar = Calendar.current
        guard let weekInterval = calendar.dateInterval(of: .weekOfYear, for: .now) else {
            XCTFail("Could not compute week interval")
            return
        }
        XCTAssertTrue(result.allSatisfy {
            $0.date >= weekInterval.start && $0.date < weekInterval.end
        }, "All results should be within the current week")
    }

    func testDatePresetThisMonth() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .thisMonth

        let result = filters.apply(to: transactions)

        let calendar = Calendar.current
        guard let monthInterval = calendar.dateInterval(of: .month, for: .now) else {
            XCTFail("Could not compute month interval")
            return
        }
        XCTAssertTrue(result.allSatisfy {
            $0.date >= monthInterval.start && $0.date < monthInterval.end
        }, "All results should be within the current month")
        // t6 (2 years ago) and t5 (2 months ago) should be excluded
        XCTAssertFalse(result.contains { $0.id == "t6" }, "Transaction from 2 years ago should be excluded")
        XCTAssertFalse(result.contains { $0.id == "t5" }, "Transaction from 2 months ago should be excluded")
    }

    func testDatePresetThisYear() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .thisYear

        let result = filters.apply(to: transactions)

        // t6 is from 2 years ago, should be excluded
        XCTAssertFalse(result.contains { $0.id == "t6" },
                       "Transaction from 2 years ago should be excluded from This Year")
        // All others should be included (they're within the current year range)
        XCTAssertTrue(result.count >= 2, "This Year should include recent transactions")
    }

    func testDatePresetAllTime() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .allTime

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, transactions.count,
                       "All Time preset should include all transactions")
    }

    func testDatePresetCustomRange() {
        let transactions = Self.makeTestTransactions()
        let calendar = Calendar.current
        let now = Date.now

        var filters = TransactionFilters.default
        filters.datePreset = .custom
        // Set custom range to include only today
        filters.customStartDate = calendar.startOfDay(for: now)
        filters.customEndDate = now

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, 2, "Custom range for today should include only today's 2 transactions")
        XCTAssertTrue(result.allSatisfy { Calendar.current.isDateInToday($0.date) })
    }

    // MARK: - Transaction Type Filtering

    func testExpensesOnlyFilter() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.includeIncome = false
        filters.includeTransfers = false

        let result = filters.apply(to: transactions)

        XCTAssertTrue(result.allSatisfy { $0.type == .expense },
                      "Should only include expense transactions")
        XCTAssertEqual(result.count, 4, "Should include all 4 expense transactions")
    }

    func testIncomeOnlyFilter() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.includeExpenses = false
        filters.includeTransfers = false

        let result = filters.apply(to: transactions)

        XCTAssertTrue(result.allSatisfy { $0.type == .income },
                      "Should only include income transactions")
        XCTAssertEqual(result.count, 1, "Should include exactly 1 income transaction")
    }

    func testTransfersOnlyFilter() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.includeExpenses = false
        filters.includeIncome = false

        let result = filters.apply(to: transactions)

        XCTAssertTrue(result.allSatisfy { $0.type == .transfer },
                      "Should only include transfer transactions")
        XCTAssertEqual(result.count, 1, "Should include exactly 1 transfer transaction")
    }

    func testAllTypesEnabledPassesAll() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.includeExpenses = true
        filters.includeIncome = true
        filters.includeTransfers = true

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, transactions.count,
                       "All types enabled should pass all transactions")
    }

    func testNoTypesEnabledReturnsEmpty() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.includeExpenses = false
        filters.includeIncome = false
        filters.includeTransfers = false

        let result = filters.apply(to: transactions)

        XCTAssertTrue(result.isEmpty, "No types enabled should return empty list")
    }

    // MARK: - Category Filtering

    func testCategoryFilterGroceries() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.selectedCategories = ["Groceries"]

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, 2, "Should include both Groceries transactions (t1, t6)")
        XCTAssertTrue(result.allSatisfy { $0.category == "Groceries" })
    }

    func testCategoryFilterMultipleCategories() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.selectedCategories = ["Groceries", "Entertainment"]

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, 3,
                       "Should include 2 Groceries + 1 Entertainment transactions")
        XCTAssertTrue(result.allSatisfy {
            $0.category == "Groceries" || $0.category == "Entertainment"
        })
    }

    func testCategoryFilterEmptyMeansAllCategories() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.selectedCategories = []

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, transactions.count,
                       "Empty selectedCategories should include all categories")
    }

    func testCategoryFilterNonExistentCategory() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.selectedCategories = ["NonExistent"]

        let result = filters.apply(to: transactions)

        XCTAssertTrue(result.isEmpty,
                      "Selecting a non-existent category should return empty results")
    }

    // MARK: - Amount Range Filtering

    func testAmountFilterMinOnly() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.minAmount = "100"

        let result = filters.apply(to: transactions)

        // Amounts (abs): 85.40, 4250.00, 500.00, 15.99, 45.00, 120.00
        // >= 100: 4250.00, 500.00, 120.00
        XCTAssertEqual(result.count, 3,
                       "Min $100 should include 3 transactions (abs amount >= 100)")
        XCTAssertTrue(result.allSatisfy { Decimal(abs($0.amountMinorUnits)) / 100 >= 100 })
    }

    func testAmountFilterMaxOnly() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.maxAmount = "50"

        let result = filters.apply(to: transactions)

        // Amounts (abs): 85.40, 4250.00, 500.00, 15.99, 45.00, 120.00
        // <= 50: 15.99, 45.00
        XCTAssertEqual(result.count, 2,
                       "Max $50 should include 2 transactions (abs amount <= 50)")
        XCTAssertTrue(result.allSatisfy { Decimal(abs($0.amountMinorUnits)) / 100 <= 50 })
    }

    func testAmountFilterBothMinAndMax() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.minAmount = "40"
        filters.maxAmount = "100"

        let result = filters.apply(to: transactions)

        // Amounts (abs): 85.40, 4250.00, 500.00, 15.99, 45.00, 120.00
        // 40 <= x <= 100: 85.40, 45.00
        XCTAssertEqual(result.count, 2,
                       "$40–$100 range should include 2 transactions")
        XCTAssertTrue(result.allSatisfy {
            let abs = Decimal(abs($0.amountMinorUnits)) / 100
            return abs >= 40 && abs <= 100
        })
    }

    func testAmountFilterEmptyStringsPassAll() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.minAmount = ""
        filters.maxAmount = ""

        let result = filters.apply(to: transactions)

        XCTAssertEqual(result.count, transactions.count,
                       "Empty amount strings should pass all transactions")
    }

    func testAmountFilterInvalidStringIgnored() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.minAmount = "abc"
        filters.maxAmount = "xyz"

        let result = filters.apply(to: transactions)

        // Invalid decimal strings produce nil, so no amount filter is applied
        XCTAssertEqual(result.count, transactions.count,
                       "Invalid amount strings should be treated as no filter")
    }

    // MARK: - Combined Filters

    func testCombinedDateAndTypeFilter() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .today
        filters.includeIncome = false
        filters.includeTransfers = false

        let result = filters.apply(to: transactions)

        // Today: t1 (expense), t2 (income). Exclude income → only t1
        XCTAssertEqual(result.count, 1,
                       "Today + expenses only should yield 1 transaction")
        XCTAssertEqual(result.first?.id, "t1")
    }

    func testCombinedTypeAndCategoryFilter() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.includeIncome = false
        filters.includeTransfers = false
        filters.selectedCategories = ["Groceries"]

        let result = filters.apply(to: transactions)

        // Expenses only + Groceries: t1, t6
        XCTAssertEqual(result.count, 2,
                       "Expenses + Groceries should yield 2 transactions")
        XCTAssertTrue(result.allSatisfy { $0.type == .expense && $0.category == "Groceries" })
    }

    func testCombinedDateTypeCategoryFilter() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .today
        filters.includeIncome = false
        filters.includeTransfers = false
        filters.selectedCategories = ["Groceries"]

        let result = filters.apply(to: transactions)

        // Today + expenses + Groceries: only t1
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.first?.id, "t1")
    }

    func testCombinedAllFilterDimensions() {
        let transactions = Self.makeTestTransactions()
        var filters = TransactionFilters.default
        filters.datePreset = .thisYear
        filters.includeIncome = false
        filters.includeTransfers = false
        filters.selectedCategories = ["Groceries", "Entertainment"]
        filters.minAmount = "10"
        filters.maxAmount = "100"

        let result = filters.apply(to: transactions)

        // This year expenses in Groceries/Entertainment with $10–$100:
        // t1: Groceries, $85.40 ✓ (if this year)
        // t4: Entertainment, $15.99 ✓ (if this year — last week)
        // t6: Groceries, $120.00 ✗ (2 years ago, excluded by date)
        for item in result {
            XCTAssertEqual(item.type, .expense)
            XCTAssertTrue(["Groceries", "Entertainment"].contains(item.category))
            let abs = Decimal(abs(item.amountMinorUnits)) / 100
            XCTAssertTrue(abs >= 10 && abs <= 100)
        }
    }

    // MARK: - Empty Transaction List

    func testApplyToEmptyList() {
        var filters = TransactionFilters.default
        filters.datePreset = .today
        filters.includeIncome = false
        filters.selectedCategories = ["Groceries"]
        filters.minAmount = "10"

        let result = filters.apply(to: [])

        XCTAssertTrue(result.isEmpty,
                      "Applying filters to an empty list should return empty")
    }

    // MARK: - isActive Property

    func testIsActiveWhenDatePresetChanged() {
        var filters = TransactionFilters.default
        filters.datePreset = .today

        XCTAssertTrue(filters.isActive)
    }

    func testIsActiveWhenTypeExcluded() {
        var filters = TransactionFilters.default
        filters.includeExpenses = false

        XCTAssertTrue(filters.isActive)
    }

    func testIsActiveWhenCategoriesSelected() {
        var filters = TransactionFilters.default
        filters.selectedCategories = ["Groceries"]

        XCTAssertTrue(filters.isActive)
    }

    func testIsActiveWhenMinAmountSet() {
        var filters = TransactionFilters.default
        filters.minAmount = "50"

        XCTAssertTrue(filters.isActive)
    }

    func testIsActiveWhenMaxAmountSet() {
        var filters = TransactionFilters.default
        filters.maxAmount = "100"

        XCTAssertTrue(filters.isActive)
    }

    // MARK: - activeCount Property

    func testActiveCountSingleDimension() {
        var filters = TransactionFilters.default
        filters.datePreset = .today

        XCTAssertEqual(filters.activeCount, 1)
    }

    func testActiveCountMultipleDimensions() {
        var filters = TransactionFilters.default
        filters.datePreset = .thisMonth
        filters.includeTransfers = false
        filters.selectedCategories = ["Groceries"]
        filters.minAmount = "10"

        XCTAssertEqual(filters.activeCount, 4,
                       "Four filter dimensions should be active")
    }

    func testActiveCountTypeTogglesCountAsOne() {
        var filters = TransactionFilters.default
        filters.includeExpenses = false
        filters.includeIncome = false

        // Even though two toggles changed, it's one filter dimension ("type")
        XCTAssertEqual(filters.activeCount, 1,
                       "Type toggles should count as a single filter dimension")
    }

    func testActiveCountAmountFieldsCountAsOne() {
        var filters = TransactionFilters.default
        filters.minAmount = "10"
        filters.maxAmount = "500"

        XCTAssertEqual(filters.activeCount, 1,
                       "Min + max amount should count as a single filter dimension")
    }

    // MARK: - Chip Labels

    func testChipLabelsForDatePreset() {
        var filters = TransactionFilters.default
        filters.datePreset = .thisMonth

        let chips = filters.activeChipLabels
        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chips.first?.id, "date")
    }

    func testChipLabelsForTypeFilter() {
        var filters = TransactionFilters.default
        filters.includeTransfers = false

        let chips = filters.activeChipLabels
        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chips.first?.id, "type")
    }

    func testChipLabelsForCategoryFilter() {
        var filters = TransactionFilters.default
        filters.selectedCategories = ["Groceries", "Entertainment"]

        let chips = filters.activeChipLabels
        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chips.first?.id, "category")
    }

    func testChipLabelsForAmountFilter() {
        var filters = TransactionFilters.default
        filters.minAmount = "10"
        filters.maxAmount = "500"

        let chips = filters.activeChipLabels
        XCTAssertEqual(chips.count, 1)
        XCTAssertEqual(chips.first?.id, "amount")
    }

    // MARK: - Remove Chip

    func testRemoveChipResetsDateFilter() {
        var filters = TransactionFilters.default
        filters.datePreset = .today

        let chip = FilterChip(id: "date", label: "Today")
        filters.removeChip(chip)

        XCTAssertEqual(filters.datePreset, .allTime)
        XCTAssertFalse(filters.isActive)
    }

    func testRemoveChipResetsTypeFilter() {
        var filters = TransactionFilters.default
        filters.includeExpenses = false

        let chip = FilterChip(id: "type", label: "Income, Transfer")
        filters.removeChip(chip)

        XCTAssertTrue(filters.includeExpenses)
        XCTAssertTrue(filters.includeIncome)
        XCTAssertTrue(filters.includeTransfers)
        XCTAssertFalse(filters.isActive)
    }

    func testRemoveChipResetsCategoryFilter() {
        var filters = TransactionFilters.default
        filters.selectedCategories = ["Groceries"]

        let chip = FilterChip(id: "category", label: "Groceries")
        filters.removeChip(chip)

        XCTAssertTrue(filters.selectedCategories.isEmpty)
        XCTAssertFalse(filters.isActive)
    }

    func testRemoveChipResetsAmountFilter() {
        var filters = TransactionFilters.default
        filters.minAmount = "10"
        filters.maxAmount = "500"

        let chip = FilterChip(id: "amount", label: "$10 – $500")
        filters.removeChip(chip)

        XCTAssertTrue(filters.minAmount.isEmpty)
        XCTAssertTrue(filters.maxAmount.isEmpty)
        XCTAssertFalse(filters.isActive)
    }
}
