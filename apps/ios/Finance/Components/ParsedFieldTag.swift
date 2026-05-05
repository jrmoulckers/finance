// SPDX-License-Identifier: BUSL-1.1

// ParsedFieldTag.swift
// Finance
//
// Reusable chip/tag component displaying a single parsed NLP field.
// Supports uncertain state styling and tap-to-correct (quick-fix) interaction.
// VoiceOver accessible with Dynamic Type support.

import SwiftUI

// MARK: - Parsed Field Tag

/// A pill-shaped tag showing a parsed field (amount, payee, category, date, type).
///
/// Tapping the tag triggers the `onTapToCorrect` callback for quick-fix editing.
/// Uncertain fields are visually distinguished with a dashed border.
struct ParsedFieldTag: View {
    let field: NlpParsedField
    let isEditing: Bool
    let onTapToCorrect: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: field.id.systemImage)
                .font(.caption2)
                .foregroundStyle(tagColor)

            VStack(alignment: .leading, spacing: 0) {
                Text(field.id.displayLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(field.value)
                    .font(.caption)
                    .fontWeight(.medium)
                    .lineLimit(1)
            }

            if field.isUncertain {
                Image(systemName: "questionmark.circle.fill")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(backgroundStyle, in: RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(
                    field.isUncertain ? Color.orange : tagColor.opacity(0.3),
                    style: field.isUncertain
                        ? StrokeStyle(lineWidth: 1, dash: [4, 2])
                        : StrokeStyle(lineWidth: 1)
                )
        )
        .contentShape(RoundedRectangle(cornerRadius: 8))
        .onTapGesture { onTapToCorrect() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
        .accessibilityHint(String(localized: "Double tap to correct this field"))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("parsed_field_\(field.id.rawValue)")
    }

    // MARK: - Private

    private var tagColor: Color {
        switch field.id {
        case .amount: .green
        case .payee: .blue
        case .category: .purple
        case .date: .orange
        case .type: .teal
        }
    }

    @ViewBuilder
    private var backgroundStyle: some ShapeStyle {
        tagColor.opacity(isEditing ? 0.2 : 0.1)
    }

    private var accessibilityDescription: String {
        var description = "\(field.id.displayLabel): \(field.value)"
        if field.isUncertain {
            description += ", " + String(localized: "uncertain")
        }
        return description
    }
}

// MARK: - Preview

#Preview("Parsed Fields") {
    VStack(spacing: 12) {
        ParsedFieldTag(
            field: NlpParsedField(id: .amount, value: "$4.50", isUncertain: false),
            isEditing: false,
            onTapToCorrect: {}
        )
        ParsedFieldTag(
            field: NlpParsedField(id: .payee, value: "Starbucks", isUncertain: true),
            isEditing: false,
            onTapToCorrect: {}
        )
        ParsedFieldTag(
            field: NlpParsedField(id: .category, value: "Food & Drink", isUncertain: false),
            isEditing: false,
            onTapToCorrect: {}
        )
        ParsedFieldTag(
            field: NlpParsedField(id: .date, value: "Jan 15, 2025", isUncertain: false),
            isEditing: false,
            onTapToCorrect: {}
        )
    }
    .padding()
}
