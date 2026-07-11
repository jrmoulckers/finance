// SPDX-License-Identifier: BUSL-1.1

// PersistedInvestmentRepositoryTests.swift
// FinanceTests
//
// Tests for the UserDefaults-backed investment repository, including seeding,
// contribution tracking, and deterministic performance history (#2118).

import XCTest
@testable import FinanceApp

final class PersistedInvestmentRepositoryTests: XCTestCase {

    private var defaults: UserDefaults!
    private let suiteName = "PersistedInvestmentRepositoryTests.suite"

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

    private func makeRepo(seedIfEmpty: Bool = true) -> PersistedInvestmentRepository {
        PersistedInvestmentRepository(
            defaults: defaults,
            storageKey: "test.investments",
            seededKey: "test.investments.seeded",
            seedIfEmpty: seedIfEmpty
        )
    }

    func testSeedsStarterPortfolioOnFirstLaunch() async throws {
        let repo = makeRepo()
        let portfolios = try await repo.getPortfolios()

        XCTAssertEqual(portfolios.count, 1)
        let portfolio = portfolios.first!
        XCTAssertEqual(portfolio.id, "main")
        XCTAssertFalse(portfolio.holdings.isEmpty)
        XCTAssertGreaterThan(portfolio.monthlyContributionMinorUnits, 0)
    }

    func testNoSeedWhenDisabled() async throws {
        let repo = makeRepo(seedIfEmpty: false)
        let portfolios = try await repo.getPortfolios()
        XCTAssertTrue(portfolios.isEmpty)
    }

    func testSetMonthlyContributionPersists() async throws {
        let repo = makeRepo()
        try await repo.setMonthlyContributionMinorUnits(250_00, portfolioId: "main")

        let value = try await repo.getMonthlyContributionMinorUnits(portfolioId: "main")
        XCTAssertEqual(value, 250_00)
    }

    func testNegativeContributionClampedToZero() async throws {
        let repo = makeRepo()
        try await repo.setMonthlyContributionMinorUnits(-500, portfolioId: "main")
        let value = try await repo.getMonthlyContributionMinorUnits(portfolioId: "main")
        XCTAssertEqual(value, 0)
    }

    func testRecordContributionAppearsNewestFirst() async throws {
        let repo = makeRepo()
        let older = Date(timeIntervalSince1970: 1_600_000_000)
        let newer = Date(timeIntervalSince1970: 1_700_000_000)

        try await repo.recordContribution(100_00, portfolioId: "main", date: older)
        try await repo.recordContribution(200_00, portfolioId: "main", date: newer)

        let contributions = try await repo.getContributions(portfolioId: "main")
        XCTAssertEqual(contributions.count, 2)
        XCTAssertEqual(contributions.first?.amountMinorUnits, 200_00)
        XCTAssertEqual(contributions.last?.amountMinorUnits, 100_00)
    }

    func testPerformanceHistoryHasRequestedMonths() async throws {
        let repo = makeRepo()
        let history = try await repo.getPerformanceHistory(portfolioId: "main", months: 12)
        XCTAssertEqual(history.count, 12)
        // Oldest first; last point equals current total value.
        let portfolio = try await repo.getPortfolio(id: "main")!
        XCTAssertEqual(history.last?.valueMinorUnits, portfolio.totalValueMinorUnits)
    }

    func testPersistenceSurvivesNewInstance() async throws {
        let repo = makeRepo()
        try await repo.setMonthlyContributionMinorUnits(999_00, portfolioId: "main")

        let repo2 = makeRepo()
        let value = try await repo2.getMonthlyContributionMinorUnits(portfolioId: "main")
        XCTAssertEqual(value, 999_00)
    }

    func testDeleteAllClearsData() async throws {
        let repo = makeRepo()
        try await repo.deleteAllInvestments()

        // A fresh instance with seeding disabled should now see nothing.
        let repo2 = makeRepo(seedIfEmpty: false)
        let portfolios = try await repo2.getPortfolios()
        XCTAssertTrue(portfolios.isEmpty)
    }
}
