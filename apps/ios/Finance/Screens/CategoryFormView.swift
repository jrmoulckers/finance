// SPDX-License-Identifier: BUSL-1.1

// CategoryFormView.swift
// Finance
//
// SwiftUI form for creating or editing a category. Includes a name
// field, a grid-based color picker, and a grid-based SF Symbol icon
// picker. Supports both create and edit modes.

import SwiftUI

// MARK: - View

struct CategoryFormView: View {
    @Environment(\.dismiss) private var dismiss

    private let viewModel: CategoryListViewModel
    private let editingCategory: CategoryItem?

    @State private var name: String
    @State private var selectedColorHex: String
    @State private var selectedIcon: String
    @State private var isSaving = false
    @State private var showingValidationError = false
    @State private var validationMessage = ""

    /// Whether this form is editing an existing category.
    var isEditing: Bool { editingCategory != nil }

    /// Navigation title for the form.
    var navigationTitle: String {
        isEditing ? String(localized: "Edit Category") : String(localized: "New Category")
    }

    /// Label for the primary action button.
    var saveButtonTitle: String {
        isEditing ? String(localized: "Update") : String(localized: "Save")
    }

    // MARK: - Init

    init(viewModel: CategoryListViewModel, category: CategoryItem? = nil) {
        self.viewModel = viewModel
        self.editingCategory = category

        _name = State(initialValue: category?.name ?? "")
        _selectedColorHex = State(initialValue: category?.colorHex ?? CategoryColors.presets[0].hex)
        _selectedIcon = State(initialValue: category?.icon ?? CategoryIcons.presets[0])
    }

    var body: some View {
        NavigationStack {
            Form {
                nameSection
                colorSection
                iconSection
                previewSection
            }
            .navigationTitle(navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the category form without saving"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView()
                        } else {
                            Text(saveButtonTitle)
                        }
                    }
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel(saveButtonTitle)
                    .accessibilityHint(String(localized: "Saves the category and closes the form"))
                }
            }
            .alert(String(localized: "Validation Error"), isPresented: $showingValidationError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(validationMessage)
            }
        }
    }

    // MARK: - Name Section

    private var nameSection: some View {
        Section {
            TextField(String(localized: "Category name"), text: $name)
                .font(.body)
                .autocorrectionDisabled(false)
                .textInputAutocapitalization(.words)
                .accessibilityIdentifier("category_name_field")
                .accessibilityLabel(String(localized: "Category name"))
                .accessibilityHint(String(localized: "Enter a name for this category"))
        } header: {
            Text(String(localized: "Name"))
        }
    }

    // MARK: - Color Section

    private var colorSection: some View {
        Section {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6), spacing: 12) {
                ForEach(CategoryColors.presets, id: \.hex) { preset in
                    colorSwatch(preset)
                }
            }
            .padding(.vertical, 8)
        } header: {
            Text(String(localized: "Color"))
        }
    }

    private func colorSwatch(_ preset: (name: String, hex: String)) -> some View {
        let isSelected = selectedColorHex == preset.hex
        return Button {
            selectedColorHex = preset.hex
        } label: {
            ZStack {
                Circle()
                    .fill(Color(hex: preset.hex) ?? .accentColor)
                    .frame(width: 44, height: 44)

                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.caption.bold())
                        .foregroundStyle(.white)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(preset.name)
        .accessibilityValue(isSelected ? String(localized: "Selected") : "")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(String(localized: "Selects \(preset.name) as the category color"))
    }

    // MARK: - Icon Section

    private var iconSection: some View {
        Section {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6), spacing: 12) {
                ForEach(CategoryIcons.presets, id: \.self) { icon in
                    iconCell(icon)
                }
            }
            .padding(.vertical, 8)
        } header: {
            Text(String(localized: "Icon"))
        }
    }

    private func iconCell(_ icon: String) -> some View {
        let isSelected = selectedIcon == icon
        return Button {
            selectedIcon = icon
        } label: {
            Image(systemName: icon)
                .font(.body)
                .frame(width: 44, height: 44)
                .foregroundStyle(isSelected ? .white : .primary)
                .background(
                    isSelected
                        ? AnyShapeStyle(Color(hex: selectedColorHex) ?? .accentColor)
                        : AnyShapeStyle(Color.secondary.opacity(0.15)),
                    in: RoundedRectangle(cornerRadius: 8)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icon.replacingOccurrences(of: ".", with: " "))
        .accessibilityValue(isSelected ? String(localized: "Selected") : "")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(String(localized: "Selects this icon for the category"))
    }

    // MARK: - Preview Section

    private var previewSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: selectedIcon)
                    .font(.body)
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Color(hex: selectedColorHex) ?? .accentColor, in: RoundedRectangle(cornerRadius: 8))
                    .accessibilityHidden(true)

                Text(name.isEmpty ? String(localized: "Category Name") : name)
                    .font(.body)
                    .foregroundStyle(name.isEmpty ? .secondary : .primary)
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "Preview: \(name.isEmpty ? "Category Name" : name)"))
        } header: {
            Text(String(localized: "Preview"))
        }
    }

    // MARK: - Save

    private func save() async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            validationMessage = String(localized: "Category name cannot be empty.")
            showingValidationError = true
            return
        }

        isSaving = true
        defer { isSaving = false }

        let success: Bool
        if let existing = editingCategory {
            success = await viewModel.updateCategory(
                id: existing.id,
                name: trimmed,
                colorHex: selectedColorHex,
                icon: selectedIcon
            )
        } else {
            success = await viewModel.createCategory(
                name: trimmed,
                colorHex: selectedColorHex,
                icon: selectedIcon
            )
        }

        if success {
            dismiss()
        }
    }
}

#Preview("Create") {
    CategoryFormView(
        viewModel: CategoryListViewModel(repository: MockCategoryRepository())
    )
}

#Preview("Edit") {
    CategoryFormView(
        viewModel: CategoryListViewModel(repository: MockCategoryRepository()),
        category: CategoryItem(
            id: "c1", name: "Groceries",
            colorHex: "#38A169", icon: "cart", sortOrder: 0
        )
    )
}
