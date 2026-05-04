// SPDX-License-Identifier: BUSL-1.1

// ReportResultView.swift
// Finance
//
// Generated report display with charts and data tables. Shows results
// from ReportBuilderView's configuration using Swift Charts with
// the IBM CVD-safe palette.
//
// References: #1111

import Charts
import SwiftUI

// MARK: - View

/// Displays the generated report with appropriate charts and data tables
/// based on the report type selected in ``ReportBuilderView``.
struct ReportResultView: View {
    let result: ReportResult
    let viewModel: ReportBuilderViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                reportHeader
                reportChart
                reportDataTable
            }
            .padding(.horizontal)
            .padding(.bottom, 20)
        }
        .navigationTitle(result.configuration.reportType.displayName)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Header

    private var reportHeader: some View {
        VStack(spacing: 8) {
            Image(systemName: result.configuration.reportType.systemImage)
                .font(.largeTitle)
                .foregroundStyle(.blue)

            Text(result.configuration.reportType.displayName)
                .font(.title2)
                .fontWeight(.bold)

            Text(String(localized: "Period: \(result.configuration.dateRange.displayName)"))
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Text(String(localized: "Generated \(result.generatedAt.formatted(.dateTime.month(.abbreviated).day().hour().minute()))"))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "\(result.configuration.reportType.displayName) report"))
        .accessibilityValue(String(localized: "Period: \(result.configuration.dateRange.displayName)"))
    }

    // MARK: - Chart

    @ViewBuilder
    private var reportChart: some View {
        switch result.configuration.reportType {
        case .spendingByCategory:
            spendingByCategoryChart
        case .incomeVsExpense:
            incomeVsExpenseChart
        case .netWorth:
            netWorthChart
        case .categoryTrends:
            incomeVsExpenseChart
        }
    }

    private var spendingByCategoryChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Spending Distribution"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if result.categorySpending.isEmpty {
                emptyChartPlaceholder
            } else {
                Chart(result.categorySpending) { entry in
                    SectorMark(
                        angle: .value(String(localized: "Amount"), entry.amountMinorUnits),
                        innerRadius: .ratio(0.6),
                        angularInset: 2.0
                    )
                    .foregroundStyle(ChartColorPalette.color(at: entry.colorIndex))
                    .annotation(position: .overlay) {
                        Text(String(format: "%.0f%%", entry.percentage))
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                    }
                    .accessibilityLabel(entry.categoryName)
                    .accessibilityValue(String(localized: "\(String(format: "%.1f", entry.percentage)) percent"))
                }
                .frame(minHeight: 250)
                .drawingGroup()
                .accessibilityElement(children: .contain)
                .accessibilityLabel(String(localized: "Spending by category pie chart"))

                // Legend
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(result.categorySpending) { entry in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(ChartColorPalette.color(at: entry.colorIndex))
                                .frame(width: 10, height: 10)
                            Text(entry.categoryName)
                                .font(.caption)
                                .lineLimit(1)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(entry.categoryName)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var incomeVsExpenseChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Monthly Comparison"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if result.monthlyComparisons.isEmpty {
                emptyChartPlaceholder
            } else {
                Chart {
                    ForEach(result.monthlyComparisons) { entry in
                        BarMark(
                            x: .value(String(localized: "Month"), entry.monthLabel),
                            y: .value(String(localized: "Income"), Double(entry.incomeMinorUnits) / 100.0)
                        )
                        .foregroundStyle(ChartColorPalette.teal)
                        .position(by: .value(String(localized: "Type"), String(localized: "Income")))

                        BarMark(
                            x: .value(String(localized: "Month"), entry.monthLabel),
                            y: .value(String(localized: "Expense"), Double(entry.expenseMinorUnits) / 100.0)
                        )
                        .foregroundStyle(ChartColorPalette.magenta)
                        .position(by: .value(String(localized: "Type"), String(localized: "Expense")))
                    }
                }
                .chartForegroundStyleScale([
                    String(localized: "Income"): ChartColorPalette.teal,
                    String(localized: "Expense"): ChartColorPalette.magenta,
                ])
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
                .frame(minHeight: 250)
                .drawingGroup()
                .accessibilityElement(children: .contain)
                .accessibilityLabel(String(localized: "Income versus expense bar chart"))
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var netWorthChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Net Worth Over Time"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if result.netWorthSnapshots.isEmpty {
                emptyChartPlaceholder
            } else {
                Chart(result.netWorthSnapshots) { snapshot in
                    AreaMark(
                        x: .value(String(localized: "Date"), snapshot.date),
                        y: .value(String(localized: "Net Worth"), Double(snapshot.netWorthMinorUnits) / 100.0)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [ChartColorPalette.blue.opacity(0.3), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value(String(localized: "Date"), snapshot.date),
                        y: .value(String(localized: "Net Worth"), Double(snapshot.netWorthMinorUnits) / 100.0)
                    )
                    .foregroundStyle(ChartColorPalette.blue)
                    .interpolationMethod(.catmullRom)
                }
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text("$\(Int(v / 1000))k")
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
                .frame(minHeight: 250)
                .drawingGroup()
                .accessibilityElement(children: .contain)
                .accessibilityLabel(String(localized: "Net worth over time line chart"))
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var emptyChartPlaceholder: some View {
        VStack(spacing: 8) {
            Image(systemName: "chart.bar.xaxis")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(String(localized: "No data available for this period."))
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 200)
        .accessibilityLabel(String(localized: "No data available"))
    }

    // MARK: - Data Table

    @ViewBuilder
    private var reportDataTable: some View {
        switch result.configuration.reportType {
        case .spendingByCategory:
            categoryDataTable
        case .incomeVsExpense, .categoryTrends:
            monthlyDataTable
        case .netWorth:
            netWorthDataTable
        }
    }

    private var categoryDataTable: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Category Details"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if result.categorySpending.isEmpty {
                Text(String(localized: "No spending data for this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(result.categorySpending) { entry in
                    HStack {
                        Circle()
                            .fill(ChartColorPalette.color(at: entry.colorIndex))
                            .frame(width: 10, height: 10)
                        Text(entry.categoryName)
                            .font(.subheadline)
                        Spacer()
                        Text(String(format: "%.1f%%", entry.percentage))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        CurrencyLabel(
                            amountInMinorUnits: entry.amountMinorUnits,
                            currencyCode: "USD",
                            showSign: false,
                            font: .callout.bold()
                        )
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(entry.categoryName)
                    .accessibilityValue(String(localized: "\(String(format: "%.1f", entry.percentage)) percent"))

                    if entry.id != result.categorySpending.last?.id {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var monthlyDataTable: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Monthly Details"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if result.monthlyComparisons.isEmpty {
                Text(String(localized: "No data for this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(result.monthlyComparisons) { entry in
                    VStack(spacing: 4) {
                        HStack {
                            Text(entry.monthLabel)
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Spacer()
                        }
                        HStack {
                            Label(String(localized: "Income"), systemImage: "arrow.down")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Spacer()
                            CurrencyLabel(
                                amountInMinorUnits: entry.incomeMinorUnits,
                                currencyCode: "USD",
                                showSign: false,
                                font: .caption
                            )
                        }
                        HStack {
                            Label(String(localized: "Expense"), systemImage: "arrow.up")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Spacer()
                            CurrencyLabel(
                                amountInMinorUnits: entry.expenseMinorUnits,
                                currencyCode: "USD",
                                showSign: false,
                                font: .caption
                            )
                        }
                        HStack {
                            Text(String(localized: "Net"))
                                .font(.caption)
                                .fontWeight(.medium)
                            Spacer()
                            CurrencyLabel(
                                amountInMinorUnits: entry.netMinorUnits,
                                currencyCode: "USD",
                                showSign: true,
                                font: .caption.bold()
                            )
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(entry.monthLabel)

                    if entry.id != result.monthlyComparisons.last?.id {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var netWorthDataTable: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Net Worth Details"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            if result.netWorthSnapshots.isEmpty {
                Text(String(localized: "No net worth data for this period."))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(result.netWorthSnapshots) { snapshot in
                    HStack {
                        Text(snapshot.date.formatted(.dateTime.month(.abbreviated).year()))
                            .font(.subheadline)
                        Spacer()
                        CurrencyLabel(
                            amountInMinorUnits: snapshot.netWorthMinorUnits,
                            currencyCode: "USD",
                            showSign: true,
                            font: .callout.bold()
                        )
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(snapshot.date.formatted(.dateTime.month(.wide).year()))
                    .accessibilityValue(viewModel.formatCurrency(snapshot.netWorthMinorUnits))

                    if snapshot.id != result.netWorthSnapshots.last?.id {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

#Preview {
    NavigationStack {
        ReportResultView(
            result: ReportResult(
                configuration: ReportConfiguration(
                    reportType: .spendingByCategory,
                    dateRange: .threeMonths,
                    selectedAccounts: [],
                    selectedCategories: []
                ),
                generatedAt: .now,
                categorySpending: [
                    ReportCategoryEntry(categoryName: "Food", amountMinorUnits: 52_000, percentage: 35.0, colorIndex: 0),
                    ReportCategoryEntry(categoryName: "Transport", amountMinorUnits: 31_000, percentage: 21.0, colorIndex: 1),
                    ReportCategoryEntry(categoryName: "Entertainment", amountMinorUnits: 18_000, percentage: 12.0, colorIndex: 2),
                    ReportCategoryEntry(categoryName: "Utilities", amountMinorUnits: 27_500, percentage: 18.5, colorIndex: 3),
                    ReportCategoryEntry(categoryName: "Shopping", amountMinorUnits: 20_000, percentage: 13.5, colorIndex: 4),
                ]
            ),
            viewModel: ReportBuilderViewModel(
                transactionRepository: MockTransactionRepository(),
                accountRepository: MockAccountRepository(),
                categoryRepository: MockCategoryRepository()
            )
        )
    }
}
