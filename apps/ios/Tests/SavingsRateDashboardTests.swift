// SPDX-License-Identifier: BUSL-1.1

// SavingsRateDashboardTests.swift
// FinanceTests
//
// Tests for the savings-rate state the dashboard surfaces (#2162). A fully
// controlled aggregator is injected so the month-over-month trend is
// deterministic and independent of the KMP date-filtering behaviour.

import XCTest
@testable import FinanceApp
@testable import FinanceShared

/// Aggregator stub whose income/spending are driven by injected closures keyed
/// on the period start date, giving tests exact control over each month.
private final class ControlledAggregator: SwiftExportAggregatorModule, @unchecked Sendable {
    var incomeProvider: (Date) -> Int64 = { _ in 0 }
    var spendingProvider: (Date) -> Int64 = { _ in 0 }

    func netWorth(accounts: [AccountItem]) -> Int64 { 0 }
    func totalSpending(transactions: [TransactionItem], from: Date, to: Date) -> Int64 { spendingProvider(from) }
    func totalIncome(transactions: [TransactionItem], from: Date, to: Date) -> Int64 { incomeProvider(from) }
    func netCashFlow(transactions: [TransactionItem], from: Date, to: Date) -> Int64 { incomeProvider(from) - spendingProvider(from) }
    func spendingByCategory(transactions: [TransactionItem], from: Date, to: Date) -> [String: Int64] { [:] }
    func savingsRate(transactions: [TransactionItem], from: Date, to: Date) -> Double { 0 }
}

final class SavingsRateDashboardTests: XCTestCase {

    private var startOfMonth: Date {
        let cal = Calendar.current
        return cal.date(from: cal.dateComponents([.year, .month], from: .now)) ?? .now
    }

    @MainActor
    private func makeVM(aggregator: ControlledAggregator) -> DashboardViewModel {
        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = SampleData.allAccounts
        let txRepo = StubTransactionRepository()
        txRepo.transactionsToReturn = SampleData.allTransactions
        let budgetRepo = StubBudgetRepository()
        budgetRepo.budgetsToReturn = SampleData.allBudgets

        return DashboardViewModel(
            accountRepository: accountRepo,
            transactionRepository: txRepo,
            budgetRepository: budgetRepo,
            aggregator: aggregator
        )
    }

    // MARK: - Current rate

