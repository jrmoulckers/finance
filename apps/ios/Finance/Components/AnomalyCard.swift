// SPDX-License-Identifier: BUSL-1.1

// AnomalyCard.swift
// Finance
//
// Card component displaying a spending anomaly with severity indicator.
// Supports VoiceOver, Dynamic Type, and high-contrast modes.
//
// References: #269

import SwiftUI

/// A card that highlights an unusual spending pattern for a category.
struct AnomalyCard: View {
    let anomaly: SpendingAnomaly
    let formatCurrency: (Int64) -> String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: anomaly.severity.systemImage)
                .font(.title2)
                .foregroundStyle(anomaly.severity.color)
                .frame(width: 44, height: 44)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(anomaly.category)
                    .font(.headline)

                HStack(spacing: 4) {
                    Text(String(localized: "Spent"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(anomaly.actualMinorUnits))
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(anomaly.isOverspend ? .red : .green)
                }

                HStack(spacing: 4) {
                    Text(String(localized: "Expected"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(anomaly.expectedMinorUnits))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(anomaly.severity.displayName)
                    .font(.caption)
                    .fontWeight(.medium)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(anomaly.severity.color.opacity(0.15))
                    .clipShape(Capsule())

                Text(String(
                    localized: "\(String(format: "%.1f", anomaly.deviationFactor))× normal"
                ))
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(localized: "\(anomaly.category) spending anomaly, \(anomaly.severity.displayName) severity")
        )
        .accessibilityValue(
            String(localized: "Spent \(formatCurrency(anomaly.actualMinorUnits)), expected \(formatCurrency(anomaly.expectedMinorUnits))")
        )
        .accessibilityHint(
            anomaly.isOverspend
                ? String(localized: "Spending is higher than usual")
                : String(localized: "Spending is lower than usual")
        )
    }
}

#Preview("Anomaly Card - High") {
    AnomalyCard(
        anomaly: SpendingAnomaly(
            category: "Dining Out",
            date: .now,
            actualMinorUnits: 450_00,
            expectedMinorUnits: 180_00,
            deviationFactor: 3.2
        ),
        formatCurrency: { "$\($0 / 100)" }
    )
    .padding()
}
