// SPDX-License-Identifier: BUSL-1.1

// DebtPayoffCard.swift
// Finance
//
// Card surface pairing a debt payoff ring with remaining balance, payoff
// ETA, milestone messaging, and interest-saved tradeoff copy (#2175).

import SwiftUI
import FinanceShared

/// A glanceable debt payoff card: ring + numbers + motivational milestone.
///
/// Presentational only — all math comes from the pure `DebtPayoffProgress`
/// model. Every figure shown to a sighted user is also surfaced to VoiceOver
/// via a combined accessibility label, so progress is never color-only.
struct DebtPayoffCard: View {
    let progress: DebtPayoffProgress

    /// Reference "today" used to project the payoff date. Injected so previews
    /// and tests stay deterministic.
    var referenceDate: Date = .now

    /// Hypothetical extra monthly principal used for the interest-saved hint.
    var extraMonthlyMinorUnits: Int64 = 100_00

    private var payoffDate: Date? {
        progress.projectedPayoffDate(from: referenceDate)
    }

    private var interestSaved: Int64? {
        progress.interestSavedByPayingExtra(extraMonthlyMinorUnits: extraMonthlyMinorUnits)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            HStack(alignment: .center, spacing: 16) {
                DebtPayoffRing(progress: progress, size: 104)
                    .frame(width: 104, height: 104)
                stats
            }

            milestoneFooter
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(progress.name))
        .accessibilityValue(Text(accessibilitySummary))
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "percent")
                .font(.title3)
                .foregroundStyle(.green)
                .frame(width: 40, height: 40)
                .background(Color.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(progress.name)
                    .font(.headline)
                Text(String(localized: "Student loan payoff"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    // MARK: - Stats

    private var stats: some View {
        VStack(alignment: .leading, spacing: 8) {
            statRow(
                label: String(localized: "Remaining"),
                amount: progress.remainingBalanceMinorUnits
            )
            statRow(
                label: String(localized: "Paid off"),
                amount: progress.principalPaidMinorUnits
            )
            if let payoffDate {
                HStack(spacing: 4) {
                    Text(String(localized: "Debt-free")).font(.caption).foregroundStyle(.secondary)
                    Text(payoffDate, format: .dateTime.month(.abbreviated).year())
                        .font(.caption.bold())
                }
            } else if !progress.isPaidOff {
                Text(String(localized: "Set a monthly payment to see a payoff date"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statRow(label: String, amount: Int64) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Spacer()
            CurrencyLabel(
                amountInMinorUnits: amount,
                currencyCode: progress.currencyCode,
                showSign: false,
                font: .caption.bold()
            )
        }
    }

    // MARK: - Milestone footer

    @ViewBuilder
    private var milestoneFooter: some View {
        if progress.isPaidOff {
            Label(String(localized: "Paid off — ring closed!"), systemImage: "checkmark.seal.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
        } else if let interestSaved, interestSaved > 0 {
            HStack(spacing: 4) {
                Image(systemName: "bolt.fill").font(.caption2).foregroundStyle(.orange)
                    .accessibilityHidden(true)
                Text(String(localized: "Pay")).font(.caption).foregroundStyle(.secondary)
                CurrencyLabel(
                    amountInMinorUnits: extraMonthlyMinorUnits,
                    currencyCode: progress.currencyCode,
                    showSign: false,
                    font: .caption.bold()
                )
                Text(String(localized: "more monthly to save")).font(.caption).foregroundStyle(.secondary)
                CurrencyLabel(
                    amountInMinorUnits: interestSaved,
                    currencyCode: progress.currencyCode,
                    showSign: false,
                    font: .caption.bold()
                )
                Text(String(localized: "in interest")).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Accessibility

    private var accessibilitySummary: String {
        var parts: [String] = []
        parts.append(String(localized: "\(progress.percentComplete) percent paid off"))
        if progress.isPaidOff {
            parts.append(String(localized: "fully paid off"))
        } else if let months = progress.monthsToPayoff() {
            parts.append(String(localized: "about \(months) months until debt-free"))
        }
        return parts.joined(separator: ", ")
    }
}

#Preview {
    ScrollView {
        VStack(spacing: 16) {
            DebtPayoffCard(
                progress: DebtPayoffProgress(
                    id: "1", name: "Grad PLUS Loan",
                    originalPrincipalMinorUnits: 40_000_00,
                    currentBalanceMinorUnits: 18_000_00,
                    monthlyPaymentMinorUnits: 600_00,
                    annualInterestRateBasisPoints: 650
                ),
                referenceDate: Date(timeIntervalSince1970: 1_750_000_000)
            )
            DebtPayoffCard(
                progress: DebtPayoffProgress(
                    id: "2", name: "Car Loan",
                    originalPrincipalMinorUnits: 12_000_00,
                    currentBalanceMinorUnits: 0,
                    monthlyPaymentMinorUnits: 300_00
                )
            )
        }
        .padding()
    }
}
