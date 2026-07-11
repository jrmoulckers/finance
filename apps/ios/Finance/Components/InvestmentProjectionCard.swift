// SPDX-License-Identifier: BUSL-1.1

// InvestmentProjectionCard.swift
// Finance
//
// Contribution-aware growth projection section for the investment portfolio.
// Lets a passive index-fund investor set a recurring monthly contribution,
// pick a horizon and expected return, and see a trustworthy compound-growth
// projection that separates contributed principal from market growth.
//
// The projection math lives in the pure, unit-tested `CompoundGrowthProjector`
// (via `InvestmentViewModel`); this file only owns presentation and controls.
//
// References: #2118, #2116, #2115

import SwiftUI

/// A projection section with contribution/horizon/return controls, a compound
/// growth chart, and a principal-versus-growth breakdown.
struct InvestmentProjectionCard: View {
    @Bindable var viewModel: InvestmentViewModel
    let currencyCode: String

    /// Monthly contribution adjustment step: $50.
    private let contributionStepMinorUnits: Int64 = 5_000

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(String(localized: "Growth Projection"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            controls

            InvestmentProjectionChart(
                points: viewModel.projectionPoints,
                currencyCode: currencyCode
            )

            breakdown

            if !viewModel.contributions.isEmpty {
                contributionsHistory
            }
        }
        .padding()
        .cardBackground(cornerRadius: 16)
        .accessibilityIdentifier("investment_projection_card")
    }

    // MARK: - Controls

    private var controls: some View {
        VStack(spacing: 12) {
            contributionStepper
            horizonStepper
            returnStepper
        }
    }

    private var contributionStepper: some View {
        Stepper {
            controlLabel(
                title: String(localized: "Monthly contribution"),
                value: viewModel.formatCurrency(viewModel.monthlyContributionMinorUnits, currencyCode: currencyCode)
            )
        } onIncrement: {
            Task { await viewModel.updateMonthlyContribution(viewModel.monthlyContributionMinorUnits + contributionStepMinorUnits) }
        } onDecrement: {
            Task { await viewModel.updateMonthlyContribution(viewModel.monthlyContributionMinorUnits - contributionStepMinorUnits) }
        }
        .accessibilityValue(viewModel.formatCurrency(viewModel.monthlyContributionMinorUnits, currencyCode: currencyCode))
    }

    private var horizonStepper: some View {
        Stepper(value: $viewModel.projectionYears, in: 5...40, step: 5) {
            controlLabel(
                title: String(localized: "Horizon"),
                value: String(localized: "\(viewModel.projectionYears) years")
            )
        }
        .accessibilityValue(String(localized: "\(viewModel.projectionYears) years"))
    }

    private var returnStepper: some View {
        Stepper(value: $viewModel.projectionAnnualReturnPercent, in: 1...12, step: 0.5) {
            controlLabel(
                title: String(localized: "Expected return"),
                value: String(format: "%.1f%%", viewModel.projectionAnnualReturnPercent)
            )
        }
        .accessibilityValue(String(format: "%.1f percent", viewModel.projectionAnnualReturnPercent))
    }

    private func controlLabel(title: String, value: String) -> some View {
        HStack {
            Text(title)
                .font(.subheadline)
            Spacer()
            Text(value)
                .font(.subheadline.bold())
                .monospacedDigit()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }

    // MARK: - Breakdown

    private var breakdown: some View {
        HStack(spacing: 12) {
            statColumn(
                title: String(localized: "Contributed"),
                value: viewModel.totalContributionsMinorUnits
            )
            Divider().frame(height: 40)
            statColumn(
                title: String(localized: "Market growth"),
                value: viewModel.marketReturnMinorUnits,
                showSign: true
            )
            Divider().frame(height: 40)
            statColumn(
                title: String(localized: "Projected"),
                value: viewModel.projectedValueMinorUnits
            )
        }
        .frame(maxWidth: .infinity)
    }

    private func statColumn(title: String, value: Int64, showSign: Bool = false) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Text(viewModel.formatCurrency(value, currencyCode: currencyCode, showSign: showSign))
                .font(.callout.bold())
                .monospacedDigit()
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(viewModel.formatCurrency(value, currencyCode: currencyCode, showSign: showSign))")
    }

    // MARK: - Contributions History

    private var contributionsHistory: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Recent Contributions"))
                .font(.subheadline.bold())

            ForEach(viewModel.contributions.prefix(5)) { record in
                HStack {
                    Text(record.date, style: .date)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(viewModel.formatCurrency(record.amountMinorUnits, currencyCode: currencyCode, showSign: true))
                        .font(.caption.bold())
                        .monospacedDigit()
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}
