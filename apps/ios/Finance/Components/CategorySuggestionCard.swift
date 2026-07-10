// SPDX-License-Identifier: BUSL-1.1

// CategorySuggestionCard.swift
// Finance
//
// Review surface for on-device category suggestions. Shows the suggested
// category with its confidence and lets the user accept, override (pick another
// category), or disable suggestions. Fully VoiceOver-accessible with Dynamic
// Type; colours follow the CVD-safe convention used by ConfidenceIndicatorView.
//
// References: #2382

import FinanceShared
import SwiftUI

/// A card presenting a single category suggestion and its review controls.
///
/// Drop this into a transaction review/create screen, passing a
/// ``CategorySuggestionViewModel``. The card collapses to an unobtrusive note
/// once the user has acted or when suggestions are disabled.
struct CategorySuggestionCard: View {
    @State var viewModel: CategorySuggestionViewModel

    var body: some View {
        Group {
            switch viewModel.state {
            case .suggested:
                suggestionBody
            case .accepted, .overridden:
                resolvedBody
            case .disabled:
                disabledBody
            }
        }
        .padding(16)
        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("category_suggestion_card")
    }

    // MARK: - Suggested

    @ViewBuilder
    private var suggestionBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            HStack(spacing: 10) {
                Image(systemName: viewModel.selectedCategory?.icon ?? "tag")
                    .foregroundStyle(viewModel.selectedCategory?.color ?? .accentColor)
                    .accessibilityHidden(true)

                Text(viewModel.selectedCategory?.name ?? String(localized: "Uncategorized"))
                    .font(.headline)

                Spacer()

                confidenceBadge
            }

            HStack(spacing: 12) {
                Button {
                    viewModel.accept()
                } label: {
                    Label(String(localized: "Accept"), systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isFallback)
                .accessibilityLabel(String(localized: "Accept suggested category"))
                .accessibilityIdentifier("category_suggestion_accept")

                overrideMenu
            }

            Button(role: .destructive) {
                viewModel.disableSuggestions()
            } label: {
                Text(String(localized: "Turn off suggestions"))
                    .font(.footnote)
            }
            .accessibilityLabel(String(localized: "Turn off category suggestions"))
            .accessibilityIdentifier("category_suggestion_disable")
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "sparkles")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "Suggested category"))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    private var confidenceBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: confidenceSymbol)
                .font(.caption)
            Text(viewModel.confidenceText)
                .font(.caption.monospacedDigit())
        }
        .foregroundStyle(confidenceColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(confidenceColor.opacity(0.15), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(viewModel.confidenceBandLabel)
        .accessibilityValue(viewModel.confidenceText)
        .accessibilityIdentifier("category_suggestion_confidence")
    }

    private var overrideMenu: some View {
        Menu {
            ForEach(viewModel.availableCategories) { category in
                Button {
                    viewModel.override(to: category.id)
                } label: {
                    Label(category.name, systemImage: category.icon)
                }
            }
        } label: {
            Label(String(localized: "Change"), systemImage: "pencil")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel(String(localized: "Change category"))
        .accessibilityIdentifier("category_suggestion_override")
    }

    // MARK: - Resolved

    private var resolvedBody: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(FinanceColors.statusPositive)
                .accessibilityHidden(true)
            Text(resolvedLabel)
                .font(.subheadline)
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(resolvedLabel)
    }

    private var resolvedLabel: String {
        let name = viewModel.selectedCategory?.name ?? String(localized: "Uncategorized")
        return viewModel.state == .accepted
            ? String(localized: "Categorized as \(name)")
            : String(localized: "Changed to \(name)")
    }

    // MARK: - Disabled

    private var disabledBody: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles.slash")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            Text(String(localized: "Category suggestions are off"))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Category suggestions are off"))
    }

    // MARK: - Confidence styling (CVD-safe)

    private var confidenceColor: Color {
        switch viewModel.suggestion?.band ?? .none {
        case .high: .green
        case .medium: .orange
        case .low, .none: .red
        }
    }

    private var confidenceSymbol: String {
        switch viewModel.suggestion?.band ?? .none {
        case .high: "checkmark.seal.fill"
        case .medium: "checkmark.seal"
        case .low: "exclamationmark.triangle"
        case .none: "questionmark.circle"
        }
    }
}
