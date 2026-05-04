// SPDX-License-Identifier: BUSL-1.1

// MockInvestmentRepository.swift
// Finance
//
// In-memory mock implementation of InvestmentRepository.
// TODO: Replace MockInvestmentRepository with KMP-backed repository
// that reads from SQLDelight via the Swift Export bridge.
//
// References: #1103

import Foundation

/// Returns hardcoded sample investment data for development and SwiftUI previews.
struct MockInvestmentRepository: InvestmentRepository {

    private static let sampleHoldings: [HoldingItem] = [
        HoldingItem(
            id: "h1", portfolioId: "p1", symbol: "AAPL", name: "Apple Inc.",
            assetClass: .stocks, quantity: 50,
            costBasisMinorUnits: 750_000, currentValueMinorUnits: 875_000,
            previousCloseMinorUnits: 870_000, currencyCode: "USD",
            lastUpdated: .now
        ),
        HoldingItem(
            id: "h2", portfolioId: "p1", symbol: "MSFT", name: "Microsoft Corp.",
            assetClass: .stocks, quantity: 30,
            costBasisMinorUnits: 900_000, currentValueMinorUnits: 1_125_000,
            previousCloseMinorUnits: 1_110_000, currencyCode: "USD",
            lastUpdated: .now
        ),
        HoldingItem(
            id: "h3", portfolioId: "p1", symbol: "BND", name: "Vanguard Total Bond ETF",
            assetClass: .bonds, quantity: 100,
            costBasisMinorUnits: 800_000, currentValueMinorUnits: 785_000,
            previousCloseMinorUnits: 790_000, currencyCode: "USD",
            lastUpdated: .now
        ),
        HoldingItem(
            id: "h4", portfolioId: "p1", symbol: "VNQ", name: "Vanguard Real Estate ETF",
            assetClass: .realEstate, quantity: 40,
            costBasisMinorUnits: 320_000, currentValueMinorUnits: 340_000,
            previousCloseMinorUnits: 338_000, currencyCode: "USD",
            lastUpdated: .now
        ),
        HoldingItem(
            id: "h5", portfolioId: "p1", symbol: "GLD", name: "SPDR Gold Shares",
            assetClass: .commodities, quantity: 20,
            costBasisMinorUnits: 360_000, currentValueMinorUnits: 395_000,
            previousCloseMinorUnits: 392_000, currencyCode: "USD",
            lastUpdated: .now
        ),
        HoldingItem(
            id: "h6", portfolioId: "p1", symbol: "USDC", name: "USD Coin",
            assetClass: .cash, quantity: 5000,
            costBasisMinorUnits: 500_000, currentValueMinorUnits: 500_000,
            previousCloseMinorUnits: 500_000, currencyCode: "USD",
            lastUpdated: .now
        ),
    ]

    func getPortfolios() async throws -> [PortfolioItem] {
        [
            PortfolioItem(
                id: "p1", name: "Main Portfolio",
                holdings: Self.sampleHoldings,
                currencyCode: "USD",
                createdAt: Calendar.current.date(byAdding: .year, value: -2, to: .now) ?? .now
            ),
        ]
    }

    func getPortfolio(id: String) async throws -> PortfolioItem? {
        try await getPortfolios().first { $0.id == id }
    }

    func getHoldings(portfolioId: String) async throws -> [HoldingItem] {
        Self.sampleHoldings.filter { $0.portfolioId == portfolioId }
    }

    func getHolding(id: String) async throws -> HoldingItem? {
        Self.sampleHoldings.first { $0.id == id }
    }

    func getPerformanceHistory(portfolioId: String, months: Int) async throws -> [PerformanceDataPoint] {
        let calendar = Calendar.current
        let now = Date.now
        let baseValue: Int64 = 3_500_000
        return (0..<months).reversed().map { offset in
            let date = calendar.date(byAdding: .month, value: -offset, to: now) ?? now
            // Simulate growth with some variance
            let growth = Double(months - offset) / Double(months)
            let variance = Int64.random(in: -50_000...50_000)
            let value = baseValue + Int64(Double(baseValue) * growth * 0.15) + variance
            return PerformanceDataPoint(date: date, valueMinorUnits: value)
        }
    }

    func deleteAllInvestments() async throws { }
}
