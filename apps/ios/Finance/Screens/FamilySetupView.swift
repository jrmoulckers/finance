// SPDX-License-Identifier: BUSL-1.1

// FamilySetupView.swift
// Finance
//
// Family / single-parent setup (#2201). Offers kid-aware starter templates so
// the frequent, irregular costs of raising children — school, childcare,
// activities, birthdays, field trips — are there from day one, wrapped in warm,
// non-judgmental coaching copy.

import FinanceShared
import SwiftUI

struct FamilySetupView: View {
    @Environment(\.dismiss) private var dismiss

    /// Invoked with the chosen template so the caller can seed categories.
    let onAdopt: (FamilyBudgetTemplate) -> Void

    /// UserDefaults key recording the adopted template id.
    static let adoptedTemplateKey = "familySetup.adoptedTemplateId"

    @State private var selectedID: String

    private let templates: [FamilyBudgetTemplate]

    init(
        templates: [FamilyBudgetTemplate] = FamilyBudgetTemplates.all,
        onAdopt: @escaping (FamilyBudgetTemplate) -> Void = { _ in }
    ) {
        self.templates = templates
        self.onAdopt = onAdopt
        _selectedID = State(initialValue: templates.first?.id ?? "")
    }

    private var selectedTemplate: FamilyBudgetTemplate? {
        templates.first { $0.id == selectedID }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: FinanceSpacing.lg) {
                    welcomeCard
                    ForEach(templates) { template in
                        templateCard(template)
                    }
                }
                .padding()
                .padding(.bottom, FinanceSpacing.xxxl)
            }
            .safeAreaInset(edge: .bottom) { adoptBar }
            .navigationTitle(String(localized: "Family Setup"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Not now")) { dismiss() }
                        .accessibilityHint(String(localized: "Skips family setup"))
                }
            }
        }
    }

    // MARK: - Welcome

    private var welcomeCard: some View {
        HStack(alignment: .top, spacing: FinanceSpacing.sm) {
            Image(systemName: "heart.circle.fill")
                .font(.title)
                .foregroundStyle(.pink)
                .accessibilityHidden(true)
            Text(SupportiveCoaching.familySetupWelcome)
                .font(.subheadline)
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(SupportiveCoaching.familySetupWelcome)
    }

    // MARK: - Template card

    private func templateCard(_ template: FamilyBudgetTemplate) -> some View {
        let isSelected = template.id == selectedID
        return Button {
            selectedID = template.id
        } label: {
            VStack(alignment: .leading, spacing: FinanceSpacing.sm) {
                HStack {
                    Text(template.name)
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                        .accessibilityHidden(true)
                }

                Text(template.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)

                if !template.kidCategories.isEmpty {
                    Text(String(localized: "Kid categories"))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    FlowRow(spacing: FinanceSpacing.xs) {
                        ForEach(template.kidCategories) { category in
                            categoryChip(category)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .cardBackground(cornerRadius: FinanceSpacing.Radius.xl)
            .overlay(
                RoundedRectangle(cornerRadius: FinanceSpacing.Radius.xl)
                    .strokeBorder(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(template.name)
        .accessibilityValue(template.summary)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityHint(String(localized: "Selects this starter template"))
    }

    private func categoryChip(_ category: StarterCategory) -> some View {
        let color = Color(hex: category.colorHex) ?? .accentColor
        return HStack(spacing: FinanceSpacing.xxs) {
            Image(systemName: category.icon)
                .font(.caption2)
                .accessibilityHidden(true)
            Text(category.name)
                .font(.caption)
        }
        .padding(.horizontal, FinanceSpacing.xs)
        .padding(.vertical, FinanceSpacing.xxs)
        .background(color.opacity(0.15), in: Capsule())
        .foregroundStyle(color)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(category.name)
    }

    // MARK: - Adopt bar

    @ViewBuilder
    private var adoptBar: some View {
        if let template = selectedTemplate {
            Button {
                adopt(template)
            } label: {
                Text(String(localized: "Use \(template.name)"))
                    .font(.headline)
                    .frame(maxWidth: .infinity, minHeight: FinanceSpacing.minTapTarget)
            }
            .buttonStyle(.borderedProminent)
            .padding()
            .background(.thinMaterial)
            .accessibilityLabel(String(localized: "Use \(template.name)"))
            .accessibilityHint(String(localized: "Adds these categories and finishes setup"))
        }
    }

    private func adopt(_ template: FamilyBudgetTemplate) {
        UserDefaults.standard.set(template.id, forKey: Self.adoptedTemplateKey)
        onAdopt(template)
        dismiss()
    }
}

// MARK: - Flow layout

/// A simple wrapping row layout for the category chips, so they reflow at large
/// Dynamic Type sizes and on compact-width screens instead of clipping.
struct FlowRow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if rowWidth + size.width > maxWidth, rowWidth > 0 {
                totalHeight += rowHeight + spacing
                totalWidth = max(totalWidth, rowWidth - spacing)
                rowWidth = 0
                rowHeight = 0
            }
            rowWidth += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        totalHeight += rowHeight
        totalWidth = max(totalWidth, rowWidth - spacing)
        return CGSize(width: min(totalWidth, maxWidth), height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

#Preview {
    FamilySetupView()
}
