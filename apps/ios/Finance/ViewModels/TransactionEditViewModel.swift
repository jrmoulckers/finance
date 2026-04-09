// SPDX-License-Identifier: BUSL-1.1

// TransactionEditViewModel.swift
// Finance
//
// ViewModel for editing an existing transaction. Tracks field changes,
// validates input, and persists updates or deletes via TransactionRepository.
// Wired to KMP TransactionValidator for business-rule validation and
// KMP CategorizationEngine for learning payee → category mappings.

import Observation
import os
import SwiftUI

@Observable
final class TransactionEditViewModel {
    private let transactionRepository: TransactionRepository
    private let accountRepository: AccountRepository
    private let transactionValidator: KMPTransactionValidatorProtocol
    private let categorizationEngine: KMPCategorizationEngineProtocol

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "TransactionEditViewModel"
    )

    let original: TransactionItem

    var transactionType: TransactionTypeUI
    var amountText: String
    var payee: String
    var selectedAccountId: String?
    var selectedCategoryId: String?
    var date: Date
    var note: String
    var currencyCode: String
    var accounts: [PickerOption] = []
    var categories: [PickerOption] = [
        PickerOption(id: "c1", name: "Groceries", icon: "cart"),
        PickerOption(id: "c2", name: "Dining Out", icon: "fork.knife"),
        PickerOption(id: "c3", name: "Transport", icon: "car"),
        PickerOption(id: "c4", name: "Entertainment", icon: "film"),
        PickerOption(id: "c5", name: "Shopping", icon: "bag"),
        PickerOption(id: "c6", name: "Income", icon: "dollarsign.circle"),
    ]
    var isSaving = false
    var isDeleting = false
    var showingValidationError = false
    var validationMessage = ""
    var showingSaveConfirmation = false
    var showingDeleteConfirmation = false
    var errorMessage: String?
    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }
    var isProcessing: Bool { isSaving || isDeleting }
    var amountMinorUnits: Int64 { Int64((Double(amountText) ?? 0) * 100) }

    var hasChanges: Bool {
        transactionType != original.type
            || amountText != Self.formatAmountForEditing(abs(original.amountMinorUnits))
            || payee != original.payee
            || !Calendar.current.isDate(date, inSameDayAs: original.date)
            || resolvedCategoryName != original.category
            || resolvedAccountName != original.accountName
    }

    private var resolvedCategoryName: String {
        categories.first { $0.id == selectedCategoryId }?.name ?? ""
    }
    private var resolvedAccountName: String {
        accounts.first { $0.id == selectedAccountId }?.name ?? ""
    }

    init(
        transactionRepository: TransactionRepository,
        accountRepository: AccountRepository,
        transaction: TransactionItem,
        transactionValidator: KMPTransactionValidatorProtocol = KMPBridge.shared.transactionValidator,
        categorizationEngine: KMPCategorizationEngineProtocol = KMPBridge.shared.categorizationEngine
    ) {
        self.transactionRepository = transactionRepository
        self.accountRepository = accountRepository
        self.original = transaction
        self.transactionValidator = transactionValidator
        self.categorizationEngine = categorizationEngine
        self.transactionType = transaction.type
        self.amountText = Self.formatAmountForEditing(abs(transaction.amountMinorUnits))
        self.payee = transaction.payee
        self.date = transaction.date
        self.note = ""
        self.currencyCode = transaction.currencyCode
    }

    func loadData() async {
        do {
            let accountItems = try await accountRepository.getAccounts()
            accounts = accountItems.map { PickerOption(id: $0.id, name: $0.name, icon: $0.icon) }
        } catch {
            Self.logger.error("Failed to load accounts: \(error.localizedDescription, privacy: .public)")
            accounts = []
        }
        selectedCategoryId = categories.first { $0.name == original.category }?.id
        selectedAccountId = accounts.first { $0.name == original.accountName }?.id
    }

    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }
        let updated = TransactionItem(
            id: original.id, payee: payee, category: resolvedCategoryName,
            accountName: resolvedAccountName,
            amountMinorUnits: transactionType == .income ? amountMinorUnits : -amountMinorUnits,
            currencyCode: currencyCode, date: date, type: transactionType, status: original.status
        )
        do {
            try await transactionRepository.updateTransaction(updated)
            Self.logger.info("Transaction \(self.original.id, privacy: .private) updated")

            // Teach the categorization engine this payee → category mapping
            if let categoryId = selectedCategoryId, !payee.isEmpty {
                categorizationEngine.learnFromHistory(payee: payee, categoryId: categoryId)
            }

            return true
        } catch {
            errorMessage = String(localized: "Failed to update transaction. Please try again.")
            Self.logger.error("Transaction update failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    func delete() async -> Bool {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await transactionRepository.deleteTransaction(id: original.id)
            Self.logger.info("Transaction \(self.original.id, privacy: .private) deleted")
            return true
        } catch {
            errorMessage = String(localized: "Failed to delete transaction. Please try again.")
            Self.logger.error("Transaction deletion failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private func validate() -> Bool {
        // Basic client-side validation
        if amountText.isEmpty || (Double(amountText) ?? 0) <= 0 {
            validationMessage = String(localized: "Please enter a valid amount.")
            showingValidationError = true
            return false
        }
        if payee.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            validationMessage = String(localized: "Please enter a payee.")
            showingValidationError = true
            return false
        }
        if selectedAccountId == nil {
            validationMessage = String(localized: "Please select an account.")
            showingValidationError = true
            return false
        }
        if date > Date() {
            validationMessage = String(localized: "Transaction date cannot be in the future.")
            showingValidationError = true
            return false
        }

        // KMP TransactionValidator for business-rule validation
        let candidate = KMPTransaction(
            id: original.id,
            householdId: "default",
            accountId: selectedAccountId ?? "",
            categoryId: selectedCategoryId,
            type: transactionType.toKMP(),
            status: original.status.toKMP(),
            amountMinorUnits: amountMinorUnits,
            currencyCode: currencyCode,
            payee: payee.isEmpty ? nil : payee,
            note: note.isEmpty ? nil : note,
            date: Calendar.current.dateComponents([.year, .month, .day], from: date),
            transferAccountId: nil,
            isRecurring: false,
            tags: [],
            createdAt: .now,
            updatedAt: .now,
            deletedAt: nil,
            isSynced: false
        )
        let accountIds = Set(accounts.map(\.id))
        let categoryIds = Set(categories.map(\.id))
        let errors = transactionValidator.validate(
            transaction: candidate,
            existingAccountIds: accountIds,
            existingCategoryIds: categoryIds
        )
        if let firstError = errors.first {
            validationMessage = firstError
            showingValidationError = true
            return false
        }

        return true
    }

    static func formatAmountForEditing(_ minorUnits: Int64) -> String {
        let value = Double(minorUnits) / 100.0
        return String(format: "%.2f", value)
    }
}