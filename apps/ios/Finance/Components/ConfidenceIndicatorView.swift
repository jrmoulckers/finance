// SPDX-License-Identifier: BUSL-1.1

// ConfidenceIndicatorView.swift
// Finance
//
// Reusable confidence indicator component for NLP parse results.
// Shows a coloured progress bar with a textual confidence label.
// VoiceOver accessible with Dynamic Type support.

import SwiftUI

// MARK: - Confidence Indicator

/// Displays the confidence level of an NLP parse result as a progress bar
/// with an icon and text label.
///
/// Colours follow the semantic status tokens (``FinanceColors``):
/// - High: positive (green)
/// - Medium: warning (amber)
/// - Low/VeryLow: negative (red)
struct ConfidenceIndicatorView: View {
    let confidence: NlpConfidence

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: confidence.systemImage)
                .font(.caption)
                .foregroundStyle(confidenceColor)

            VStack(alignment: .leading, spacing: 2) {
                ProgressView(value: confidence.score, total: 1.0)
                    .tint(confidenceColor)
                    .frame(height: 4)

                Text(confidence.displayName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Parse confidence: \(confidence.displayName)"))
        .accessibilityValue(String(localized: "\(Int(confidence.score * 100)) percent"))
        .accessibilityIdentifier("confidence_indicator")
    }

    // MARK: - Private

    private var confidenceColor: Color {
        switch confidence {
        case .high: FinanceColors.statusPositive
        case .medium: FinanceColors.statusWarning
        case .low: FinanceColors.statusNegative
        case .veryLow: FinanceColors.statusNegative
        }
    }
}

// MARK: - Preview

#Preview("Confidence Levels") {
    VStack(spacing: 12) {
        ForEach(NlpConfidence.allCases, id: \.self) { level in
            ConfidenceIndicatorView(confidence: level)
        }
    }
    .padding()
}
