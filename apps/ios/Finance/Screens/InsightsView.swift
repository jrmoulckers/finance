// SPDX-License-Identifier: BUSL-1.1

// InsightsView.swift
// Finance
//
// Financial Insights screen showing spending analysis, category breakdown,
// trend charts, and actionable recommendations.
//
// Uses Swift Charts, @Observable ViewModel, and full accessibility support.
//
// References: #241

import Charts
import SwiftUI

struct InsightsView: View {
    @State private var viewModel = InsightsViewModel()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView(String(localized: "Analyzing your finances…"))
                        .accessibilityLabel(String(localized: "Loading financial insights"))
                } else if let summary = viewModel.summary {
                    insightsContent(summary)
                } else {
                    EmptyStateView(
                        systemImage: "lightbulb",
                        title: String(localized: "No Insights Yet"),
                        message: String(localized: "Add transactions to see personalized financial insights and recommendations.")
                    )
                }
            }
            .navigationTitle(String(localized: "Insights"))
            .task {
                await viewModel.loadInsights()
            }
            .refreshable {
                await viewModel.loadInsights()
            }
            .alert(
                String(localized: "Error"),
                isPresented: .init(
                    get: { viewModel.showError },
                    set: { if !$0 { viewModel.dismissError() } }
                )
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private func insightsContent(_ summary: InsightsSummary) -> some View {
        ScrollView {
            LazyVStack(spacing: 20) {
                overviewCards(summary)
                spendingBreakdownSection(summary)
                trendChartSection(summary)
                insightsListSection(summary)
            }
            .padding()
        }
    }

    // MARK: - Overview Cards

    @ViewBuilder
    private func overviewCards(_ summary: InsightsSummary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "This Month"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                metricCard(
                    title: String(localized: "Income"),
                    value: viewModel.formatCurrency(summary.totalIncomeMinorUnits),
                    icon: "arrow.down.left",
                    color: FinanceColors.amountPositive
                )
                metricCard(
                    title: String(localized: "Spending"),
                    value: viewModel.formatCurrency(summary.totalSpendingMinorUnits),
                    icon: "arrow.up.right",
                    color: FinanceColors.amountNegative
                )
                metricCard(
                    title: String(localized: "Net Cash Flow"),
                    value: viewModel.formatSignedCurrency(summary.netCashFlowMinorUnits),
                    icon: "arrow.left.arrow.right",
                    color: summary.netCashFlowMinorUnits >= 0
                        ? FinanceColors.amountPositive
                        : FinanceColors.amountNegative
                )
                metricCard(
                    title: String(localized: "Savings Rate"),
                    value: String(format: "%.1f%%", summary.savingsRatePercent),
                    icon: "leaf",
                    color: summary.savingsRatePercent >= 20
                        ? FinanceColors.statusPositive
                        : FinanceColors.statusWarning
                )
            }
        }
    }

    private func metricCard(
        title: String,
        value: String,
        icon: String,
        color: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(color)
                .accessibilityHidden(true)

            Text(value)
                .font(.title3)
                .fontWeight(.semibold)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(value)")
    }

    // MARK: - Spending Breakdown

    @ViewBuilder
    private func spendingBreakdownSection(_ summary: InsightsSummary) -> some View {
        if !summary.spendingBreakdown.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "Spending by Category"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Chart(summary.spendingBreakdown) { item in
                    SectorMark(
                        angle: .value(
                            String(localized: "Amount"),
                            item.amountMinorUnits
                        ),
                        innerRadius: .ratio(0.618),
                        angularInset: 1.5
                    )
                    .foregroundStyle(item.color)
                    .cornerRadius(4)
                    .annotation(position: .overlay) {
                        if item.percentOfTotal > 10 {
                            Text(String(format: "%.0f%%", item.percentOfTotal))
                                .font(.caption2)
                                .fontWeight(.bold)
                                .foregroundStyle(.white)
                        }
                    }
                }
                .frame(height: 200)
                .accessibilityLabel(String(localized: "Spending breakdown chart"))
                .accessibilityHint(String(localized: "Shows spending distribution across categories"))

                // Legend
                ForEach(summary.spendingBreakdown) { item in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(item.color)
                            .frame(width: 10, height: 10)
                            .accessibilityHidden(true)

                        Image(systemName: item.categoryIcon)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(width: 20)
                            .accessibilityHidden(true)

                        Text(item.categoryName)
                            .font(.subheadline)

                        Spacer()

                        Text(viewModel.formatCurrency(item.amountMinorUnits))
                            .font(.subheadline)
                            .fontWeight(.medium)

                        Text(String(format: "%.1f%%", item.percentOfTotal))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(width: 44, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        String(localized: "\(item.categoryName): \(viewModel.formatCurrency(item.amountMinorUnits)), \(String(format: "%.1f", item.percentOfTotal)) percent")
                    )
                }
            }
        }
    }

    // MARK: - Trend Chart

    @ViewBuilder
    private func trendChartSection(_ summary: InsightsSummary) -> some View {
        if !summary.monthlySpendingTrend.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "Monthly Spending Trend"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Chart(summary.monthlySpendingTrend) { point in
                    BarMark(
                        x: .value(
                            String(localized: "Month"),
                            point.month, unit: .month
                        ),
                        y: .value(
                            String(localized: "Spending"),
                            Double(point.amountMinorUnits) / 100.0
                        )
                    )
                    .foregroundStyle(FinanceColors.interactive.gradient)
                    .cornerRadius(4)
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        if let amount = value.as(Double.self) {
                            AxisValueLabel {
                                Text(viewModel.formatCurrency(Int64(amount * 100)))
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month)) { value in
                        if let date = value.as(Date.self) {
                            AxisValueLabel {
                                Text(date.formatted(.dateTime.month(.abbreviated)))
                                    .font(.caption2)
                            }
                        }
                    }
                }
                .frame(height: 180)
                .accessibilityLabel(String(localized: "Monthly spending trend chart"))
                .accessibilityHint(String(localized: "Bar chart showing spending over the last 6 months"))
            }
        }
    }

    // MARK: - Insights List

    @ViewBuilder
    private func insightsListSection(_ summary: InsightsSummary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(String(localized: "Insights"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Spacer()

                Picker(
                    String(localized: "Filter"),
                    selection: $viewModel.selectedFilter
                ) {
                    ForEach(InsightFilter.allCases, id: \.self) { filter in
                        Text(filter.displayName).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 240)
                .accessibilityLabel(String(localized: "Filter insights"))
            }

            if viewModel.filteredInsights.isEmpty {
                Text(String(localized: "No insights match this filter."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                ForEach(viewModel.filteredInsights) { insight in
                    insightRow(insight)
                }
            }
        }
    }

    private func insightRow(_ insight: FinancialInsight) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: insight.type.systemImage)
                .font(.title3)
                .foregroundStyle(insight.type.color)
                .frame(width: 32, height: 32)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(insight.title)
                        .font(.subheadline)
                        .fontWeight(.semibold)

                    Spacer()

                    severityBadge(insight.severity)
                }

                Text(insight.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let change = insight.percentChange {
                    HStack(spacing: 4) {
                        Image(systemName: change >= 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.caption2)
                        Text(String(format: "%+.1f%%", change))
                            .font(.caption)
                            .fontWeight(.medium)
                    }
                    .foregroundStyle(change > 0 && insight.type == .categorySpike ? .red : .green)
                    .accessibilityLabel(String(localized: "\(String(format: "%.1f", abs(change))) percent \(change >= 0 ? "increase" : "decrease")"))
                }
            }
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "\(insight.severity.displayName) \(insight.type.displayName): \(insight.title)")
        )
        .accessibilityHint(insight.description)
    }

    private func severityBadge(_ severity: InsightSeverity) -> some View {
        Text(severity.displayName)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(severityColor(severity).opacity(0.15))
            .foregroundStyle(severityColor(severity))
            .clipShape(Capsule())
            .accessibilityHidden(true) // Included in parent label
    }

    private func severityColor(_ severity: InsightSeverity) -> Color {
        switch severity {
        case .info: FinanceColors.statusInfo
        case .suggestion: FinanceColors.statusPositive
        case .warning: FinanceColors.statusWarning
        case .critical: FinanceColors.statusNegative
        }
    }
}

// MARK: - Preview

#Preview("Insights View") {
    InsightsView()
}
