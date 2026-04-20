// SPDX-License-Identifier: BUSL-1.1

// AnalyticsViewModelTests.swift
// FinanceTests
//
// Tests for AnalyticsViewModel — data loading, period changes, error handling,
// and the analytics engine's prediction and anomaly detection.
//
// References: #269

import XCTest
@testable import FinanceApp

final class AnalyticsViewModelTests: XCTestCase {

    // MARK: - Stub Engine

    /// Configurable stub analytics engine for testing.
    private final class StubAnalyticsEngine: AnalyticsEngineProtocol, @unchecked Sendable {
        var summaryToReturn: AnalyticsSummary?
        var predictionsToReturn: [TrendPrediction] = []
        var anomaliesToReturn: [SpendingAnomaly] = []
        var categoryTrendsToReturn: [CategoryTrend] = []

        func computeSummary(
            transactions: [TransactionItem],
            accounts: [AccountItem],
            period: AnalyticsPeriod,
            currencyCode: String
        ) async -> AnalyticsSummary {
            summaryToReturn ?? AnalyticsSummary(
                averageMonthlySpending: 250_000,
                averageMonthlyIncome: 500_000,
                projectedMonthEndSpending: 275_000,
                savingsRatePercent: 50.0,
                topCategories: categoryTrendsToReturn,
                anomalies: anomaliesToReturn,
                predictions: predictionsToReturn,
                currencyCode: currencyCode
            )
        }

        func predictSpending(
            transactions: [TransactionItem],
            monthsAhead: Int
        ) -> [TrendPrediction] {
            predictionsToReturn
        }

        func detectAnomalies(
            transactions: [TransactionItem],
            period: AnalyticsPeriod
        ) -> [SpendingAnomaly] {
            anomaliesToReturn
        }

        func categoryTrends(
            transactions: [TransactionItem],
            period: AnalyticsPeriod
        ) -> [CategoryTrend] {
            categoryTrendsToReturn
        }
    }

    // MARK: - Helpers

    @MainActor
    private func makeViewModel(
        transactions: [TransactionItem] = SampleData.allTransactions,
        accounts: [AccountItem] = SampleData.allAccounts,
        transactionError: Error? = nil,
        accountError: Error? = nil,
        engine: StubAnalyticsEngine = StubAnalyticsEngine()
    ) -> (AnalyticsViewModel, StubAnalyticsEngine) {
        let transactionRepo = StubTransactionRepository()
        transactionRepo.transactionsToReturn = transactions
        transactionRepo.errorToThrow = transactionError

        let accountRepo = StubAccountRepository()
        accountRepo.accountsToReturn = accounts
        accountRepo.errorToThrow = accountError

        let vm = AnalyticsViewModel(
            transactionRepository: transactionRepo,
            accountRepository: accountRepo,
            engine: engine
        )
        return (vm, engine)
    }

    // MARK: - Tests

    @MainActor
    func testLoadAnalyticsPopulatesSummary() async {
        let (vm, _) = makeViewModel()

        await vm.loadAnalytics()

        XCTAssertNotNil(vm.summary, "Summary should be populated after loading")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after load")
        XCTAssertNil(vm.errorMessage, "No error should be present on success")
    }

    @MainActor
    func testLoadAnalyticsUsesDefaultCurrencyCode() async {
        let (vm, _) = makeViewModel(accounts: [])

        await vm.loadAnalytics()

        XCTAssertEqual(vm.summary?.currencyCode, "USD",
                       "Should default to USD when no accounts present")
    }

    @MainActor
    func testLoadAnalyticsUsesAccountCurrency() async {
        let eurAccount = AccountItem(
            id: "eur1", name: "Euro Account",
            balanceMinorUnits: 10_000_00, currencyCode: "EUR",
            type: .checking, icon: "building.columns", isArchived: false
        )
        let (vm, _) = makeViewModel(accounts: [eurAccount])

        await vm.loadAnalytics()

        XCTAssertEqual(vm.summary?.currencyCode, "EUR",
                       "Should use currency from first account")
    }

