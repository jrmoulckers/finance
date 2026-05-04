// SPDX-License-Identifier: BUSL-1.1

// InvestmentPortfolioView.swift
// Finance
//
// Main investment portfolio screen with holdings list, total value,
// performance chart, and asset allocation breakdown. Accessible via
// the More menu in MainTabView.
//
// Uses Swift Charts for performance visualization and the IBM CVD-safe
// palette for accessible chart rendering.
//
// References: #1103

import Charts
import SwiftUI

// MARK: - View

/// Displays the user's investment portfolio with total value, performance
/// chart, asset allocation, and a list of individual holdings.
struct InvestmentPortfolioView: View {
    @State private var viewModel: InvestmentViewModel

    init(viewModel: InvestmentViewModel = InvestmentViewModel(
        repository: RepositoryProvider.shared.investments
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.portfolios.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else if viewModel.portfolios.isEmpty && !viewModel.isLoading {
                    EmptyStateView(
                        systemImage: "chart.line.uptrend.xyaxis",
                        title: String(localized: "No Investments"),
                        message: String(localized: "Add investment accounts to track your portfolio performance.")
                    )
                } else if let portfolio = viewModel.selectedPortfolio {
                    portfolioContent(portfolio)
                }
            }
            .navigationTitle(String(localized: "Investments"))
            .refreshable { await viewModel.loadPortfolios() }
            .task { await viewModel.loadPortfolios() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadPortfolios() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Portfolio Content

    private func portfolioContent(_ portfolio: PortfolioItem) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                portfolioSummaryCard(portfolio)
                performanceChart
                allocationSection
                holdingsList(portfolio)
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
    }

    // MARK: - Summary Card

    private func portfolioSummaryCard(_ portfolio: PortfolioItem) -> some View {
        VStack(spacing: 12) {
            Text(portfolio.name)
                .font(.headline)
                .foregroundStyle(.secondary)

            CurrencyLabel(
                amountInMinorUnits: portfolio.totalValueMinorUnits,
                currencyCode: portfolio.currencyCode,
                showSign: false,
                font: .largeTitle.bold()
            )

            HStack(spacing: 16) {
                VStack(spacing: 2) {
                    Text(String(localized: "Total Gain/Loss"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    CurrencyLabel(
                        amountInMinorUnits: portfolio.totalGainLossMinorUnits,
                        currencyCode: portfolio.currencyCode,
                        showSign: true,
                        font: .callout.bold()
                    )
                }

                if let returnPct = portfolio.totalReturnPercent {
                    VStack(spacing: 2) {
                        Text(String(localized: "Return"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(String(format: "%+.2f%%", returnPct))
                            .font(.callout.bold())
                            .foregroundStyle(portfolio.gainLossColor)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Portfolio summary"))
        .accessibilityValue(
            portfolio.totalReturnPercent.map {
                String(localized: "\(String(format: "%.1f", $0)) percent return")
            } ?? String(localized: "No return data")
        )
    }

    // MARK: - Performance Chart

    private var performanceChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Performance"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if viewModel.performanceHistory.isEmpty {
                Text(String(localized: "No performance data available."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else {
                Chart(viewModel.performanceHistory) { point in
                    LineMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Value"), Double(point.valueMinorUnits) / 100.0)
                    )
                    .foregroundStyle(ChartColorPalette.blue)
                    .interpolationMethod(.catmullRom)

                    AreaMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Value"), Double(point.valueMinorUnits) / 100.0)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [ChartColorPalette.blue.opacity(0.3), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let doubleValue = value.as(Double.self) {
                                Text("$\(Int(doubleValue / 1000))k")
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated))
                            .font(.caption2)
                    }
                }
                .frame(minHeight: 200)
                .drawingGroup()
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "Portfolio performance line chart"))
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Asset Allocation

    private var allocationSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Asset Allocation"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if viewModel.allocationSlices.isEmpty {
                Text(String(localized: "No allocation data available."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(viewModel.allocationSlices) { slice in
                    HStack(spacing: 12) {
                        Image(systemName: slice.assetClass.systemImage)
                            .font(.caption)
                            .foregroundStyle(slice.assetClass.color)
                            .frame(width: 24)

                        Text(slice.assetClass.displayName)
                            .font(.subheadline)

                        Spacer()

                        Text(String(format: "%.1f%%", slice.percentage))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        ProgressView(value: slice.percentage, total: 100)
                            .tint(slice.assetClass.color)
                            .frame(width: 60)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(slice.assetClass.displayName)
                    .accessibilityValue(String(localized: "\(String(format: "%.1f", slice.percentage)) percent of portfolio"))
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Holdings List

    private func holdingsList(_ portfolio: PortfolioItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Holdings"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ForEach(viewModel.sortedHoldings(for: portfolio)) { holding in
                NavigationLink(value: holding) {
                    holdingRow(holding)
                }
                .buttonStyle(.plain)
            }
        }
        .navigationDestination(for: HoldingItem.self) { holding in
            InvestmentDetailView(holding: holding, viewModel: viewModel)
        }
    }

    private func holdingRow(_ holding: HoldingItem) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(holding.symbol)
                    .font(.headline)
                Text(holding.name)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                CurrencyLabel(
                    amountInMinorUnits: holding.currentValueMinorUnits,
                    currencyCode: holding.currencyCode,
                    showSign: false,
                    font: .callout.bold()
                )
                HStack(spacing: 4) {
                    CurrencyLabel(
                        amountInMinorUnits: holding.gainLossMinorUnits,
                        currencyCode: holding.currencyCode,
                        showSign: true,
                        font: .caption
                    )
                    if let pct = holding.returnPercent {
                        Text(String(format: "(%+.1f%%)", pct))
                            .font(.caption)
                            .foregroundStyle(holding.gainLossColor)
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(holding.symbol), \(holding.name)")
        .accessibilityValue(
            holding.returnPercent.map {
                String(localized: "\(String(format: "%.1f", $0)) percent return")
            } ?? String(localized: "No return data")
        )
        .accessibilityHint(String(localized: "Shows holding details and price history"))
    }
}

#Preview {
    InvestmentPortfolioView(viewModel: InvestmentViewModel(
        repository: MockInvestmentRepository()
    ))
    .environment(BiometricAuthManager())
}
