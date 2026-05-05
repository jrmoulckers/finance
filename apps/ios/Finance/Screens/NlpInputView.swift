// SPDX-License-Identifier: BUSL-1.1

// NlpInputView.swift
// Finance
//
// Natural language transaction input screen. Lets users type free-form text
// like "Coffee at Starbucks $4.50 yesterday" and see an inline preview of
// parsed fields (amount, payee, category, date) with confidence indicators,
// merchant suggestions, quick-fix tap-to-correct, and recent input history.
//
// Follows Apple HIG, supports VoiceOver, Dynamic Type, and Reduce Motion.
// Uses @Observable ViewModel pattern (iOS 17+).

import SwiftUI

// MARK: - View

struct NlpInputView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var viewModel: NlpInputViewModel

    init(viewModel: NlpInputViewModel = NlpInputViewModel()) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    inputSection
                    suggestionsSection
                    parsedPreviewSection
                    quickFixSection
                    saveSection
                    recentEntriesSection
                }
                .padding()
            }
            .navigationTitle(String(localized: "Quick Add"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the quick add screen"))
                }
            }
            .alert(String(localized: "Error"), isPresented: $viewModel.showingError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .task { await viewModel.loadData() }
        }
    }

    // MARK: - Input Section

    private var inputSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(String(localized: "Type a transaction"))
                .font(.headline)
                .accessibilityAddTraits(.isHeader)

            Text(String(localized: "e.g. \"Coffee at Starbucks $4.50 yesterday\""))
                .font(.subheadline)
                .foregroundStyle(.secondary)

            HStack {
                TextField(
                    String(localized: "Describe your transaction…"),
                    text: Binding(
                        get: { viewModel.inputText },
                        set: { viewModel.onInputChanged($0) }
                    ),
                    axis: .vertical
                )
                .textFieldStyle(.roundedBorder)
                .lineLimit(1...3)
                .textInputAutocapitalization(.sentences)
                .autocorrectionDisabled()
                .accessibilityLabel(String(localized: "Natural language transaction input"))
                .accessibilityHint(String(localized: "Type a transaction description like Coffee at Starbucks $4.50"))
                .accessibilityIdentifier("nlp_input_field")

                if !viewModel.inputText.isEmpty {
                    Button {
                        viewModel.reset()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel(String(localized: "Clear input"))
                    .accessibilityIdentifier("nlp_clear_button")
                }
            }

            if viewModel.isParsing {
                HStack(spacing: 6) {
                    ProgressView()
                        .controlSize(.small)
                    Text(String(localized: "Parsing…"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel(String(localized: "Parsing your input"))
            }
        }
    }

    // MARK: - Suggestions Section

    @ViewBuilder
    private var suggestionsSection: some View {
        if viewModel.showSuggestions && !viewModel.suggestions.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(String(localized: "Suggestions"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.isHeader)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(viewModel.suggestions, id: \.self) { suggestion in
                            Button {
                                viewModel.acceptSuggestion(suggestion)
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "clock.arrow.circlepath")
                                        .font(.caption2)
                                    Text(suggestion)
                                        .font(.subheadline)
                                        .lineLimit(1)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(.tint.opacity(0.1), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(String(localized: "Suggestion: \(suggestion)"))
                            .accessibilityHint(String(localized: "Double tap to use this suggestion"))
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                }
            }
            .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: viewModel.showSuggestions)
        }
    }

    // MARK: - Parsed Preview Section

    @ViewBuilder
    private var parsedPreviewSection: some View {
        if let result = viewModel.parseResult, !viewModel.inputText.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(String(localized: "Parsed Preview"))
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .accessibilityAddTraits(.isHeader)

                    Spacer()

                    if result.isValid {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .accessibilityLabel(String(localized: "Valid transaction"))
                    }
                }

                // Parsed field tags
                FlowLayout(spacing: 8) {
                    ForEach(viewModel.effectiveParsedFields) { field in
                        ParsedFieldTag(
                            field: field,
                            isEditing: viewModel.editingField == field.id,
                            onTapToCorrect: {
                                viewModel.startQuickFix(for: field.id)
                            }
                        )
                    }
                }

                // Confidence indicator
                ConfidenceIndicatorView(confidence: result.confidence)
            }
            .padding()
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "Parsed transaction preview"))
            .accessibilityIdentifier("parsed_preview_section")
        }
    }

    // MARK: - Quick-Fix Section

    @ViewBuilder
    private var quickFixSection: some View {
        if let editingField = viewModel.editingField {
            VStack(alignment: .leading, spacing: 8) {
                Text(String(localized: "Correct \(editingField.displayLabel)"))
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .accessibilityAddTraits(.isHeader)

                HStack {
                    TextField(
                        editingField.displayLabel,
                        text: Binding(
                            get: { viewModel.fieldOverrides[editingField] ?? "" },
                            set: { viewModel.fieldOverrides[editingField] = $0 }
                        )
                    )
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel(String(localized: "Corrected value for \(editingField.displayLabel)"))
                    .accessibilityIdentifier("quick_fix_field")

                    Button {
                        let value = viewModel.fieldOverrides[editingField] ?? ""
                        viewModel.commitQuickFix(for: editingField, value: value)
                    } label: {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.green)
                    }
                    .accessibilityLabel(String(localized: "Confirm correction"))
                    .accessibilityIdentifier("quick_fix_confirm")

                    Button {
                        viewModel.cancelQuickFix()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityLabel(String(localized: "Cancel correction"))
                    .accessibilityIdentifier("quick_fix_cancel")
                }
            }
            .padding()
            .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
            .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: viewModel.editingField != nil)
        }
    }

    // MARK: - Save Section

    @ViewBuilder
    private var saveSection: some View {
        if viewModel.parseResult != nil && !viewModel.inputText.isEmpty {
            VStack(spacing: 12) {
                Button {
                    Task {
                        let saved = await viewModel.saveTransaction()
                        if saved { dismiss() }
                    }
                } label: {
                    HStack {
                        if viewModel.isSaving {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        } else {
                            Image(systemName: "plus.circle.fill")
                        }
                        Text(String(localized: "Add Transaction"))
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!viewModel.canSave)
                .accessibilityLabel(String(localized: "Add transaction"))
                .accessibilityHint(
                    viewModel.canSave
                        ? String(localized: "Saves the parsed transaction")
                        : String(localized: "Cannot save. Ensure an amount is parsed.")
                )
                .accessibilityIdentifier("nlp_save_button")

                if viewModel.isSaved {
                    Label(String(localized: "Transaction saved!"), systemImage: "checkmark.circle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.green)
                        .accessibilityLabel(String(localized: "Transaction saved successfully"))
                }
            }
        }
    }

    // MARK: - Recent Entries Section

    @ViewBuilder
    private var recentEntriesSection: some View {
        if !viewModel.recentEntries.isEmpty && viewModel.inputText.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(String(localized: "Recent"))
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .accessibilityAddTraits(.isHeader)

                    Spacer()

                    Button(String(localized: "Clear All")) {
                        viewModel.clearRecentEntries()
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel(String(localized: "Clear all recent entries"))
                    .accessibilityIdentifier("clear_recent_button")
                }

                ForEach(viewModel.recentEntries) { entry in
                    HStack {
                        Image(systemName: "clock")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Text(entry.text)
                            .font(.subheadline)
                            .lineLimit(1)

                        Spacer()

                        Text(entry.timestamp, style: .relative)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 10)
                    .background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 8))
                    .contentShape(RoundedRectangle(cornerRadius: 8))
                    .onTapGesture { viewModel.selectRecentEntry(entry) }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            viewModel.removeRecentEntry(entry)
                        } label: {
                            Label(String(localized: "Delete"), systemImage: "trash")
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(String(localized: "Recent entry: \(entry.text)"))
                    .accessibilityHint(String(localized: "Double tap to use this entry"))
                    .accessibilityAddTraits(.isButton)
                }
            }
        }
    }
}

// MARK: - Flow Layout

/// A simple flow/wrapping layout for parsed field tags.
///
/// Arranges children horizontally, wrapping to the next line when the
/// available width is exceeded. Uses the SwiftUI Layout protocol.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            guard index < subviews.count else { break }
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: .unspecified
            )
        }
    }

    private struct ArrangementResult {
        var positions: [CGPoint]
        var size: CGSize
    }

    private func arrangeSubviews(proposal: ProposedViewSize, subviews: Subviews) -> ArrangementResult {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)

            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += lineHeight + spacing
                lineHeight = 0
            }

            positions.append(CGPoint(x: currentX, y: currentY))
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
            totalWidth = max(totalWidth, currentX - spacing)
        }

        return ArrangementResult(
            positions: positions,
            size: CGSize(width: totalWidth, height: currentY + lineHeight)
        )
    }
}

// MARK: - Preview

#Preview("NLP Input") {
    NlpInputView()
        .environment(BiometricAuthManager())
}
