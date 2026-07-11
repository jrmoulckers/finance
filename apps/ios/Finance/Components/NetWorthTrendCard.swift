// SPDX-License-Identifier: BUSL-1.1

// NetWorthTrendCard.swift
// Finance
//
// Dashboard card presenting a clean net-worth growth chart with a range
// selector and a one-line forward projection. Keeps the Dashboard screen thin
// by owning the trend section's layout, range picker, and projection summary.
//
// References: #2116, #2115

import SwiftUI

/// A dashboard section showing the net-worth growth chart, a range selector,
/// and a compact projection summary.
struct NetWorthTrendCard: View {
    @Bindable var viewModel: DashboardViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
            header

            NetWorthTrendChart(
                history: viewModel.netWorthTrendPoints,
                projection: viewModel.netWorthProjectionPoints,
                currencyCode: viewModel.currencyCode
            )

            projectionSummary
        }
        .padding()
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
        .accessibilityIdentifier("net_worth_trend_card")
    }

    private var header: some View {
        HStack {
            Text(String(localized: "Net Worth Growth"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            rangePicker
        }
    }

    private var rangePicker: some View {
        Picker(String(localized: "Range"), selection: $viewModel.netWorthTrendRange) {
            ForEach(NetWorthTrendRange.allCases) { range in
                Text(range.shortLabel).tag(range)
            }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 200)
        .accessibilityLabel(String(localized: "Trend range"))
        .accessibilityHint(String(localized: "Choose how far back the net worth chart looks"))
    }

    /// One-line, non-colour-dependent projection callout.
    private var projectionSummary: some View {
        let projected = CurrencyLabel.formatted(
            minorUnits: viewModel.projectedNetWorthMinorUnits,
            currencyCode: viewModel.currencyCode
        )
        let pace = CurrencyLabel.formatted(
            minorUnits: viewModel.averageMonthlySavingsMinorUnits,
            currencyCode: viewModel.currencyCode
        )
        return HStack(spacing: 6) {
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "Projected \(projected) in 12 months at \(pace) per month"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "Projected net worth \(projected) in twelve months, saving \(pace) per month"))
    }
}
