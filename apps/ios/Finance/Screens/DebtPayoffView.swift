// SPDX-License-Identifier: BUSL-1.1

// DebtPayoffView.swift
// Finance
//
// Dedicated debt payoff surface (#2175). Leads with a combined "all debts"
// ring, then a card per loan — fitness-ring energy for student loan payoff.

import SwiftUI
import FinanceShared

struct DebtPayoffView: View {
    @State private var viewModel: DebtPayoffViewModel

    init(viewModel: DebtPayoffViewModel = DebtPayoffViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.debts.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else if viewModel.debts.isEmpty {
                    EmptyStateView(
                        systemImage: "percent",
                        title: String(localized: "No Debts Tracked"),
                        message: String(localized: "Add a loan account to watch your debt payoff rings close.")
                    )
                } else {
                    content
                }
            }
            .navigationTitle(String(localized: "Debt Payoff"))
            .refreshable { await viewModel.loadDebts() }
            .task { await viewModel.loadDebts() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadDebts() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Content

    private var content: some View {
        ScrollView {
            VStack(spacing: 20) {
                portfolioSummary
                LazyVStack(spacing: 16) {
                    ForEach(viewModel.debts) { debt in
                        DebtPayoffCard(progress: debt, referenceDate: viewModel.referenceDate)
                    }
                }
            }
            .padding()
        }
    }

    // MARK: - Portfolio summary

    private var portfolioSummary: some View {
        let portfolio = viewModel.portfolio
        return VStack(spacing: 12) {
            DebtPayoffSummaryRing(portfolio: portfolio)
                .frame(width: 160, height: 160)

            HStack(spacing: 24) {
                summaryStat(
                    title: String(localized: "Remaining"),
                    amount: portfolio.totalRemainingBalanceMinorUnits
                )
                summaryStat(
                    title: String(localized: "Paid"),
                    amount: portfolio.totalPrincipalPaidMinorUnits
                )
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "All debts combined"))
        .accessibilityValue(String(localized: "\(portfolio.percentComplete) percent paid off"))
    }

    private func summaryStat(title: String, amount: Int64) -> some View {
        VStack(spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            CurrencyLabel(
                amountInMinorUnits: amount,
                currencyCode: viewModel.debts.first?.currencyCode ?? "USD",
                showSign: false,
                font: .headline
            )
        }
    }

    // TODO(human): Wire this surface to real loan accounts. The shared KMP
    // model must expose original principal, monthly payment, and APR per loan
    // before `DebtPayoffViewModel` can replace `SampleDebtPayoffProvider` with
    // live data. Requires an ADR with @kmp-engineer (boundary: packages/).
    // Validate ring fill, VoiceOver order, and Dynamic Type XXXL on device.
}

// MARK: - Summary Ring

/// Combined ring for the whole debt portfolio.
private struct DebtPayoffSummaryRing: View {
    let portfolio: DebtPortfolioProgress

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.green.opacity(0.18), style: StrokeStyle(lineWidth: 16, lineCap: .round))
            Circle()
                .trim(from: 0, to: portfolio.fractionComplete)
                .stroke(
                    portfolio.isAllPaidOff ? Color.green : Color.green,
                    style: StrokeStyle(lineWidth: 16, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.6), value: portfolio.fractionComplete)
            VStack(spacing: 2) {
                Text("\(portfolio.percentComplete)%")
                    .font(.largeTitle.weight(.bold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text(String(localized: "paid off"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(24)
        }
        .accessibilityHidden(true)
    }
}

#Preview {
    DebtPayoffView(
        viewModel: DebtPayoffViewModel(
            provider: SampleDebtPayoffProvider(),
            referenceDate: Date(timeIntervalSince1970: 1_750_000_000)
        )
    )
}
