// SPDX-License-Identifier: BUSL-1.1

// TransactionDetailView.swift
// Finance
// References: #647

import os
import PhotosUI
import SwiftUI

struct TransactionDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var transaction: TransactionItem
    @State private var isEditingNotes = false
    @State private var editedNotes: String
    @State private var showingDeleteConfirmation = false
    @State private var showingEditSheet = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var receiptImageData: Data?
    @State private var isDeleting = false
    @State private var errorMessage: String?
    private let repository: TransactionRepository

    private static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "com.finance", category: "TransactionDetailView")

    init(transaction: TransactionItem, repository: TransactionRepository = RepositoryProvider.shared.transactions) {
        _transaction = State(initialValue: transaction); _editedNotes = State(initialValue: transaction.notes); _receiptImageData = State(initialValue: transaction.receiptData); self.repository = repository
    }

    var body: some View {
        List { headerSection; detailsSection; notesSection; receiptSection; actionsSection }
        .listStyle(.insetGrouped).navigationTitle(String(localized: "Transaction Details")).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .primaryAction) { Button { showingEditSheet = true } label: { Text(String(localized: "Edit")) }.accessibilityLabel(String(localized: "Edit transaction")).accessibilityHint(String(localized: "Opens a form to edit this transaction")) } }
        .confirmationDialog(String(localized: "Delete Transaction"), isPresented: $showingDeleteConfirmation, titleVisibility: .visible) { Button(String(localized: "Delete"), role: .destructive) { Task { await performDelete() } }; Button(String(localized: "Cancel"), role: .cancel) {} } message: { Text(String(localized: "Are you sure you want to delete this transaction? This action cannot be undone.")) }
        .sheet(isPresented: $showingEditSheet) { TransactionCreateView(viewModel: TransactionCreateViewModel(transactionRepository: repository, accountRepository: RepositoryProvider.shared.accounts, transaction: transaction)) }
        .alert(String(localized: "Error"), isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) { Button(String(localized: "OK"), role: .cancel) {} } message: { Text(errorMessage ?? "") }
        .onChange(of: selectedPhotoItem) { _, newItem in Task { await loadReceiptPhoto(from: newItem) } }
    }

    // MARK: - Sections

    @ViewBuilder private var headerSection: some View {
        Section {
            VStack(spacing: 4) {
                Text(transaction.formattedAmount)
                    .font(.largeTitle.bold())
                    .foregroundStyle(transaction.isExpense ? .red : .green)
                    .accessibilityLabel(
                        transaction.isExpense
                            ? String(localized: "Expense \(transaction.formattedAmount)")
                            : String(localized: "Income \(transaction.formattedAmount)")
                    )
                Text(transaction.category)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .listRowBackground(Color.clear)
        }
    }

    @ViewBuilder private var detailsSection: some View {
        Section(String(localized: "Details")) {
            LabeledContent(String(localized: "Payee"), value: transaction.payee)
            LabeledContent(String(localized: "Account"), value: transaction.accountName)
            LabeledContent(String(localized: "Date"), value: transaction.date.formatted(date: .abbreviated, time: .shortened))
            LabeledContent(String(localized: "Type"), value: String(describing: transaction.type))
            LabeledContent(String(localized: "Status"), value: String(describing: transaction.status))
        }
    }

    @ViewBuilder private var notesSection: some View {
        Section(String(localized: "Notes")) {
            if isEditingNotes {
                TextField(String(localized: "Notes"), text: $editedNotes, axis: .vertical)
                    .lineLimit(3...6)
                Button(String(localized: "Save")) {
                    transaction.notes = editedNotes
                    isEditingNotes = false
                    Task {
                        do { try await repository.updateTransaction(transaction) }
                        catch { errorMessage = error.localizedDescription }
                    }
                }
            } else {
                Text(transaction.notes.isEmpty ? String(localized: "No notes") : transaction.notes)
                    .foregroundStyle(transaction.notes.isEmpty ? .secondary : .primary)
                    .onTapGesture { isEditingNotes = true }
            }
        }
    }

    @ViewBuilder private var receiptSection: some View {
        Section(String(localized: "Receipt")) {
            if let data = receiptImageData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 200)
                    .accessibilityLabel(String(localized: "Receipt image"))
            }
            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                Label(
                    receiptImageData == nil ? String(localized: "Add Receipt") : String(localized: "Replace Receipt"),
                    systemImage: "camera"
                )
            }
        }
    }

    @ViewBuilder private var actionsSection: some View {
        Section {
            Button(role: .destructive) {
                showingDeleteConfirmation = true
            } label: {
                HStack {
                    Spacer()
                    if isDeleting {
                        ProgressView()
                    } else {
                        Label(String(localized: "Delete Transaction"), systemImage: "trash")
                    }
                    Spacer()
                }
            }
            .disabled(isDeleting)
            .accessibilityLabel(String(localized: "Delete transaction"))
        }
    }

    // MARK: - Actions

    private func performDelete() async {
        isDeleting = true
        do {
            try await repository.deleteTransaction(id: transaction.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
            isDeleting = false
        }
    }

    private func loadReceiptPhoto(from item: PhotosPickerItem?) async {
        guard let item else { return }
        do {
            if let data = try await item.loadTransferable(type: Data.self) {
                receiptImageData = data
                transaction.receiptData = data
                try await repository.updateTransaction(transaction)
            }
        } catch {
            Self.logger.error("Failed to load receipt photo: \(error.localizedDescription, privacy: .public)")
            errorMessage = error.localizedDescription
        }
    }
}

private extension TransactionItem {
    var formattedAmount: String {
        let dollars = Double(amountMinorUnits) / 100.0
        return dollars.formatted(.currency(code: currencyCode))
    }
}