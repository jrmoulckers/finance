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

    // MARK: - Contributions & Projection (#2118)

    /// Recurring monthly contribution for the selected portfolio, in minor units.
    var monthlyContributionMinorUnits: Int64 = 0

    /// Recorded contribution history for the selected portfolio, newest first.
    var contributions: [ContributionRecord] = []

    /// Projection horizon in whole years (adjustable by the investor).
    var projectionYears: Int = 20

    /// Expected nominal annual return, as a percentage (adjustable).
    var projectionAnnualReturnPercent: Double = 7

    /// Total money the investor has put in (cost basis) for the selected portfolio.
    var totalContributionsMinorUnits: Int64 { selectedPortfolio?.totalContributionsMinorUnits ?? 0 }

    /// Market growth (value minus contributed principal) for the selected portfolio.
    var marketReturnMinorUnits: Int64 { selectedPortfolio?.marketReturnMinorUnits ?? 0 }

    /// Compound-growth projection curve for the selected portfolio using the
    /// current balance, recurring monthly contribution, and adjustable
    /// return/horizon inputs.
    var projectionPoints: [ProjectionPoint] {
        guard let portfolio = selectedPortfolio else { return [] }
        return CompoundGrowthProjector.project(
            currentMinorUnits: portfolio.totalValueMinorUnits,
            monthlyContributionMinorUnits: monthlyContributionMinorUnits,
            annualReturnRate: projectionAnnualReturnPercent / 100.0,
            years: projectionYears
        )
    }

    /// The projected balance at the end of the projection horizon, in minor units.
    var projectedValueMinorUnits: Int64 {
        projectionPoints.last?.valueMinorUnits ?? (selectedPortfolio?.totalValueMinorUnits ?? 0)
    }

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
                await loadContributionData(for: first.id)
            }
        } catch {
            errorMessage = String(localized: "Failed to load investment data. Please try again.")
            Self.logger.error("Investment load failed: \(error.localizedDescription, privacy: .public)")
            portfolios = []
        }
    }

    /// Loads the recurring monthly contribution and contribution history for a
    /// portfolio. Failures are non-fatal — projections simply fall back to a
    /// zero contribution. (#2118)
    func loadContributionData(for portfolioId: String) async {
        do {
            monthlyContributionMinorUnits = try await repository.getMonthlyContributionMinorUnits(portfolioId: portfolioId)
            contributions = try await repository.getContributions(portfolioId: portfolioId)
        } catch {
            Self.logger.error("Contribution load failed: \(error.localizedDescription, privacy: .public)")
            monthlyContributionMinorUnits = 0
            contributions = []
        }
    }

    /// Persists a new recurring monthly contribution and refreshes projections.
    func updateMonthlyContribution(_ amountMinorUnits: Int64) async {
        guard let portfolioId = selectedPortfolio?.id else { return }
        let sanitised = max(0, amountMinorUnits)
        monthlyContributionMinorUnits = sanitised
        do {
            try await repository.setMonthlyContributionMinorUnits(sanitised, portfolioId: portfolioId)
        } catch {
            Self.logger.error("Failed to save monthly contribution: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Records a one-off contribution and reloads the contribution history.
    func recordContribution(_ amountMinorUnits: Int64, date: Date = .now) async {
        guard amountMinorUnits > 0, let portfolioId = selectedPortfolio?.id else { return }
        do {
            try await repository.recordContribution(amountMinorUnits, portfolioId: portfolioId, date: date)
            contributions = try await repository.getContributions(portfolioId: portfolioId)
        } catch {
            Self.logger.error("Failed to record contribution: \(error.localizedDescription, privacy: .public)")
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
