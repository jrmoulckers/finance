// SPDX-License-Identifier: BUSL-1.1

// InvestmentDetailView.swift
// Finance
//
// Individual holding detail view with price history chart, allocation
// percentage, and key metrics. Navigated to from the portfolio holdings list.
//
// References: #1103

import Charts
import SwiftUI

// MARK: - View

/// Displays detailed information about a single investment holding,
/// including price history, allocation percentage, and performance metrics.
struct InvestmentDetailView: View {
    let holding: HoldingItem
    let viewModel: InvestmentViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                headerSection
                metricsGrid
                priceHistorySection
                holdingInfoSection
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
        .navigationTitle(holding.symbol)
        .navigationBarTitleDisplayMode(.large)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: holding.assetClass.systemImage)
                    .font(.title2)
                    .foregroundStyle(holding.assetClass.color)
                Text(holding.name)
                    .font(.title3)
                    .fontWeight(.medium)
            }

            CurrencyLabel(
                amountInMinorUnits: holding.currentValueMinorUnits,
                currencyCode: holding.currencyCode,
                showSign: false,
                font: .largeTitle.bold()
            )

            HStack(spacing: 12) {
                CurrencyLabel(
                    amountInMinorUnits: holding.gainLossMinorUnits,
                    currencyCode: holding.currencyCode,
                    showSign: true,
                    font: .callout.bold()
                )

                if let pct = holding.returnPercent {
                    Text(String(format: "%+.2f%%", pct))
                        .font(.callout.bold())
                        .foregroundStyle(holding.gainLossColor)
                }
            }

            if let dailyPct = holding.dailyReturnPercent {
                Text(String(localized: "Today: \(String(format: "%+.2f%%", dailyPct))"))
                    .font(.caption)
                    .foregroundStyle(dailyPct >= 0 ? Color.green : Color.red)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(holding.symbol), \(holding.name)")
        .accessibilityValue(
            holding.returnPercent.map {
                String(localized: "\(String(format: "%.1f", $0)) percent total return")
            } ?? String(localized: "No return data")
        )
    }

    // MARK: - Metrics Grid

    private var metricsGrid: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
        ], spacing: 12) {
            metricCard(
                title: String(localized: "Shares"),
                value: "\(holding.quantity)",
                icon: "number"
            )
            metricCard(
                title: String(localized: "Cost Basis"),
                value: viewModel.formatCurrency(holding.costBasisMinorUnits, currencyCode: holding.currencyCode),
                icon: "banknote"
            )
            metricCard(
                title: String(localized: "Asset Class"),
                value: holding.assetClass.displayName,
                icon: holding.assetClass.systemImage
            )
            metricCard(
                title: String(localized: "Last Updated"),
                value: holding.lastUpdated.formatted(.dateTime.month(.abbreviated).day()),
                icon: "clock"
            )
        }
    }

    private func metricCard(title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(value)
                .font(.callout)
                .fontWeight(.medium)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }

    // MARK: - Price History

    private var priceHistorySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Price History"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if viewModel.performanceHistory.isEmpty {
                Text(String(localized: "No price history available."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 160)
            } else {
                Chart(viewModel.performanceHistory) { point in
                    LineMark(
                        x: .value(String(localized: "Date"), point.date),
                        y: .value(String(localized: "Value"), Double(point.valueMinorUnits) / 100.0)
                    )
                    .foregroundStyle(holding.gainLossColor)
                    .interpolationMethod(.catmullRom)
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text("$\(Int(v))")
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
                .frame(minHeight: 180)
                .drawingGroup()
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "Price history line chart for \(holding.symbol)"))
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Holding Info

    private var holdingInfoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Details"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            detailRow(
                label: String(localized: "Symbol"),
                value: holding.symbol
            )
            detailRow(
                label: String(localized: "Name"),
                value: holding.name
            )
            detailRow(
                label: String(localized: "Quantity"),
                value: "\(holding.quantity)"
            )
            detailRow(
                label: String(localized: "Current Value"),
                value: viewModel.formatCurrency(holding.currentValueMinorUnits, currencyCode: holding.currencyCode)
            )
            detailRow(
                label: String(localized: "Cost Basis"),
                value: viewModel.formatCurrency(holding.costBasisMinorUnits, currencyCode: holding.currencyCode)
            )
            detailRow(
                label: String(localized: "Gain/Loss"),
                value: viewModel.formatCurrency(holding.gainLossMinorUnits, currencyCode: holding.currencyCode, showSign: true)
            )
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func detailRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.subheadline)
                .fontWeight(.medium)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityValue(value)
    }
}

#Preview {
    NavigationStack {
        InvestmentDetailView(
            holding: HoldingItem(
                id: "h1", portfolioId: "p1", symbol: "AAPL", name: "Apple Inc.",
                assetClass: .stocks, quantity: 50,
                costBasisMinorUnits: 750_000, currentValueMinorUnits: 875_000,
                previousCloseMinorUnits: 870_000, currencyCode: "USD",
                lastUpdated: .now
            ),
            viewModel: InvestmentViewModel(repository: MockInvestmentRepository())
        )
    }
}
