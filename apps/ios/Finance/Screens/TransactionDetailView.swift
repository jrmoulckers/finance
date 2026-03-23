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
