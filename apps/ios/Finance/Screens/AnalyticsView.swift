// SPDX-License-Identifier: BUSL-1.1

// AnalyticsView.swift
// Finance
//
// Advanced analytics screen with trend predictions, anomaly detection,
// category insights, and interactive charts.
//
// Uses SwiftUI Charts, @Observable ViewModel, and follows Apple HIG
// for navigation and accessibility.
//
// References: #269

import Charts
import SwiftUI

struct AnalyticsView: View {
    @State private var viewModel: AnalyticsViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        transactionRepository: TransactionRepository,
        accountRepository: AccountRepository
    ) {
        _viewModel = State(initialValue: AnalyticsViewModel(
            transactionRepository: transactionRepository,
            accountRepository: accountRepository
        ))
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView(String(localized: "Analyzing your finances…"))
                        .accessibilityLabel(String(localized: "Loading analytics"))
                } else if let summary = viewModel.summary {
                    analyticsContent(summary)
                } else {
                    EmptyStateView(
                        systemImage: "chart.line.uptrend.xyaxis",
                        title: String(localized: "No Analytics"),
                        message: String(localized: "Add transactions to see spending insights and predictions.")
                    )
                }
            }
            .navigationTitle(String(localized: "Analytics"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    periodPicker
                }
            }
            .task {
                await viewModel.loadAnalytics()
            }
            .refreshable {
                await viewModel.loadAnalytics()
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
            .onChange(of: viewModel.selectedPeriod) {
                Task { await viewModel.loadAnalytics() }
            }
        }
    }

    // MARK: - Period Picker

    private var periodPicker: some View {
        Menu {
            ForEach(AnalyticsPeriod.allCases, id: \.self) { period in
                Button {
                    viewModel.selectedPeriod = period
                } label: {
                    HStack {
                        Text(period.displayName)
                        if period == viewModel.selectedPeriod {
                            Image(systemName: "checkmark")
                        }
                    }
                }
                .accessibilityLabel(period.displayName)
            }
        } label: {
            Label(
                viewModel.selectedPeriod.rawValue,
                systemImage: "calendar"
            )
            .accessibilityLabel(String(localized: "Time period"))
            .accessibilityValue(viewModel.selectedPeriod.displayName)
        }
    }

    // MARK: - Main Content

    @ViewBuilder
    private func analyticsContent(_ summary: AnalyticsSummary) -> some View {
        ScrollView {
            LazyVStack(spacing: 20) {
                summaryCards(summary)
                predictionSection(summary)
                anomalySection(summary)
                categoryTrendsSection(summary)
            }
            .padding()
        }
    }

    // MARK: - Summary Cards

    @ViewBuilder
    private func summaryCards(_ summary: AnalyticsSummary) -> some View {
        VStack(spacing: 12) {
            Text(String(localized: "Monthly Overview"))
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                summaryCard(
                    title: String(localized: "Avg. Spending"),
                    value: viewModel.formatCurrency(summary.averageMonthlySpending),
                    icon: "arrow.up.right",
                    color: .red
                )

                summaryCard(
                    title: String(localized: "Avg. Income"),
                    value: viewModel.formatCurrency(summary.averageMonthlyIncome),
                    icon: "arrow.down.left",
                    color: .green
                )

                summaryCard(
                    title: String(localized: "Projected"),
                    value: viewModel.formatCurrency(summary.projectedMonthEndSpending),
                    icon: "chart.line.uptrend.xyaxis",
                    color: ChartColorPalette.purple
                )

                summaryCard(
                    title: String(localized: "Savings Rate"),
                    value: String(format: "%.1f%%", summary.savingsRatePercent),
                    icon: "leaf",
                    color: summary.savingsRatePercent >= 20 ? .green : .orange
                )
            }
        }
    }

    private func summaryCard(
        title: String,
        value: String,
        icon: String,
        color: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(color)
                    .font(.caption)
                Spacer()
            }
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
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(value)")
    }

    // MARK: - Prediction Section

    @ViewBuilder
    private func predictionSection(_ summary: AnalyticsSummary) -> some View {
        if !summary.predictions.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "Spending Forecast"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                PredictionChart(
                    historicalData: summary.topCategories.flatMap { trend in
                        trend.monthlyAmounts.map { monthly in
                            TrendDataPoint(
                                date: monthly.month,
                                value: Double(monthly.amountMinorUnits) / 100.0,
                                series: String(localized: "Historical")
                            )
                        }
                    },
                    predictions: summary.predictions,
                    currencyCode: summary.currencyCode
                )

                ForEach(summary.predictions) { prediction in
                    HStack {
                        Text(prediction.date.formatted(.dateTime.month(.wide).year()))
                            .font(.subheadline)
                        Spacer()
                        VStack(alignment: .trailing) {
                            Text(viewModel.formatCurrency(prediction.predictedMinorUnits))
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Text(String(
                                localized: "\(String(format: "%.0f", prediction.confidencePercent))% confidence"
                            ))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(
                        String(localized: "\(prediction.date.formatted(.dateTime.month(.wide).year())) predicted spending")
                    )
                    .accessibilityValue(viewModel.formatCurrency(prediction.predictedMinorUnits))
                }
            }
        }
    }

    // MARK: - Anomaly Section

    @ViewBuilder
    private func anomalySection(_ summary: AnalyticsSummary) -> some View {
        if !summary.anomalies.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Label(
                    String(localized: "Unusual Spending"),
                    systemImage: "exclamationmark.triangle"
                )
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

                ForEach(summary.anomalies) { anomaly in
                    AnomalyCard(
                        anomaly: anomaly,
                        formatCurrency: viewModel.formatCurrency
                    )
                }
            }
        }
    }

    // MARK: - Category Trends Section

    @ViewBuilder
    private func categoryTrendsSection(_ summary: AnalyticsSummary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Category Trends"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ForEach(summary.topCategories) { trend in
                categoryTrendRow(trend)
            }
        }
    }

    private func categoryTrendRow(_ trend: CategoryTrend) -> some View {
        HStack(spacing: 12) {
            Image(systemName: trend.categoryIcon)
                .font(.title3)
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 32)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(trend.categoryName)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Text(String(localized: "Avg. \(viewModel.formatCurrency(trend.averageMinorUnits))/mo"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            HStack(spacing: 4) {
                Image(systemName: trend.isTrendingUp ? "arrow.up.right" : "arrow.down.right")
                    .font(.caption)
                    .foregroundStyle(trend.isTrendingUp ? .red : .green)
                    .accessibilityHidden(true)

                Text(String(
                    format: "%+.1f%%",
                    trend.monthOverMonthChangePercent
                ))
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(trend.isTrendingUp ? .red : .green)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "\(trend.categoryName) spending trend")
        )
        .accessibilityValue(
            String(localized: "Average \(viewModel.formatCurrency(trend.averageMinorUnits)) per month, \(String(format: "%+.1f", trend.monthOverMonthChangePercent)) percent change")
        )
    }
}

#Preview("Analytics View") {
    AnalyticsView(
        transactionRepository: StubTransactionRepository(),
        accountRepository: StubAccountRepository()
    )
}
