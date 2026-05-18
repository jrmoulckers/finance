// SPDX-License-Identifier: BUSL-1.1

// TagChipView.swift
// Finance
//
// A removable capsule/chip view for displaying tags. Used in the
// transaction create/edit form for tag management. Refs #1485

import SwiftUI

/// A small capsule view representing a tag with a remove button.
struct TagChipView: View {
    let text: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(text)
                .font(.subheadline)
                .lineLimit(1)
            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "Remove tag \(text)"))
            .accessibilityHint(String(localized: "Removes this tag from the transaction"))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color(.systemGray5), in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Tag: \(text)"))
        .accessibilityRemoveTraits(.isButton)
        .accessibilityAddTraits(.isStaticText)
    }
}

#Preview {
    HStack {
        TagChipView(text: "groceries") {}
        TagChipView(text: "recurring") {}
    }
    .padding()
}
