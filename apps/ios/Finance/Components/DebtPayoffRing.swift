// SPDX-License-Identifier: BUSL-1.1

// DebtPayoffRing.swift
// Finance
//
// Fitness-ring style visualization for debt payoff progress (#2175).
// Conveys progress numerically to VoiceOver — never by color or shape
// alone — and supports Dynamic Type for the centered percentage label.

import SwiftUI
import FinanceShared

/// A circular "activity ring" showing how much of a debt has been paid off.
///
/// The ring fills clockwise as principal is knocked down. The center shows a
/// Dynamic Type percentage; the whole control is a single accessibility
/// element whose label and value spell the progress out numerically so it is
/// never communicated by color/shape alone (WCAG 1.4.1).
struct DebtPayoffRing: View {
    let progress: DebtPayoffProgress
    var lineWidth: CGFloat = 12
    var size: CGFloat = 120
    var tint: Color = .green

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var fraction: Double { progress.fractionComplete }

    var body: some View {
        ZStack {
            Circle()
                .stroke(tint.opacity(0.18), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(
                    progress.isPaidOff ? Color.green : tint,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.6), value: fraction)

            VStack(spacing: 2) {
                Text(percentText)
                    .font(.title2.weight(.bold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                if progress.isPaidOff {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(FinanceColors.statusPositive)
                        .font(.caption)
                } else {
                    Text(String(localized: "paid off"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                }
            }
            .padding(lineWidth)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(accessibilityLabel))
        .accessibilityValue(Text(accessibilityValue))
    }

    // MARK: - Text

    private var percentText: String {
        "\(progress.percentComplete)%"
    }

    private var accessibilityLabel: String {
        String(localized: "\(progress.name) debt payoff ring")
    }

    /// Numeric, color-independent description for VoiceOver.
    private var accessibilityValue: String {
        if progress.isPaidOff {
            return String(localized: "Fully paid off, 100 percent complete")
        }
        return String(localized: "\(progress.percentComplete) percent paid off")
    }
}

#Preview("In progress") {
    DebtPayoffRing(
        progress: DebtPayoffProgress(
            id: "1", name: "Grad PLUS Loan",
            originalPrincipalMinorUnits: 40_000_00,
            currentBalanceMinorUnits: 18_000_00,
            monthlyPaymentMinorUnits: 600_00,
            annualInterestRateBasisPoints: 650
        )
    )
    .padding()
}

#Preview("Paid off") {
    DebtPayoffRing(
        progress: DebtPayoffProgress(
            id: "2", name: "Car Loan",
            originalPrincipalMinorUnits: 12_000_00,
            currentBalanceMinorUnits: 0,
            monthlyPaymentMinorUnits: 300_00
        )
    )
    .padding()
}
