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

    // MARK: - Header Section

    private var headerSection: some View {
        Section {
            VStack(spacing: 8) {
                Image(systemName: transaction.type.systemImage)
                    .font(.largeTitle)
                    .foregroundStyle(transaction.type.color)
                    .frame(width: 64, height: 64)
                    .background(transaction.type.color.opacity(0.1), in: Circle())

                Text(transaction.payee)
                    .font(.headline)

                CurrencyLabel(
                    amountInMinorUnits: transaction.amountMinorUnits,
                    currencyCode: transaction.currencyCode,
                    font: .title.bold()
                )

                Text(transaction.category)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text(transaction.date, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(.quaternary, in: Capsule())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "\(transaction.payee), \(transaction.category), \(transaction.type.displayName)"))
        }
    }

    // MARK: - Details Section

    private var detailsSection: some View {
        Section(String(localized: "Details")) {
            LabeledContent(String(localized: "Account")) {
                Text(transaction.accountName.isEmpty ? String(localized: "Unknown") : transaction.accountName)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "Account, \(transaction.accountName.isEmpty ? String(localized: "Unknown") : transaction.accountName)"))

            LabeledContent(String(localized: "Type")) {
                Label(transaction.type.displayName, systemImage: transaction.type.systemImage)
                    .foregroundStyle(transaction.type.color)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "Type, \(transaction.type.displayName)"))

            LabeledContent(String(localized: "Status")) {
                Text(transaction.status.displayName)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "Status, \(transaction.status.displayName)"))

            if transaction.isRecurring {
                LabeledContent(String(localized: "Recurring")) {
                    Label(String(localized: "Yes"), systemImage: "arrow.triangle.2.circlepath")
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(localized: "Recurring transaction"))
            }
        }
    }

    // MARK: - Notes Section

    private var notesSection: some View {
        Section(String(localized: "Notes")) {
            if isEditingNotes {
                TextField(String(localized: "Add notes…"), text: $editedNotes, axis: .vertical)
                    .lineLimit(3...8)
                    .accessibilityLabel(String(localized: "Transaction notes"))
                    .accessibilityHint(String(localized: "Edit the notes for this transaction"))

                HStack {
                    Button(String(localized: "Cancel")) {
                        editedNotes = transaction.notes
                        isEditingNotes = false
                    }
                    .accessibilityLabel(String(localized: "Cancel editing notes"))

                    Spacer()

                    Button(String(localized: "Save")) {
                        Task { await saveNotes() }
                    }
                    .fontWeight(.semibold)
                    .accessibilityLabel(String(localized: "Save notes"))
                    .accessibilityHint(String(localized: "Saves the updated notes for this transaction"))
                }
            } else {
                if transaction.notes.isEmpty {
                    Button {
                        isEditingNotes = true
                    } label: {
                        Label(String(localized: "Add Notes"), systemImage: "square.and.pencil")
                    }
                    .accessibilityLabel(String(localized: "Add notes"))
                    .accessibilityHint(String(localized: "Opens a text field to add notes to this transaction"))
                } else {
                    Text(transaction.notes)
                        .font(.body)
                        .accessibilityLabel(String(localized: "Notes, \(transaction.notes)"))

                    Button {
                        isEditingNotes = true
                    } label: {
                        Label(String(localized: "Edit Notes"), systemImage: "pencil")
                    }
                    .accessibilityLabel(String(localized: "Edit notes"))
                    .accessibilityHint(String(localized: "Opens a text field to edit the transaction notes"))
                }
            }
        }
    }

    // MARK: - Receipt Section

    private var receiptSection: some View {
        Section(String(localized: "Receipt")) {
            if let imageData = receiptImageData,
               let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel(String(localized: "Receipt photo"))
                    .accessibilityHint(String(localized: "Photo of the receipt attached to this transaction"))
            }

            PhotosPicker(
                selection: $selectedPhotoItem,
                matching: .images,
                photoLibrary: .shared()
            ) {
                Label(
                    receiptImageData != nil
                        ? String(localized: "Replace Receipt Photo")
                        : String(localized: "Attach Receipt Photo"),
                    systemImage: "camera"
                )
            }
            .accessibilityLabel(
                receiptImageData != nil
                    ? String(localized: "Replace receipt photo")
                    : String(localized: "Attach receipt photo")
            )
            .accessibilityHint(String(localized: "Opens the photo picker to select a receipt image"))

            if receiptImageData != nil {
                Button(role: .destructive) {
                    receiptImageData = nil
                    selectedPhotoItem = nil
                    Self.logger.info("Receipt photo removed")
                } label: {
                    Label(String(localized: "Remove Receipt"), systemImage: "trash")
                }
                .accessibilityLabel(String(localized: "Remove receipt photo"))
                .accessibilityHint(String(localized: "Removes the attached receipt photo from this transaction"))
            }
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        Section {
            Button(role: .destructive) {
                showingDeleteConfirmation = true
            } label: {
                HStack {
                    Spacer()
                    if isDeleting {
                        ProgressView()
                            .accessibilityLabel(String(localized: "Deleting transaction"))
                    } else {
                        Label(String(localized: "Delete Transaction"), systemImage: "trash")
                    }
                    Spacer()
                }
            }
            .disabled(isDeleting)
            .accessibilityLabel(String(localized: "Delete transaction"))
            .accessibilityHint(String(localized: "Shows a confirmation dialog to permanently delete this transaction"))
        }
    }

    // MARK: - Actions

    private func performDelete() async {
        isDeleting = true
        Self.logger.info("Deleting transaction \(transaction.id, privacy: .private)")
        do {
            try await repository.deleteTransaction(id: transaction.id)
            Self.logger.info("Transaction deleted successfully")
            dismiss()
        } catch {
            Self.logger.error("Failed to delete transaction: \(error.localizedDescription, privacy: .public)")
            errorMessage = String(localized: "Failed to delete transaction. Please try again.")
            isDeleting = false
        }
    }

    private func loadReceiptPhoto(from item: PhotosPickerItem?) async {
        guard let item else { return }
        Self.logger.debug("Loading receipt photo from picker")
        do {
            if let data = try await item.loadTransferable(type: Data.self) {
                receiptImageData = data
                Self.logger.info("Receipt photo loaded (\(data.count) bytes)")
            } else {
                Self.logger.warning("Photo picker returned nil data")
                errorMessage = String(localized: "Unable to load the selected photo. Please try a different image.")
            }
        } catch {
            Self.logger.error("Failed to load receipt photo: \(error.localizedDescription, privacy: .public)")
            errorMessage = String(localized: "Failed to load photo. Please try again.")
        }
    }

    private func saveNotes() async {
        let updatedTransaction = TransactionItem(
            id: transaction.id,
            payee: transaction.payee,
            category: transaction.category,
            accountName: transaction.accountName,
            amountMinorUnits: transaction.amountMinorUnits,
            currencyCode: transaction.currencyCode,
            date: transaction.date,
            type: transaction.type,
            status: transaction.status,
            notes: editedNotes,
            isRecurring: transaction.isRecurring,
            receiptData: transaction.receiptData
        )
        Self.logger.info("Saving updated notes for transaction \(transaction.id, privacy: .private)")
        do {
            try await repository.updateTransaction(updatedTransaction)
            transaction = updatedTransaction
            isEditingNotes = false
            Self.logger.info("Transaction notes saved successfully")
        } catch {
            Self.logger.error("Failed to save notes: \(error.localizedDescription, privacy: .public)")
            errorMessage = String(localized: "Failed to save notes. Please try again.")
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        TransactionDetailView(transaction: TransactionItem(
            id: "preview-1",
            payee: "Whole Foods Market",
            category: "Groceries",
            accountName: "Main Checking",
            amountMinorUnits: -85_42,
            currencyCode: "USD",
            date: .now,
            type: .expense,
            status: .cleared,
            notes: "Weekly grocery run",
            isRecurring: false,
            receiptData: nil
        ))
    }
}
