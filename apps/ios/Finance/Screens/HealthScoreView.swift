// SPDX-License-Identifier: BUSL-1.1

// HealthScoreView.swift
// Finance
//
// Financial health score screen with overall grade, component breakdown,
// trend history, benchmark comparison, and actionable tips.
//
// References: #299

import Charts
import SwiftUI

struct HealthScoreView: View {
    @State private var viewModel: HealthScoreViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        accountRepository: AccountRepository,
        transactionRepository: TransactionRepository,
        budgetRepository: BudgetRepository,
        goalRepository: GoalRepository
    ) {
        _viewModel = State(initialValue: HealthScoreViewModel(
            accountRepository: accountRepository,
            transactionRepository: transactionRepository,
            budgetRepository: budgetRepository,
            goalRepository: goalRepository
        ))
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView(String(localized: "Analyzing your finances…"))
                        .accessibilityLabel(String(localized: "Computing health score"))
                } else if let score = viewModel.healthScore {
                    scoreContent(score)
                } else {
                    EmptyStateView(
                        systemImage: "heart.text.square",
                        title: String(localized: "No Score Available"),
                        message: String(localized: "Add accounts and transactions to see your financial health score.")
                    )
                }
            }
            .navigationTitle(String(localized: "Health Score"))
            .task {
                await viewModel.loadHealthScore()
            }
            .refreshable {
                await viewModel.loadHealthScore()
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

    // MARK: - Score Content

    @ViewBuilder
    private func scoreContent(_ score: FinancialHealthScore) -> some View {
        ScrollView {
            LazyVStack(spacing: 24) {
                overallScoreCard(score)
                scoreHistoryChart
                componentsSection(score)
                benchmarkSection(score.benchmark)
                tipsSection(score.tips)
            }
            .padding()
        }
    }

    // MARK: - Overall Score Card

    private func overallScoreCard(_ score: FinancialHealthScore) -> some View {
        VStack(spacing: 16) {
            ZStack {
                ProgressRing(
                    progress: viewModel.scoreProgress,
                    lineWidth: 12,
                    progressColor: viewModel.scoreColor,
                    size: 140
                )

                VStack(spacing: 4) {
                    Text("\(score.overallScore)")
                        .font(.system(size: 42, weight: .bold, design: .rounded))
                        .foregroundStyle(viewModel.scoreColor)

                    Text(score.grade.rawValue)
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                String(localized: "Financial health score: \(score.overallScore) out of 100, grade \(score.grade.rawValue)")
            )

            Text(score.grade.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 2)
    }

    // MARK: - Score History Chart

    @ViewBuilder
    private var scoreHistoryChart: some View {
        if !viewModel.scoreHistory.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "Score Trend"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Chart(viewModel.scoreHistory) { snapshot in
                    LineMark(
                        x: .value(String(localized: "Date"), snapshot.date),
                        y: .value(String(localized: "Score"), snapshot.score)
                    )
                    .foregroundStyle(ChartColorPalette.blue)
                    .interpolationMethod(.catmullRom)

                    AreaMark(
                        x: .value(String(localized: "Date"), snapshot.date),
                        y: .value(String(localized: "Score"), snapshot.score)
                    )
                    .foregroundStyle(ChartColorPalette.blue.opacity(0.1))

                    PointMark(
                        x: .value(String(localized: "Date"), snapshot.date),
                        y: .value(String(localized: "Score"), snapshot.score)
                    )
                    .foregroundStyle(ChartColorPalette.blue)
                    .symbolSize(30)
                }
                .chartYScale(domain: 0...100)
                .chartYAxis {
                    AxisMarks(values: [0, 25, 50, 75, 100]) { value in
                        AxisValueLabel {
                            if let intValue = value.as(Int.self) {
                                Text("\(intValue)")
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .stride(by: .month)) { _ in
                        AxisValueLabel(format: .dateTime.month(.abbreviated))
                            .font(.caption2)
                        AxisGridLine()
                    }
                }
                .frame(height: 180)
                .drawingGroup()
                .accessibilityElement(children: .contain)
                .accessibilityLabel(String(localized: "Health score trend over time"))
            }
        }
    }

    // MARK: - Components Section

    private func componentsSection(_ score: FinancialHealthScore) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "Score Breakdown"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            ForEach(score.components) { component in
                componentRow(component)
            }
        }
    }

    private func componentRow(_ component: HealthScoreComponent) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: component.systemImage)
                    .foregroundStyle(component.color)
                    .frame(width: 24)
                    .accessibilityHidden(true)

                Text(component.name)
                    .font(.subheadline)
                    .fontWeight(.medium)

                Spacer()

                Text("\(component.score)/\(component.maxScore)")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(component.color)
            }

            ProgressView(value: component.percentage, total: 100)
                .tint(component.color)

            Text(component.description)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.03), radius: 2, y: 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(component.name): \(component.score) of \(component.maxScore)")
        .accessibilityValue(component.description)
    }

    // MARK: - Benchmark Section

    private func benchmarkSection(_ benchmark: HealthBenchmark) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(String(localized: "How You Compare"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: 0) {
                benchmarkStat(
                    label: String(localized: "Your Percentile"),
                    value: "\(benchmark.percentile)th",
                    color: .accent
                )

                Divider()

                benchmarkStat(
                    label: String(localized: "Average"),
                    value: "\(benchmark.averageScore)",
                    color: .secondary
                )

                Divider()

                benchmarkStat(
                    label: String(localized: "Median"),
                    value: "\(benchmark.medianScore)",
                    color: .secondary
                )
            }
            .padding()
            .background(.background)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.03), radius: 2, y: 1)
        }
    }

    private func benchmarkStat(
        label: String,
        value: String,
        color: Color
    ) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(color)

            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }

    // MARK: - Tips Section

    @ViewBuilder
    private func tipsSection(_ tips: [HealthTip]) -> some View {
        if !tips.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "Recommendations"))
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                ForEach(tips) { tip in
                    tipRow(tip)
                }
            }
        }
    }

    private func tipRow(_ tip: HealthTip) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: tip.systemImage)
                .font(.title3)
                .foregroundStyle(tip.impact.color)
                .frame(width: 32, height: 32)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(tip.title)
                        .font(.subheadline)
                        .fontWeight(.medium)

                    Spacer()

                    Text(tip.impact.displayName)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(tip.impact.color.opacity(0.15))
                        .clipShape(Capsule())
                }

                Text(tip.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.03), radius: 2, y: 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tip.title)
        .accessibilityValue(tip.description)
        .accessibilityHint(String(localized: "\(tip.impact.displayName) recommendation"))
    }
}

#Preview("Health Score") {
    HealthScoreView(
        accountRepository: StubAccountRepository(),
        transactionRepository: StubTransactionRepository(),
        budgetRepository: StubBudgetRepository(),
        goalRepository: StubGoalRepository()
    )
}
