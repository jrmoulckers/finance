// SPDX-License-Identifier: BUSL-1.1

// CategoryListView.swift
// Finance
//
// Displays all user categories with color swatches and icons.
// Supports swipe-to-delete, pull-to-refresh, and navigation to
// the create/edit form. Accessible via Settings > Manage Categories.

import SwiftUI

// MARK: - View

struct CategoryListView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: CategoryListViewModel

    init(viewModel: CategoryListViewModel = CategoryListViewModel(
        repository: RepositoryProvider.shared.categories
    )) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.categories.isEmpty {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel(String(localized: "Loading"))
                } else if viewModel.categories.isEmpty && !viewModel.isLoading {
                    EmptyStateView(
                        systemImage: "tag",
                        title: String(localized: "No Categories"),
                        message: String(localized: "Create your first category to organise transactions."),
                        actionLabel: String(localized: "Add Category"),
                        action: { viewModel.showingCreateForm = true }
                    )
                } else {
                    categoryList
                }
            }
            .navigationTitle(String(localized: "Categories"))
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { viewModel.showingCreateForm = true } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("add_category_button")
                    .accessibilityLabel(String(localized: "Add category"))
                    .accessibilityHint(String(localized: "Opens a form to create a new category"))
                }
            }
            .sheet(isPresented: $viewModel.showingCreateForm, onDismiss: {
                Task { await viewModel.loadCategories() }
            }) {
                CategoryFormView(viewModel: viewModel)
            }
            .sheet(item: $viewModel.editingCategory, onDismiss: {
                Task { await viewModel.loadCategories() }
            }) { category in
                CategoryFormView(viewModel: viewModel, category: category)
            }
            .refreshable { await viewModel.loadCategories() }
            .task { await viewModel.loadCategories() }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "Retry")) { Task { await viewModel.loadCategories() } }
                Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .confirmationDialog(
                String(localized: "Delete Category?"),
                isPresented: $viewModel.showingDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "Delete"), role: .destructive) {
                    Task { await viewModel.deleteCategory() }
                }
                Button(String(localized: "Cancel"), role: .cancel) {
                    viewModel.cancelDelete()
                }
            } message: {
                if let category = viewModel.categoryToDelete {
                    Text(String(localized: "Are you sure you want to delete \"\(category.name)\"? Transactions using this category will be uncategorised."))
                }
            }
        }
    }

    // MARK: - Category List

    private var categoryList: some View {
        List {
            ForEach(viewModel.categories) { category in
                categoryRow(category)
                    .contentShape(Rectangle())
                    .onTapGesture { viewModel.editingCategory = category }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            viewModel.confirmDelete(category)
                        } label: {
                            Label(String(localized: "Delete"), systemImage: "trash")
                        }
                        .accessibilityLabel(String(localized: "Delete \(category.name)"))
                    }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Category Row

    private func categoryRow(_ category: CategoryItem) -> some View {
        HStack(spacing: 12) {
            // Color swatch with icon
            Image(systemName: category.icon)
                .font(.body)
                .foregroundStyle(.white)
                .frame(width: 36, height: 36)
                .background(category.color, in: RoundedRectangle(cornerRadius: 8))
                .accessibilityHidden(true)

            Text(category.name)
                .font(.body)
                .lineLimit(1)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(category.name)
        .accessibilityValue(String(localized: "Category with \(category.icon) icon"))
        .accessibilityHint(String(localized: "Double tap to edit this category"))
        .accessibilityAddTraits(.isButton)
    }
}

#Preview {
    CategoryListView(viewModel: CategoryListViewModel(
        repository: MockCategoryRepository()
    ))
}
