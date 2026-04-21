// SPDX-License-Identifier: BUSL-1.1

// FinancialTipCard.swift
// Finance
//
// Reusable card component for displaying a single contextual financial tip.
// Supports dismiss action, VoiceOver, Dynamic Type, and dark mode.
//
// References: #320

import SwiftUI

// MARK: - Financial Tip Card

/// A card view displaying a single financial tip with category indicator,
/// title, body, optional action, and a dismiss button.
///
/// Fully accessible: combines elements for VoiceOver, supports Dynamic Type,
/// and provides a custom dismiss action.
struct FinancialTipCard: View {
    let tip: FinancialTip
    let onDismiss: () -> Void
    let onAction: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(
        tip: FinancialTip,
        onDismiss: @escaping () -> Void,
        onAction: (() -> Void)? = nil
    ) {
        self.tip = tip
        self.onDismiss = onDismiss
        self.onAction = onAction
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header: icon + category + dismiss
            HStack(spacing: 8) {
                Image(systemName: tip.systemImage)
                    .font(.subheadline)
                    .foregroundStyle(tip.category.color)
                    .accessibilityHidden(true)

                Text(tip.category.displayName)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(tip.category.color)
                    .textCase(.uppercase)

                Spacer()

                Button {
                    if reduceMotion {
                        onDismiss()
                    } else {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            onDismiss()
                        }
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel(String(localized: "Dismiss tip"))
                .accessibilityHint(String(localized: "Hides this financial tip"))
            }

            // Title
            Text(tip.title)
                .font(.headline)
                .foregroundStyle(FinanceColors.textPrimary)

            // Body
            Text(tip.body)
                .font(.subheadline)
                .foregroundStyle(FinanceColors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            // Optional action button
            if let actionLabel = tip.actionLabel, let onAction {
                Button(action: onAction) {
                    Text(actionLabel)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .accessibilityLabel(actionLabel)
            }
        }
        .padding()
        .background(FinanceColors.backgroundElevated)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.06), radius: 3, y: 2)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "\(tip.category.displayName) tip: \(tip.title)")
        )
        .accessibilityHint(tip.body)
        .accessibilityAction(named: String(localized: "Dismiss")) {
            onDismiss()
        }
        .accessibilityIdentifier("financial_tip_card_\(tip.id)")
    }
}

// MARK: - Financial Tips Section

/// A section that displays a vertical list of contextual financial tips.
///
/// Use this component inside any screen's `ScrollView` or `List` to show
/// context-appropriate tips. Tips auto-load via `.task {}` and respect
/// dismiss state.
struct FinancialTipsSection: View {
    @State private var viewModel: FinancialTipsViewModel
    let context: TipContext
    let onAction: ((FinancialTip) -> Void)?

    init(
        context: TipContext,
        viewModel: FinancialTipsViewModel = FinancialTipsViewModel(),
        onAction: ((FinancialTip) -> Void)? = nil
    ) {
        self.context = context
        _viewModel = State(initialValue: viewModel)
        self.onAction = onAction
    }

    var body: some View {
        Group {
            if !viewModel.tips.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Label(
                        String(localized: "Tips for You"),
                        systemImage: "lightbulb"
                    )
                    .font(.headline)
                    .foregroundStyle(FinanceColors.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                    ForEach(viewModel.tips) { tip in
                        FinancialTipCard(
                            tip: tip,
                            onDismiss: {
                                viewModel.dismissTip(tip)
                            },
                            onAction: tip.actionLabel != nil ? {
                                onAction?(tip)
                            } : nil
                        )
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .task {
            await viewModel.loadTips(for: context)
        }
    }
}

// MARK: - Previews

#Preview("Tip Card") {
    FinancialTipCard(
        tip: FinancialTip(
            id: "preview_tip",
            title: "Try the 50/30/20 Rule",
            body: "Allocate 50% of income to needs, 30% to wants, and 20% to savings.",
            category: .budgeting,
            applicableContexts: [.dashboard],
            priority: 10
        ),
        onDismiss: {}
    )
    .padding()
}

#Preview("Tips Section") {
    ScrollView {
        FinancialTipsSection(context: .dashboard)
            .padding()
    }
}
