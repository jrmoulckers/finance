// SPDX-License-Identifier: BUSL-1.1

// InvestmentViewModel.swift
// Finance
//
// ViewModel for the investment portfolio screens. Loads portfolio data
// from a repository, computes asset allocation, and provides performance
// history for chart rendering. Uses @Observable (iOS 17+).
//
// References: #1103

import Observation
import Foundation
import os

/// ViewModel for investment portfolio display and analysis.
///
/// Consumes ``InvestmentRepository`` for data access and computes
/// derived values like asset allocation and portfolio summary.
@Observable
final class InvestmentViewModel {
    private let repository: InvestmentRepository
    private let formatter: any SwiftExportFormatterModule

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "InvestmentViewModel"
    )

    var portfolios: [PortfolioItem] = []
    var selectedPortfolio: PortfolioItem?
    var allocationSlices: [AllocationSlice] = []
    var performanceHistory: [PerformanceDataPoint] = []
    var isLoading = false
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    /// Formats a monetary amount using the Swift Export formatter module.
    func formatCurrency(_ amountMinorUnits: Int64, currencyCode: String = "USD", showSign: Bool = false) -> String {
        formatter.format(
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            showSign: showSign
        )
    }

    init(
        repository: InvestmentRepository,
        formatter: any SwiftExportFormatterModule = SwiftExportBridgeProvider.shared.formatter
    ) {
        self.repository = repository
        self.formatter = formatter
    }

    /// Loads all portfolios and selects the first one.
    func loadPortfolios() async {
        isLoading = true
        defer { isLoading = false }

        do {
            portfolios = try await repository.getPortfolios()
            if let first = portfolios.first {
                selectedPortfolio = first
                computeAllocation(for: first)
                await loadPerformanceHistory(for: first.id)
            }
        } catch {
            errorMessage = String(localized: "Failed to load investment data. Please try again.")
            Self.logger.error("Investment load failed: \(error.localizedDescription, privacy: .public)")
            portfolios = []
        }
    }

    /// Loads performance history for a given portfolio.
    func loadPerformanceHistory(for portfolioId: String, months: Int = 12) async {
        do {
            performanceHistory = try await repository.getPerformanceHistory(
                portfolioId: portfolioId, months: months
            )
        } catch {
            Self.logger.error("Performance history load failed: \(error.localizedDescription, privacy: .public)")
            performanceHistory = []
        }
    }

    /// Computes asset allocation slices from portfolio holdings.
    private func computeAllocation(for portfolio: PortfolioItem) {
        let totalValue = portfolio.totalValueMinorUnits
        guard totalValue > 0 else {
            allocationSlices = []
            return
        }

        let grouped = Dictionary(grouping: portfolio.holdings) { $0.assetClass }
        allocationSlices = grouped.map { assetClass, holdings in
            let classValue = holdings.reduce(Int64(0)) { $0 + $1.currentValueMinorUnits }
            let percentage = (Double(classValue) / Double(totalValue)) * 100.0
            return AllocationSlice(
                assetClass: assetClass,
                percentage: percentage,
                valueMinorUnits: classValue
            )
        }
        .sorted { $0.percentage > $1.percentage }
    }

    /// Returns holdings sorted by current value descending.
    func sortedHoldings(for portfolio: PortfolioItem) -> [HoldingItem] {
        portfolio.holdings.sorted { $0.currentValueMinorUnits > $1.currentValueMinorUnits }
    }

    /// Returns the top N gainers from the portfolio.
    func topGainers(from portfolio: PortfolioItem, count: Int = 3) -> [HoldingItem] {
        portfolio.holdings
            .filter { $0.gainLossMinorUnits > 0 }
            .sorted { $0.gainLossMinorUnits > $1.gainLossMinorUnits }
            .prefix(count)
            .map { $0 }
    }

    /// Returns the top N losers from the portfolio.
    func topLosers(from portfolio: PortfolioItem, count: Int = 3) -> [HoldingItem] {
        portfolio.holdings
            .filter { $0.gainLossMinorUnits < 0 }
            .sorted { $0.gainLossMinorUnits < $1.gainLossMinorUnits }
            .prefix(count)
            .map { $0 }
    }
}
