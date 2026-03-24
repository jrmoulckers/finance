// SPDX-License-Identifier: BUSL-1.1

// TransactionEditView.swift
// Finance
//
// Sheet-presented form for editing an existing transaction. Pre-populates
// all fields from the transaction, validates changes, and supports
// optimistic UI updates with error rollback.

import SwiftUI

// MARK: - View

struct TransactionEditView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: TransactionEditViewModel

    /// Optional callback invoked after a successful save or delete so the
    /// presenting view can refresh its data.
    private let onComplete: (() -> Void)?

    init(
        transaction: TransactionItem,
        transactionRepository: TransactionRepository = RepositoryProvider.shared.transactions,
        accountRepository: AccountRepository = RepositoryProvider.shared.accounts,
        onComplete: (() -> Void)? = nil
    ) {
        _viewModel = State(initialValue: TransactionEditViewModel(
            transactionRepository: transactionRepository,
            accountRepository: accountRepository,
            transaction: transaction
        ))
        self.onComplete = onComplete
    }

    /// Internal initializer for testing and previews with a pre-built view model.
    init(viewModel: TransactionEditViewModel, onComplete: (() -> Void)? = nil) {
        _viewModel = State(initialValue: viewModel)
        self.onComplete = onComplete
    }

    var body: some View {
        NavigationStack {
            Form {
                transactionTypeSection
                detailsSection
                dateSection
                noteSection
                deleteSection
            }
            .navigationTitle(String(localized: "Edit Transaction"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                        .accessibilityLabel(String(localized: "Cancel"))
                        .accessibilityHint(String(localized: "Dismisses the edit form without saving changes"))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Save")) { viewModel.showingSaveConfirmation = true }
                    .disabled(!viewModel.hasChanges || viewModel.isProcessing)
                    .accessibilityLabel(String(localized: "Save"))
                    .accessibilityHint(String(localized: "Confirms and saves your changes to this transaction"))
                }
            }
            .alert(String(localized: "Validation Error"), isPresented: $viewModel.showingValidationError) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: { Text(viewModel.validationMessage) }
            .confirmationDialog(String(localized: "Save Changes"), isPresented: $viewModel.showingSaveConfirmation, titleVisibility: .visible) {
                Button(String(localized: "Update Transaction")) { Task { await performSave() } }
                Button(String(localized: "Cancel"), role: .cancel) {}
            } message: { Text(String(localized: "Are you sure you want to save your changes to this transaction?")) }
            .confirmationDialog(String(localized: "Delete Transaction"), isPresented: $viewModel.showingDeleteConfirmation, titleVisibility: .visible) {
                Button(String(localized: "Delete"), role: .destructive) { Task { await performDelete() } }
                Button(String(localized: "Cancel"), role: .cancel) {}
            } message: { Text(String(localized: "Are you sure you want to delete this transaction? This action cannot be undone.")) }
            .alert(String(localized: "Error"), isPresented: Binding(get: { viewModel.showError }, set: { if !$0 { viewModel.dismissError() } })) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: { Text(viewModel.errorMessage ?? "") }
            .task { await viewModel.loadData() }
        }
    }

    // MARK: - Transaction Type

    private var transactionTypeSection: some View {
        Section(String(localized: "Type")) {
            Picker(String(localized: "Transaction Type"), selection: $viewModel.transactionType) {
                ForEach(TransactionTypeUI.allCases, id: \.rawValue) { type in
                    Label(type.displayName, systemImage: type.systemImage).tag(type)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel(String(localized: "Transaction Type"))
        }
    }

    // MARK: - Details

    private var detailsSection: some View {
        Section(String(localized: "Details")) {
            HStack {
                Text(currencySymbol).font(.title2).foregroundStyle(.secondary)
                TextField(String(localized: "0.00"), text: $viewModel.amountText)
                    .font(.title2).keyboardType(.decimalPad)
                    .accessibilityLabel(String(localized: "Transaction amount"))
                    .accessibilityHint(String(localized: "Enter the amount in dollars"))
            }
            TextField(String(localized: "Who was this payment to?"), text: $viewModel.payee)
                .accessibilityLabel(String(localized: "Payee name"))
            Picker(String(localized: "Account"), selection: $viewModel.selectedAccountId) {
                Text(String(localized: "Select Account")).tag(nil as String?)
                ForEach(viewModel.accounts) { account in
                    Label(account.name, systemImage: account.icon).tag(account.id as String?)
                }
            }.accessibilityLabel(String(localized: "Account"))
            Picker(String(localized: "Category"), selection: $viewModel.selectedCategoryId) {
                Text(String(localized: "Select Category")).tag(nil as String?)
                ForEach(viewModel.categories) { category in
                    Label(category.name, systemImage: category.icon).tag(category.id as String?)
                }
            }.accessibilityLabel(String(localized: "Category"))
        }
    }

    // MARK: - Date

    private var dateSection: some View {
        Section(String(localized: "Date")) {
            DatePicker(String(localized: "Transaction date"), selection: $viewModel.date, in: ...Date(), displayedComponents: .date)
                .accessibilityLabel(String(localized: "Transaction date"))
        }
    }

    // MARK: - Note

    private var noteSection: some View {
        Section(String(localized: "Note (optional)")) {
            TextField(String(localized: "Add a note..."), text: $viewModel.note, axis: .vertical)
                .lineLimit(3).accessibilityLabel(String(localized: "Note"))
        }
    }

    // MARK: - Delete

    private var deleteSection: some View {
        Section {
            Button(role: .destructive) { viewModel.showingDeleteConfirmation = true } label: {
                HStack {
                    Spacer()
                    if viewModel.isDeleting {
                        ProgressView().accessibilityLabel(String(localized: "Deleting transaction"))
                    } else {
                        Label(String(localized: "Delete Transaction"), systemImage: "trash")
                    }
                    Spacer()
                }
            }
            .disabled(viewModel.isProcessing)
            .accessibilityLabel(String(localized: "Delete Transaction"))
            .accessibilityHint(String(localized: "Permanently removes this transaction. Requires confirmation."))
        }
    }

    // MARK: - Actions

    private func performSave() async {
        if await viewModel.save() {
            HapticManager.shared.transactionSaved()
            onComplete?()
            dismiss()
        } else { HapticManager.shared.error() }
    }

    private func performDelete() async {
        if await viewModel.delete() {
            HapticManager.shared.transactionSaved()
            onComplete?()
            dismiss()
        } else { HapticManager.shared.error() }
    }

    private var currencySymbol: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = viewModel.currencyCode
        return formatter.currencySymbol ?? "$"
    }
}

#Preview {
    TransactionEditView(
        viewModel: TransactionEditViewModel(
            transactionRepository: MockTransactionRepository(),
            accountRepository: MockAccountRepository(),
            transaction: TransactionItem(
                id: "preview-1", payee: "Whole Foods",
                category: "Groceries", accountName: "Main Checking",
                amountMinorUnits: -85_40, currencyCode: "USD",
                date: .now, type: .expense, status: .cleared
            )
        )
    )
}