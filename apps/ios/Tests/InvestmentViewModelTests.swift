// SPDX-License-Identifier: BUSL-1.1

// InvestmentViewModelTests.swift
// FinanceTests
//
// Tests for InvestmentViewModel — portfolio loading, allocation, contributions,
// and compound-growth projections (#1103, #2118).

import XCTest
@testable import FinanceApp

// MARK: - Stub Formatter

private struct StubFormatter: SwiftExportFormatterModule {
    func format(amountMinorUnits: Int64, currencyCode: String, showSign: Bool) -> String {
        "\(amountMinorUnits)"
    }

    func formatCompact(amountMinorUnits: Int64, currencyCode: String) -> String {
        "\(amountMinorUnits)"
    }
}

final class InvestmentViewModelTests: XCTestCase {

    @MainActor
    private func makeViewModel(
        portfolios: [PortfolioItem] = [SampleData.samplePortfolio],
        monthlyContribution: Int64 = 1_000_00,
        contributions: [ContributionRecord] = [],
        error: Error? = nil
    ) -> (InvestmentViewModel, StubInvestmentRepository) {
        let repo = StubInvestmentRepository()
        repo.portfoliosToReturn = portfolios
        repo.errorToThrow = error
        if let first = portfolios.first {
            repo.monthlyContributionByPortfolio[first.id] = monthlyContribution
            repo.contributionsByPortfolio[first.id] = contributions
        }
        let vm = InvestmentViewModel(repository: repo, formatter: StubFormatter())
        return (vm, repo)
    }

    @MainActor
    func testLoadPortfoliosSelectsFirst() async {
        let (vm, _) = makeViewModel()

        await vm.loadPortfolios()

        XCTAssertEqual(vm.portfolios.count, 1)
        XCTAssertEqual(vm.selectedPortfolio?.id, "p1")
        XCTAssertFalse(vm.isLoading)
        XCTAssertNil(vm.errorMessage)
    }

    @MainActor
    func testLoadPortfoliosComputesAllocation() async {
        let (vm, _) = makeViewModel()

        await vm.loadPortfolios()

        XCTAssertFalse(vm.allocationSlices.isEmpty)
        let total = vm.allocationSlices.reduce(0.0) { $0 + $1.percentage }
        XCTAssertEqual(total, 100.0, accuracy: 0.01)
    }

    @MainActor
    func testLoadPortfoliosLoadsContributionData() async {
        let record = ContributionRecord(date: .now, amountMinorUnits: 500_00)
        let (vm, _) = makeViewModel(contributions: [record])

        await vm.loadPortfolios()

        XCTAssertEqual(vm.monthlyContributionMinorUnits, 1_000_00)
        XCTAssertEqual(vm.contributions.count, 1)
    }

    @MainActor
    func testLoadPortfoliosError() async {
        let (vm, _) = makeViewModel(error: TestError.simulated)

        await vm.loadPortfolios()

        XCTAssertNotNil(vm.errorMessage)
        XCTAssertTrue(vm.portfolios.isEmpty)
    }

    @MainActor
    func testProjectionPointsUseContributionAndHorizon() async {
        let (vm, _) = makeViewModel()
        await vm.loadPortfolios()

        vm.projectionYears = 10
        vm.projectionAnnualReturnPercent = 7

        let points = vm.projectionPoints
        XCTAssertEqual(points.count, 11)
        XCTAssertGreaterThan(vm.projectedValueMinorUnits, vm.selectedPortfolio!.totalValueMinorUnits)
    }

    @MainActor
    func testProjectionEmptyWithoutPortfolio() {
        let (vm, _) = makeViewModel(portfolios: [])
        XCTAssertTrue(vm.projectionPoints.isEmpty)
    }

    @MainActor
    func testUpdateMonthlyContributionPersistsSanitised() async {
        let (vm, repo) = makeViewModel()
        await vm.loadPortfolios()

        await vm.updateMonthlyContribution(-50)

        XCTAssertEqual(vm.monthlyContributionMinorUnits, 0)
        XCTAssertEqual(repo.setContributionCalls.last?.amount, 0)
    }

    @MainActor
    func testUpdateMonthlyContributionStoresValue() async {
        let (vm, repo) = makeViewModel()
        await vm.loadPortfolios()

        await vm.updateMonthlyContribution(2_000_00)

        XCTAssertEqual(vm.monthlyContributionMinorUnits, 2_000_00)
        XCTAssertEqual(repo.setContributionCalls.last?.amount, 2_000_00)
    }

    @MainActor
    func testRecordContributionAddsToHistory() async {
        let (vm, repo) = makeViewModel()
        await vm.loadPortfolios()

        await vm.recordContribution(750_00)

        XCTAssertEqual(repo.recordedContributions.last?.amount, 750_00)
        XCTAssertEqual(vm.contributions.first?.amountMinorUnits, 750_00)
    }

    @MainActor
    func testRecordContributionIgnoresNonPositive() async {
        let (vm, repo) = makeViewModel()
        await vm.loadPortfolios()

        await vm.recordContribution(0)

        XCTAssertTrue(repo.recordedContributions.isEmpty)
    }

    @MainActor
    func testContributionMetrics() async {
        let (vm, _) = makeViewModel()
        await vm.loadPortfolios()

        // p1: cost basis 25_000_00, value 29_100_00 → growth 4_100_00.
        XCTAssertEqual(vm.totalContributionsMinorUnits, 25_000_00)
        XCTAssertEqual(vm.marketReturnMinorUnits, 4_100_00)
    }

    @MainActor
    func testSortedHoldingsDescending() async {
        let (vm, _) = makeViewModel()
        await vm.loadPortfolios()

        let sorted = vm.sortedHoldings(for: vm.selectedPortfolio!)
        XCTAssertEqual(sorted.first?.symbol, "VTI")
    }

    @MainActor
    func testDismissError() {
        let (vm, _) = makeViewModel()
        vm.errorMessage = "oops"
        XCTAssertTrue(vm.showError)
        vm.dismissError()
        XCTAssertFalse(vm.showError)
    }
}
