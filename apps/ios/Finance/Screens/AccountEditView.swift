// SPDX-License-Identifier: BUSL-1.1

// AccountEditView.swift
// Finance
//
// Sheet-presented form for editing an existing account. Supports
// changing the account name, type, and currency with validation.

import SwiftUI

// MARK: - View

struct AccountEditView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: AccountEditViewModel

    /// Optional callback invoked after a successful save so the
    /// presenting view can refresh its data.
    private let onSave: ((AccountItem) -> Void)?

    init(
        account: AccountItem,
        repository: AccountRepository = RepositoryProvider.shared.accounts,
        onSave: ((AccountItem) -> Void)? = nil
    ) {
        _viewModel = State(initialValue: AccountEditViewModel(
            repository: repository,
            account: account
        ))
        self.onSave = onSave
    }

    /// Internal initializer for testing and previews with a pre-built view model.
    init(viewModel: AccountEditViewModel, onSave: ((AccountItem) -> Void)? = nil) {
        _viewModel = State(initialValue: viewModel)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                nameSection
                typeSection
                currencySection
                notesSection
            }
            .navigationTitle(viewModel.navigationTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the edit form without saving changes"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await performSave() }
                    } label: {
                        if viewModel.isSaving {
                            ProgressView()
                                .accessibilityLabel(String(localized: "Saving"))
                        } else {
                            Text(String(localized: "Save"))
                        }
                    }
                    .disabled(!viewModel.hasChanges || viewModel.isSaving)
                    .accessibilityLabel(String(localized: "Save"))
                    .accessibilityHint(String(localized: "Confirms and saves your changes to this account"))
                }
            }
            .alert(String(localized: "Validation Error"), isPresented: $viewModel.showingValidationError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.validationMessage)
            }
            .alert(String(localized: "Error"), isPresented: Binding(
                get: { viewModel.showError },
                set: { if !$0 { viewModel.dismissError() } }
            )) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
        }
    }

    // MARK: - Name Section

    private var nameSection: some View {
        Section {
            TextField(String(localized: "Account Name"), text: $viewModel.name)
                .accessibilityLabel(String(localized: "Account name"))
                .accessibilityHint(String(localized: "Enter the name for this account"))
        } header: {
            Text(String(localized: "Name"))
        }
    }

    // MARK: - Type Section

    private var typeSection: some View {
        Section {
            Picker(String(localized: "Account Type"), selection: $viewModel.selectedType) {
                ForEach(AccountTypeUI.allCases, id: \.rawValue) { type in
                    Label(type.displayName, systemImage: type.systemImage)
                        .tag(type)
                }
            }
            .accessibilityLabel(String(localized: "Account type"))
            .accessibilityHint(String(localized: "Select the type of account"))
        } header: {
            Text(String(localized: "Type"))
        }
    }

    // MARK: - Currency Section

    private var currencySection: some View {
        Section {
            Picker(String(localized: "Currency"), selection: $viewModel.currencyCode) {
                ForEach(AccountEditViewModel.supportedCurrencies, id: \.self) { code in
                    Text(code).tag(code)
                }
            }
            .accessibilityLabel(String(localized: "Currency"))
            .accessibilityHint(String(localized: "Select the currency for this account"))
        } header: {
            Text(String(localized: "Currency"))
        }
    }

    // MARK: - Notes Section

    private var notesSection: some View {
        Section {
            TextField(String(localized: "Add a note..."), text: $viewModel.notes, axis: .vertical)
                .lineLimit(3)
                .accessibilityLabel(String(localized: "Notes"))
                .accessibilityHint(String(localized: "Optional notes about this account"))
        } header: {
            Text(String(localized: "Notes (optional)"))
        }
    }

    // MARK: - Actions

    private func performSave() async {
        if await viewModel.save() {
            HapticManager.shared.transactionSaved()
            onSave?(viewModel.updatedAccount)
            dismiss()
        } else {
            HapticManager.shared.error()
        }
    }
}

#Preview {
    AccountEditView(
        account: AccountItem(
            id: "preview-1", name: "Main Checking",
            balanceMinorUnits: 12_450_00, currencyCode: "USD",
            type: .checking, icon: "building.columns", isArchived: false
        ),
        repository: MockAccountRepository()
    )
}
