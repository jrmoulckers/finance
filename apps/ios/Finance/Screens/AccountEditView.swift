// SPDX-License-Identifier: BUSL-1.1
// AccountEditView.swift — Finance
import SwiftUI

struct AccountEditView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: AccountEditViewModel
    private let onSave: ((AccountItem) -> Void)?; private let onArchive: (() -> Void)?
    init(account: AccountItem, repository: AccountRepository = RepositoryProvider.shared.accounts, onSave: ((AccountItem) -> Void)? = nil, onArchive: (() -> Void)? = nil) { _viewModel = State(initialValue: AccountEditViewModel(repository: repository, account: account)); self.onSave = onSave; self.onArchive = onArchive }
    init(viewModel: AccountEditViewModel, onSave: ((AccountItem) -> Void)? = nil, onArchive: (() -> Void)? = nil) { _viewModel = State(initialValue: viewModel); self.onSave = onSave; self.onArchive = onArchive }
    var body: some View {
        NavigationStack {
            Form {
                Section(String(localized: "Account Name")) { TextField(String(localized: "Account name"), text: $viewModel.name).accessibilityLabel(String(localized: "Account name")).accessibilityHint(String(localized: "Enter a name for this account")) }
                Section(String(localized: "Account Type")) { Picker(String(localized: "Account Type"), selection: $viewModel.accountType) { ForEach(AccountTypeUI.allCases, id: \.rawValue) { Label($0.displayName, systemImage: $0.systemImage).tag($0) } }.accessibilityLabel(String(localized: "Account Type")) }
                Section(String(localized: "Notes (optional)")) { TextField(String(localized: "Add notes about this account..."), text: $viewModel.notes, axis: .vertical).lineLimit(3...6).accessibilityLabel(String(localized: "Account notes")).accessibilityHint(String(localized: "Optional notes about this account")) }
                if !viewModel.original.isArchived {
                    Section { Button(role: .destructive) { viewModel.showingArchiveConfirmation = true } label: { HStack { Spacer(); if viewModel.isArchiving { ProgressView().accessibilityLabel(String(localized: "Archiving account")) } else { Label(String(localized: "Archive Account"), systemImage: "archivebox") }; Spacer() } }.disabled(viewModel.isProcessing).accessibilityLabel(String(localized: "Archive Account")).accessibilityHint(String(localized: "Hides this account from main views. Data is preserved and can be restored.")) } footer: { Text(String(localized: "Archived accounts are hidden but not deleted. You can restore them at any time.")).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle(String(localized: "Edit Account")).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(String(localized: "Cancel")) { dismiss() }.accessibilityLabel(String(localized: "Cancel")).accessibilityHint(String(localized: "Dismisses the edit form without saving changes")) }
                ToolbarItem(placement: .confirmationAction) { Button(String(localized: "Save")) { Task { await performSave() } }.disabled(!viewModel.hasChanges || viewModel.isProcessing).accessibilityLabel(String(localized: "Save")).accessibilityHint(String(localized: "Saves your changes to this account")) }
            }
            .alert(String(localized: "Validation Error"), isPresented: $viewModel.showingValidationError) { Button(String(localized: "OK"), role: .cancel) {} } message: { Text(viewModel.validationMessage) }
            .confirmationDialog(String(localized: "Archive Account"), isPresented: $viewModel.showingArchiveConfirmation, titleVisibility: .visible) { Button(String(localized: "Archive"), role: .destructive) { Task { await performArchive() } }; Button(String(localized: "Cancel"), role: .cancel) {} } message: { Text(String(localized: "This account will be hidden from your main views. You can restore it later from the archived accounts section.")) }
            .alert(String(localized: "Error"), isPresented: Binding(get: { viewModel.showError }, set: { if !$0 { viewModel.dismissError() } })) { Button(String(localized: "OK"), role: .cancel) {} } message: { Text(viewModel.errorMessage ?? "") }
        }
    }
    private func performSave() async {
        if await viewModel.save() { HapticManager.shared.transactionSaved(); let t = viewModel.notes.trimmingCharacters(in: .whitespacesAndNewlines); onSave?(AccountItem(id: viewModel.original.id, name: viewModel.name.trimmingCharacters(in: .whitespacesAndNewlines), balanceMinorUnits: viewModel.original.balanceMinorUnits, currencyCode: viewModel.original.currencyCode, type: viewModel.accountType, icon: viewModel.accountType.systemImage, isArchived: viewModel.original.isArchived, notes: t.isEmpty ? nil : t)); dismiss() } else { HapticManager.shared.error() }
    }
    private func performArchive() async { if await viewModel.archive() { HapticManager.shared.transactionSaved(); onArchive?(); dismiss() } else { HapticManager.shared.error() } }
}
#Preview { AccountEditView(account: AccountItem(id: "p1", name: "Main Checking", balanceMinorUnits: 12_450_00, currencyCode: "USD", type: .checking, icon: "building.columns", isArchived: false, notes: "Primary")) }
