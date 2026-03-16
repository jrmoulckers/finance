// SPDX-License-Identifier: BUSL-1.1

// FilterChipView.swift
// Finance
//
// Reusable filter chip component with a label and dismiss button.
// Displayed in a horizontal scroll bar when transaction filters are active.

import SwiftUI

/// A capsule-shaped chip showing an active filter with a remove button.
///
/// Meets minimum 44×44 pt tap target requirements. All elements carry
/// accessibility labels so VoiceOver users can identify and dismiss filters.
struct FilterChipView: View {
    let label: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .lineLimit(1)

            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption2)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(minHeight: 44)
        .background(.tint.opacity(0.12))
        .clipShape(Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(label)
        .accessibilityHint(String(localized: "Double tap to remove this filter"))
        .accessibilityAddTraits(.isButton)
    }
}

#Preview("Single Chip") {
    FilterChipView(label: "Expense, Income") { }
        .padding()
}

#Preview("Multiple Chips") {
    ScrollView(.horizontal) {
        HStack(spacing: 8) {
            FilterChipView(label: "This Month") { }
            FilterChipView(label: "Groceries, Dining") { }
            FilterChipView(label: "$10 – $500") { }
        }
        .padding(.horizontal)
    }
}