    @MainActor
    func testCurrentSavingsRateComputedForThisMonth() async {
        let start = startOfMonth
        let agg = ControlledAggregator()
        agg.incomeProvider = { $0 >= start ? 10_000_00 : 8_000_00 }
        agg.spendingProvider = { $0 >= start ? 3_500_00 : 4_000_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        XCTAssertTrue(vm.currentSavingsRate.isDefined)
        XCTAssertEqual(vm.currentSavingsRate.percent, 65.0, accuracy: 0.001)
        XCTAssertEqual(vm.savingsRateDisplay, "65%")
    }

    @MainActor
    func testImprovingTrendVsLastMonth() async {
        let start = startOfMonth
        let agg = ControlledAggregator()
        // This month 65%, prior months 50% -> improving by 15 points.
        agg.incomeProvider = { $0 >= start ? 10_000_00 : 8_000_00 }
        agg.spendingProvider = { $0 >= start ? 3_500_00 : 4_000_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        guard case let .improving(delta) = vm.savingsRateTrend else {
            return XCTFail("Expected improving trend, got \(vm.savingsRateTrend)")
        }
        XCTAssertEqual(delta, 15.0, accuracy: 0.001)
        XCTAssertEqual(vm.savingsRateTrendSymbol, "arrow.up.right")
        XCTAssertTrue(vm.savingsRateTrendText.contains("15.0"))
    }

    @MainActor
    func testDecliningTrendVsLastMonth() async {
        let start = startOfMonth
        let agg = ControlledAggregator()
        // This month 50%, prior months 65% -> declining by 15 points.
        agg.incomeProvider = { $0 >= start ? 8_000_00 : 10_000_00 }
        agg.spendingProvider = { $0 >= start ? 4_000_00 : 3_500_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        guard case let .declining(delta) = vm.savingsRateTrend else {
            return XCTFail("Expected declining trend, got \(vm.savingsRateTrend)")
        }
        XCTAssertEqual(delta, 15.0, accuracy: 0.001)
        XCTAssertEqual(vm.savingsRateTrendSymbol, "arrow.down.right")
    }

    @MainActor
    func testTrailingThreeMonthIsIncomeWeighted() async {
        let start = startOfMonth
        let agg = ControlledAggregator()
        agg.incomeProvider = { $0 >= start ? 10_000_00 : 8_000_00 }
        agg.spendingProvider = { $0 >= start ? 3_500_00 : 4_000_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        // Pooled: income 10000+8000+8000 = 26000, spending 3500+4000+4000 = 11500.
        XCTAssertTrue(vm.trailingThreeMonthSavingsRate.isDefined)
        XCTAssertEqual(vm.trailingThreeMonthSavingsRate.percent, 14_500.0 / 26_000.0 * 100.0, accuracy: 0.01)
    }

    // MARK: - Undefined / no income

    @MainActor
    func testNoIncomeYieldsUndefinedRateAndPlaceholder() async {
        let agg = ControlledAggregator()
        agg.incomeProvider = { _ in 0 }
        agg.spendingProvider = { _ in 1_200_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        XCTAssertFalse(vm.currentSavingsRate.isDefined)
        XCTAssertEqual(vm.savingsRateDisplay, "—")
        XCTAssertEqual(vm.savingsRateTrend, .notEnoughData)
        XCTAssertEqual(vm.savingsRateTrendSymbol, "minus")
    }

    @MainActor
    func testDefaultStateBeforeLoadIsUndefined() {
        let agg = ControlledAggregator()
        let vm = makeVM(aggregator: agg)

        XCTAssertFalse(vm.currentSavingsRate.isDefined)
        XCTAssertEqual(vm.savingsRateTrend, .notEnoughData)
        XCTAssertEqual(vm.savingsRateDisplay, "—")
    }

    // MARK: - Presentation branches

    @MainActor
    func testAccessibilityLabelImproving() async {
        let start = startOfMonth
        let agg = ControlledAggregator()
        agg.incomeProvider = { $0 >= start ? 10_000_00 : 8_000_00 }
        agg.spendingProvider = { $0 >= start ? 3_500_00 : 4_000_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        let label = vm.savingsRateAccessibilityLabel
        XCTAssertTrue(label.contains("65"))
        XCTAssertTrue(label.lowercased().contains("up"))
    }

    @MainActor
    func testDecliningTextAndAccessibility() async {
        let start = startOfMonth
        let agg = ControlledAggregator()
        agg.incomeProvider = { $0 >= start ? 8_000_00 : 10_000_00 }
        agg.spendingProvider = { $0 >= start ? 4_000_00 : 3_500_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        XCTAssertTrue(vm.savingsRateTrendText.lowercased().contains("down"))
        XCTAssertTrue(vm.savingsRateAccessibilityLabel.lowercased().contains("down"))
    }

    @MainActor
    func testFlatTrendWhenUnchanged() async {
        let agg = ControlledAggregator()
        // Identical income and spending across all months -> flat.
        agg.incomeProvider = { _ in 6_000_00 }
        agg.spendingProvider = { _ in 3_000_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        XCTAssertEqual(vm.savingsRateTrend, .flat)
        XCTAssertEqual(vm.savingsRateTrendSymbol, "arrow.right")
        XCTAssertTrue(vm.savingsRateTrendText.lowercased().contains("steady"))
        XCTAssertTrue(vm.savingsRateAccessibilityLabel.lowercased().contains("steady"))
        XCTAssertEqual(vm.savingsRateDisplay, "50%")
    }

    @MainActor
    func testNotEnoughHistoryTextAndAccessibility() async {
        let start = startOfMonth
        let agg = ControlledAggregator()
        // Current month has income; prior months have none -> trend undefined.
        agg.incomeProvider = { $0 >= start ? 5_000_00 : 0 }
        agg.spendingProvider = { $0 >= start ? 2_000_00 : 1_000_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        XCTAssertTrue(vm.currentSavingsRate.isDefined)
        XCTAssertEqual(vm.savingsRateTrend, .notEnoughData)
        XCTAssertTrue(vm.savingsRateTrendText.lowercased().contains("not enough"))
        XCTAssertTrue(vm.savingsRateAccessibilityLabel.lowercased().contains("not enough"))
    }

    @MainActor
    func testUndefinedAccessibilityLabelIsHelpful() async {
        let agg = ControlledAggregator()
        agg.incomeProvider = { _ in 0 }
        agg.spendingProvider = { _ in 500_00 }

        let vm = makeVM(aggregator: agg)
        await vm.loadDashboard()

        XCTAssertTrue(vm.savingsRateAccessibilityLabel.lowercased().contains("unavailable"))
    }
}