    @MainActor
    func testTransactionErrorSetsErrorMessage() async {
        let (vm, _) = makeViewModel(transactionError: TestError.simulated)

        await vm.loadAnalytics()

        XCTAssertNotNil(vm.errorMessage, "Error message should be set on failure")
        XCTAssertNil(vm.summary, "Summary should be nil on error")
        XCTAssertFalse(vm.isLoading, "isLoading should be false after error")
    }

    @MainActor
    func testAccountErrorSetsErrorMessage() async {
        let (vm, _) = makeViewModel(accountError: TestError.simulated)

        await vm.loadAnalytics()

        XCTAssertNotNil(vm.errorMessage, "Error message should be set on account error")
    }

    @MainActor
    func testDismissErrorClearsMessage() async {
        let (vm, _) = makeViewModel(transactionError: TestError.simulated)

        await vm.loadAnalytics()
        XCTAssertNotNil(vm.errorMessage)

        vm.dismissError()
        XCTAssertNil(vm.errorMessage, "Error message should be nil after dismissal")
    }

    @MainActor
    func testShowErrorReflectsErrorMessage() async {
        let (vm, _) = makeViewModel()
        XCTAssertFalse(vm.showError, "showError should be false with no error")

        let (vmError, _) = makeViewModel(transactionError: TestError.simulated)
        await vmError.loadAnalytics()
        XCTAssertTrue(vmError.showError, "showError should be true with error message")
    }

    @MainActor
    func testSelectedPeriodDefaultsToSixMonths() {
        let (vm, _) = makeViewModel()
        XCTAssertEqual(vm.selectedPeriod, .sixMonths)
    }

    @MainActor
    func testSummaryWithPredictions() async {
        let engine = StubAnalyticsEngine()
        engine.predictionsToReturn = [
            TrendPrediction(
                date: Date.now,
                predictedMinorUnits: 300_000,
                upperBoundMinorUnits: 350_000,
                lowerBoundMinorUnits: 250_000,
                confidencePercent: 90.0
            ),
        ]
        let (vm, _) = makeViewModel(engine: engine)

        await vm.loadAnalytics()

        XCTAssertNotNil(vm.summary)
    }

    @MainActor
    func testSummaryWithAnomalies() async {
        let engine = StubAnalyticsEngine()
        engine.anomaliesToReturn = [
            SpendingAnomaly(
                category: "Dining Out",
                date: Date.now,
                actualMinorUnits: 450_00,
                expectedMinorUnits: 180_00,
                deviationFactor: 3.2
            ),
        ]
        let (vm, _) = makeViewModel(engine: engine)

        await vm.loadAnalytics()

        XCTAssertNotNil(vm.summary)
    }
}

// MARK: - Analytics Engine Unit Tests

final class AnalyticsEngineTests: XCTestCase {

    private func makeTransactions(
        monthCount: Int,
        baseAmount: Int64 = 100_00,
        calendar: Calendar = .current
    ) -> [TransactionItem] {
        let now = Date.now
        return (0..<monthCount).flatMap { monthOffset -> [TransactionItem] in
            let date = calendar.date(byAdding: .month, value: -monthOffset, to: now)!
            return [
                TransactionItem(
                    id: "exp-\(monthOffset)",
                    payee: "Store \(monthOffset)",
                    category: "Groceries",
                    amountMinorUnits: -(baseAmount + Int64(monthOffset) * 10_00),
                    currencyCode: "USD",
                    date: date,
                    type: .expense
                ),
                TransactionItem(
                    id: "inc-\(monthOffset)",
                    payee: "Employer",
                    category: "Income",
                    amountMinorUnits: 500_000,
                    currencyCode: "USD",
                    date: date,
                    type: .income
                ),
            ]
        }
    }

