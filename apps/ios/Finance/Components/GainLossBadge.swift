// SPDX-License-Identifier: BUSL-1.1

// GainLossBadge.swift
// Finance
//
// A compact badge that encodes gain/loss/flat state with an icon and text
// label in addition to color, so financial direction never relies on red/green
// alone.
// Refs #2121

import SwiftUI

/// A compact pill that communicates gain/loss/flat state with **three**
/// redundant cues — an SF Symbol, a text label, and a semantic color — so
/// low-vision and color-blind users can read financial direction reliably.
/// (#2121)
struct GainLossBadge: View {
    let state: GainLossState

    /// When `false`, only the directional icon is shown (compact contexts).
    var showLabel: Bool = true

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: state.symbolName)
                .font(.caption2.weight(.bold))
                .accessibilityHidden(true)

            if showLabel {
                Text(state.label)
                    .font(.caption2.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(state.color)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(state.color.opacity(0.12), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.label)
    }
}

#Preview("Gain / Loss Badges") {
    VStack(spacing: 12) {
        GainLossBadge(state: .gain)
        GainLossBadge(state: .loss)
        GainLossBadge(state: .flat)
        GainLossBadge(state: .gain, showLabel: false)
    }
    .padding()
}
