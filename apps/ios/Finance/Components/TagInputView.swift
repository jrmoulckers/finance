// SPDX-License-Identifier: BUSL-1.1

// TagInputView.swift
// Finance
// References: #1487
//
// A text field with autocomplete suggestions for adding tags to transactions.
// Displays selected tags as removable chips and offers "Create new" when no match.

import Observation
import os
import SwiftUI

// MARK: - ViewModel

@Observable
final class TagInputViewModel {
    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "TagInputViewModel"
    )

    /// All tags available for autocomplete suggestions.
    var allAvailableTags: [Tag] = []

    /// Currently selected tags for this transaction.
    var selectedTags: [Tag] = []

    /// The current text in the input field.
    var inputText = ""

    /// Whether the suggestions dropdown should be visible.
    var showingSuggestions: Bool {
        !inputText.isEmpty && !filteredSuggestions.isEmpty
    }

    /// Whether to show the "Create new" option.
    var showCreateNew: Bool {
        !inputText.isEmpty && !allAvailableTags.contains(where: {
            $0.name.caseInsensitiveCompare(inputText.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
        })
    }

    /// Filtered suggestions based on current input text.
    var filteredSuggestions: [Tag] {
        let trimmed = inputText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return [] }
        return allAvailableTags.filter { tag in
            tag.name.localizedCaseInsensitiveContains(trimmed)
                && !selectedTags.contains(where: { $0.name == tag.name })
        }
        .prefix(5)
        .map { $0 }
    }

    /// Adds a tag from suggestions.
    func selectTag(_ tag: Tag) {
        guard !selectedTags.contains(where: { $0.name == tag.name }) else { return }
        selectedTags.append(tag)
        inputText = ""
        Self.logger.info("Tag selected: \(tag.name, privacy: .public)")
        AccessibilityNotification.Announcement(
            String(localized: "Tag \(tag.displayName) added")
        ).post()
    }

    /// Creates and selects a new tag from the current input text.
    func createAndSelectTag() {
        let name = inputText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !name.isEmpty else { return }
        guard !selectedTags.contains(where: { $0.name == name }) else {
            inputText = ""
            return
        }
        let newTag = Tag(name: name)
        selectedTags.append(newTag)
        // Add to available tags for future autocomplete
        if !allAvailableTags.contains(where: { $0.name == name }) {
            allAvailableTags.append(newTag)
        }
        inputText = ""
        Self.logger.info("New tag created: \(name, privacy: .public)")
        AccessibilityNotification.Announcement(
            String(localized: "New tag \(newTag.displayName) created and added")
        ).post()
    }

    /// Removes a tag from the selection.
    func removeTag(_ tag: Tag) {
        selectedTags.removeAll { $0.id == tag.id }
        Self.logger.info("Tag removed: \(tag.name, privacy: .public)")
        AccessibilityNotification.Announcement(
            String(localized: "Tag \(tag.displayName) removed")
        ).post()
    }
}

// MARK: - View

/// A tag input field with autocomplete and inline selected tag chips.
struct TagInputView: View {
    @Bindable var viewModel: TagInputViewModel
    @FocusState private var isInputFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Selected tags display
            if !viewModel.selectedTags.isEmpty {
                selectedTagsSection
            }

            // Input field
            inputSection

            // Suggestions
            if viewModel.showingSuggestions || viewModel.showCreateNew {
                suggestionsSection
            }
        }
    }

    // MARK: - Selected Tags

    private var selectedTagsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(viewModel.selectedTags) { tag in
                    TagView(
                        tag: tag,
                        isRemovable: true,
                        onRemove: { viewModel.removeTag(tag) }
                    )
                }
            }
            .padding(.horizontal, 2)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "Selected tags"))
    }

    // MARK: - Input Field

    private var inputSection: some View {
        HStack {
            Image(systemName: "tag")
                .foregroundStyle(.secondary)
                .font(.caption)

            TextField(
                String(localized: "Add tag…"),
                text: $viewModel.inputText
            )
            .focused($isInputFocused)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .onSubmit {
                if viewModel.showCreateNew {
                    viewModel.createAndSelectTag()
                } else if let firstSuggestion = viewModel.filteredSuggestions.first {
                    viewModel.selectTag(firstSuggestion)
                }
            }
            .accessibilityLabel(String(localized: "Tag input"))
            .accessibilityHint(String(localized: "Type to search for tags or create a new one"))

            if !viewModel.inputText.isEmpty {
                Button {
                    viewModel.inputText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel(String(localized: "Clear tag input"))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Suggestions

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(viewModel.filteredSuggestions) { tag in
                Button {
                    viewModel.selectTag(tag)
                    isInputFocused = false
                } label: {
                    HStack {
                        TagView(tag: tag)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "Select tag \(tag.displayName)"))

                if tag.id != viewModel.filteredSuggestions.last?.id {
                    Divider().padding(.leading, 12)
                }
            }

            if viewModel.showCreateNew {
                Divider().padding(.leading, 12)

                Button {
                    viewModel.createAndSelectTag()
                    isInputFocused = false
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill")
                            .foregroundStyle(.green)
                        Text(String(localized: "Create \"\(viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines))\""))
                            .foregroundStyle(.primary)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "Create new tag \(viewModel.inputText)"))
                .accessibilityHint(String(localized: "Creates a new tag and adds it to this transaction"))
            }
        }
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(.quaternary, lineWidth: 1)
        )
    }
}

// MARK: - Preview

#Preview {
    struct PreviewWrapper: View {
        @State private var viewModel = TagInputViewModel()

        var body: some View {
            VStack {
                TagInputView(viewModel: viewModel)
                    .padding()
            }
            .onAppear {
                viewModel.allAvailableTags = [
                    Tag(name: "groceries"),
                    Tag(name: "travel:flights"),
                    Tag(name: "travel:hotels"),
                    Tag(name: "subscriptions"),
                    Tag(name: "work:expenses"),
                    Tag(name: "dining"),
                    Tag(name: "entertainment"),
                ]
                viewModel.selectedTags = [
                    Tag(name: "groceries"),
                ]
            }
        }
    }

    return PreviewWrapper()
}