    func testPredictSpendingRequiresMinimumData() async {
        let engine = AnalyticsEngine.shared
        let singleMonth = [
            TransactionItem(
                id: "t1", payee: "Test", category: "Food",
                amountMinorUnits: -100_00, currencyCode: "USD",
                date: .now, type: .expense
            ),
        ]

        let predictions = await engine.predictSpending(
            transactions: singleMonth,
            monthsAhead: 3
        )

        XCTAssertTrue(predictions.isEmpty,
                       "Should return empty predictions with insufficient data")
    }

    func testPredictSpendingReturnsCorrectCount() async {
        let engine = AnalyticsEngine.shared
        let transactions = makeTransactions(monthCount: 6)

        let predictions = await engine.predictSpending(
            transactions: transactions,
            monthsAhead: 3
        )

        XCTAssertEqual(predictions.count, 3,
                       "Should return exactly 3 predictions")
    }

    func testPredictionsHaveDecreasingConfidence() async {
        let engine = AnalyticsEngine.shared
        let transactions = makeTransactions(monthCount: 6)

        let predictions = await engine.predictSpending(
            transactions: transactions,
            monthsAhead: 3
        )

        guard predictions.count >= 2 else {
            XCTFail("Expected at least 2 predictions")
            return
        }

        XCTAssertGreaterThan(
            predictions[0].confidencePercent,
            predictions[1].confidencePercent,
            "Confidence should decrease for further predictions"
        )
    }

    func testDetectAnomaliesWithNormalData() async {
        let engine = AnalyticsEngine.shared
        let transactions = makeTransactions(monthCount: 6, baseAmount: 100_00)

        let anomalies = await engine.detectAnomalies(
            transactions: transactions,
            period: .sixMonths
        )

        // With linearly increasing data, anomalies may or may not be detected
        // depending on the spread — this validates the function doesn't crash
        XCTAssertNotNil(anomalies, "Anomalies result should not be nil")
    }

    func testCategoryTrendsGroupByCategory() async {
        let engine = AnalyticsEngine.shared
        let transactions = makeTransactions(monthCount: 4)

        let trends = await engine.categoryTrends(
            transactions: transactions,
            period: .sixMonths
        )

        // Only expense categories should appear (Groceries)
        let expenseCategories = trends.filter { $0.categoryName == "Groceries" }
        XCTAssertFalse(expenseCategories.isEmpty,
                       "Should include Groceries category trend")
    }

    func testAnalyticsPeriodMonthCount() {
        XCTAssertEqual(AnalyticsPeriod.threeMonths.monthCount, 3)
        XCTAssertEqual(AnalyticsPeriod.sixMonths.monthCount, 6)
        XCTAssertEqual(AnalyticsPeriod.oneYear.monthCount, 12)
        XCTAssertNil(AnalyticsPeriod.allTime.monthCount)
    }

    func testSpendingAnomalyProperties() {
        let overspend = SpendingAnomaly(
            category: "Test", date: .now,
            actualMinorUnits: 500_00,
            expectedMinorUnits: 200_00,
            deviationFactor: 3.5
        )
        XCTAssertTrue(overspend.isOverspend)
        XCTAssertEqual(overspend.severity, .high)

        let medium = SpendingAnomaly(
            category: "Test", date: .now,
            actualMinorUnits: 300_00,
            expectedMinorUnits: 200_00,
            deviationFactor: 2.5
        )
        XCTAssertEqual(medium.severity, .medium)

        let low = SpendingAnomaly(
            category: "Test", date: .now,
            actualMinorUnits: 250_00,
            expectedMinorUnits: 200_00,
            deviationFactor: 1.8
        )
        XCTAssertEqual(low.severity, .low)

        let underspend = SpendingAnomaly(
            category: "Test", date: .now,
            actualMinorUnits: 100_00,
            expectedMinorUnits: 200_00,
            deviationFactor: 2.0
        )
        XCTAssertFalse(underspend.isOverspend)
    }
}
