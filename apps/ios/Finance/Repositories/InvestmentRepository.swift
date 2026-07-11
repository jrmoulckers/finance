// SPDX-License-Identifier: BUSL-1.1

// InvestmentRepository.swift
// Finance
//
// Protocol defining the data-access contract for investment portfolios.
// Swap the concrete implementation to move from mock data to a
// KMP-backed repository without changing any ViewModel or View code.
//
// References: #1103

import Foundation

/// Data-access contract for investment portfolios and holdings.
///
/// All methods are `async throws` so implementations can perform
/// network, database, or KMP bridge calls transparently.
protocol InvestmentRepository: Sendable {

    /// Returns all portfolios for the current user.
    func getPortfolios() async throws -> [PortfolioItem]

    /// Returns a single portfolio by its identifier, or `nil` if not found.
    func getPortfolio(id: String) async throws -> PortfolioItem?

    /// Returns all holdings for a given portfolio.
    func getHoldings(portfolioId: String) async throws -> [HoldingItem]

    /// Returns a single holding by its identifier, or `nil` if not found.
    func getHolding(id: String) async throws -> HoldingItem?

    /// Returns simulated performance history for a portfolio.
    func getPerformanceHistory(portfolioId: String, months: Int) async throws -> [PerformanceDataPoint]

    /// Returns the recurring monthly contribution for a portfolio, in minor units.
    func getMonthlyContributionMinorUnits(portfolioId: String) async throws -> Int64

    /// Persists the recurring monthly contribution for a portfolio.
    func setMonthlyContributionMinorUnits(_ amountMinorUnits: Int64, portfolioId: String) async throws

    /// Records a one-off contribution (deposit) into a portfolio.
    func recordContribution(_ amountMinorUnits: Int64, portfolioId: String, date: Date) async throws

    /// Returns the recorded contribution history for a portfolio, newest first.
    func getContributions(portfolioId: String) async throws -> [ContributionRecord]

    /// Permanently deletes all investment data. Used for GDPR "Delete Everything".
    func deleteAllInvestments() async throws
}

// MARK: - Default Contribution Handling

/// Default no-op contribution handling so repositories that do not track
/// contributions (e.g. the mock) conform without extra boilerplate. Persisted
/// implementations override these.
extension InvestmentRepository {
    func getMonthlyContributionMinorUnits(portfolioId: String) async throws -> Int64 { 0 }
    func setMonthlyContributionMinorUnits(_ amountMinorUnits: Int64, portfolioId: String) async throws {}
    func recordContribution(_ amountMinorUnits: Int64, portfolioId: String, date: Date) async throws {}
    func getContributions(portfolioId: String) async throws -> [ContributionRecord] { [] }
}
