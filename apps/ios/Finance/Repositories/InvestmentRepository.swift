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

    /// Permanently deletes all investment data. Used for GDPR "Delete Everything".
    func deleteAllInvestments() async throws
}
