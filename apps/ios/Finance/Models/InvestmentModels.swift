// SPDX-License-Identifier: BUSL-1.1

// InvestmentModels.swift
// Finance
//
// Data models for investment portfolio tracking. Maps KMP shared types
// (InvestmentEngine.kt) to Swift-native structs for SwiftUI consumption.
// All monetary values are in minor units (cents).
//
// References: #1103

import SwiftUI

// MARK: - Asset Class

/// Classification of an investment holding, mirroring KMP `AssetClass`.
enum AssetClassUI: String, CaseIterable, Hashable, Sendable {
    case stocks, bonds, cash, realEstate, commodities, crypto, alternatives, other

    var displayName: String {
        switch self {
        case .stocks: String(localized: "Stocks")
        case .bonds: String(localized: "Bonds")
        case .cash: String(localized: "Cash")
        case .realEstate: String(localized: "Real Estate")
        case .commodities: String(localized: "Commodities")
        case .crypto: String(localized: "Crypto")
        case .alternatives: String(localized: "Alternatives")
        case .other: String(localized: "Other")
        }
    }

    var systemImage: String {
        switch self {
        case .stocks: "chart.line.uptrend.xyaxis"
        case .bonds: "doc.text"
        case .cash: "dollarsign.circle"
        case .realEstate: "house"
        case .commodities: "shippingbox"
        case .crypto: "bitcoinsign.circle"
        case .alternatives: "cube"
        case .other: "ellipsis.circle"
        }
    }

    var color: Color {
        switch self {
        case .stocks: ChartColorPalette.blue
        case .bonds: ChartColorPalette.purple
        case .cash: ChartColorPalette.teal
        case .realEstate: ChartColorPalette.orange
        case .commodities: ChartColorPalette.gold
        case .crypto: ChartColorPalette.magenta
        case .alternatives: Color.indigo
        case .other: Color.gray
        }
    }
}

// MARK: - Holding Item

/// A single investment holding within a portfolio.
///
/// Conforms to `Hashable` for use as a `NavigationLink` value type.
struct HoldingItem: Identifiable, Hashable, Sendable {
    let id: String
    let portfolioId: String
    let symbol: String
    let name: String
    let assetClass: AssetClassUI
    let quantity: Int64
    let costBasisMinorUnits: Int64
    let currentValueMinorUnits: Int64
    let previousCloseMinorUnits: Int64?
    let currencyCode: String
    let lastUpdated: Date

    /// Unrealised gain/loss in minor units.
    var gainLossMinorUnits: Int64 { currentValueMinorUnits - costBasisMinorUnits }

    /// Whether the holding is in profit.
    var isProfit: Bool { currentValueMinorUnits > costBasisMinorUnits }

    /// Total return as a percentage, or `nil` if cost basis is zero.
    var returnPercent: Double? {
        guard costBasisMinorUnits != 0 else { return nil }
        return (Double(currentValueMinorUnits - costBasisMinorUnits) / Double(costBasisMinorUnits)) * 100.0
    }

    /// Daily return percentage based on previous close.
    var dailyReturnPercent: Double? {
        guard let prev = previousCloseMinorUnits, prev != 0 else { return nil }
        return (Double(currentValueMinorUnits - prev) / Double(prev)) * 100.0
    }

    /// Color for the gain/loss indicator.
    var gainLossColor: Color {
        if gainLossMinorUnits > 0 { return .green }
        if gainLossMinorUnits < 0 { return .red }
        return .primary
    }
}

// MARK: - Portfolio Item

/// A user's investment portfolio containing multiple holdings.
struct PortfolioItem: Identifiable, Sendable {
    let id: String
    let name: String
    let holdings: [HoldingItem]
    let currencyCode: String
    let createdAt: Date

    /// Total portfolio value in minor units.
    var totalValueMinorUnits: Int64 { holdings.reduce(0) { $0 + $1.currentValueMinorUnits } }

    /// Total cost basis in minor units.
    var totalCostBasisMinorUnits: Int64 { holdings.reduce(0) { $0 + $1.costBasisMinorUnits } }

    /// Total unrealised gain/loss in minor units.
    var totalGainLossMinorUnits: Int64 { totalValueMinorUnits - totalCostBasisMinorUnits }

    /// Total return percentage, or `nil` if cost basis is zero.
    var totalReturnPercent: Double? {
        guard totalCostBasisMinorUnits != 0 else { return nil }
        return (Double(totalGainLossMinorUnits) / Double(totalCostBasisMinorUnits)) * 100.0
    }

    /// Whether the portfolio is in overall profit.
    var isProfit: Bool { totalGainLossMinorUnits > 0 }

    /// Color for the total gain/loss indicator.
    var gainLossColor: Color {
        if totalGainLossMinorUnits > 0 { return .green }
        if totalGainLossMinorUnits < 0 { return .red }
        return .primary
    }
}

// MARK: - Allocation Slice

/// A single slice of the asset allocation pie chart.
struct AllocationSlice: Identifiable, Sendable {
    let id = UUID()
    let assetClass: AssetClassUI
    let percentage: Double
    let valueMinorUnits: Int64
}

// MARK: - Performance Data Point

/// A data point for the portfolio performance line chart.
struct PerformanceDataPoint: Identifiable, Sendable {
    let id = UUID()
    let date: Date
    let valueMinorUnits: Int64
}
