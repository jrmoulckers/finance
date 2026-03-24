// SPDX-License-Identifier: BUSL-1.1
import SwiftUI
struct CategoriesView: View {
    @Environment(\.editMode) private var editMode
    @State private var viewModel: CategoriesViewModel
    @State private var showingCreateForm = false
    @State private var editingCategory: CategoryItem?
    @State private var deletingCategory: CategoryItem?
    @State private var showingDeleteConfirmation = false
    init(viewModel: CategoriesViewModel = CategoriesViewModel(repository: RepositoryProvider.shared.categories)) { _viewModel = State(initialValue: viewModel) }
    var body: some View {
        Group {
            if viewModel.isLoading && viewModel.categories.isEmpty { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).accessibilityLabel(String(localized: "Loading")) }
            else if viewModel.categories.isEmpty && !viewModel.isLoading { EmptyStateView(systemImage: "tag", title: String(localized: "No Categories"), message: String(localized: "Create a category to organise your transactions."), actionLabel: String(localized: "Add Category"), action: { showingCreateForm = true }) }
            else { categoriesList }
        }
        .navigationTitle(String(localized: "Categories"))
        .searchable(text: $viewModel.searchText, prompt: String(localized: "Search categories"))
        .toolbar {
            ToolbarItem(placement: .primaryAction) { Button { showingCreateForm = true } label: { Image(systemName: "plus") }.accessibilityLabel(String(localized: "Add category")).accessibilityHint(String(localized: "Opens a form to create a new category")) }
            ToolbarItem(placement: .topBarLeading) { EditButton().accessibilityLabel(String(localized: "Edit categories")).accessibilityHint(String(localized: "Enables reordering and deletion of categories")) }
        }
        .sheet(isPresented: $showingCreateForm) { CategoryFormView(mode: .create) { n, c, i in Task { await viewModel.createCategory(name: n, colorHex: c, iconName: i) } } }
        .sheet(item: $editingCategory) { cat in CategoryFormView(mode: .edit(cat)) { n, c, i in Task { await viewModel.updateCategory(id: cat.id, name: n, colorHex: c, iconName: i) } } }
        .confirmationDialog(String(localized: "Delete Category"), isPresented: $showingDeleteConfirmation, titleVisibility: .visible, presenting: deletingCategory) { cat in
            Button(String(localized: "Delete"), role: .destructive) { Task { await viewModel.deleteCategory(id: cat.id) } }
            Button(String(localized: "Cancel"), role: .cancel) {}
        } message: { cat in Text(String(localized: "Are you sure you want to delete \"\(cat.name)\"? Transactions using this category will become uncategorised.")) }
        .refreshable { await viewModel.loadCategories() }
        .task { await viewModel.loadCategories() }
        .alert(String(localized: "Error"), isPresented: Binding(get: { viewModel.showError }, set: { if !$0 { viewModel.dismissError() } })) {
            Button(String(localized: "Retry")) { Task { await viewModel.loadCategories() } }
            Button(String(localized: "Dismiss"), role: .cancel) { viewModel.dismissError() }
        } message: { Text(viewModel.errorMessage ?? "") }
    }
    private var categoriesList: some View {
        List {
            ForEach(viewModel.categories) { cat in
                categoryRow(cat).contentShape(Rectangle()).onTapGesture { editingCategory = cat }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) { Button(role: .destructive) { deletingCategory = cat; showingDeleteConfirmation = true } label: { Label(String(localized: "Delete"), systemImage: "trash") }.accessibilityLabel(String(localized: "Delete \(cat.name)")) }
                    .swipeActions(edge: .leading, allowsFullSwipe: false) { Button { editingCategory = cat } label: { Label(String(localized: "Edit"), systemImage: "pencil") }.tint(.blue).accessibilityLabel(String(localized: "Edit \(cat.name)")) }
            }.onMove { s, d in viewModel.reorderCategories(fromOffsets: s, toOffset: d) }
        }.listStyle(.insetGrouped)
    }
    private func categoryRow(_ category: CategoryItem) -> some View {
        HStack(spacing: 12) {
            ZStack { Circle().fill(Color(hex: category.colorHex) ?? .gray).frame(width: 36, height: 36); Image(systemName: category.iconName).font(.system(size: 16, weight: .medium)).foregroundStyle(.white) }.accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) { Text(category.name).font(.body); if category.isDefault { Text(String(localized: "Default")).font(.caption).foregroundStyle(.secondary) } }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary).accessibilityHidden(true)
        }.padding(.vertical, 4).accessibilityElement(children: .combine).accessibilityLabel(category.name).accessibilityValue(category.isDefault ? String(localized: "Default category") : "").accessibilityHint(String(localized: "Double tap to edit this category"))
    }
}
extension CategoryItem: Hashable { func hash(into hasher: inout Hasher) { hasher.combine(id) } }
extension Color {
    init?(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespacesAndNewlines); if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let rgb = UInt64(h, radix: 16) else { return nil }
        self.init(red: Double((rgb >> 16) & 0xFF) / 255.0, green: Double((rgb >> 8) & 0xFF) / 255.0, blue: Double(rgb & 0xFF) / 255.0)
    }
}
#Preview { NavigationStack { CategoriesView(viewModel: CategoriesViewModel(repository: MockCategoryRepository())) } }