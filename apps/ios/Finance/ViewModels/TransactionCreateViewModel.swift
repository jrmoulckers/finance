// SPDX-License-Identifier: BUSL-1.1

// TransactionCreateViewModel.swift
// Finance
//
// ViewModel for the multi-step transaction creation sheet. Loads accounts
// from AccountRepository for the picker and saves via TransactionRepository.
// Wired to KMP TransactionValidator for business-rule validation and
// KMP CategorizationEngine for automatic category suggestions.

import Observation
import SwiftUI

@Observable
final class TransactionCreateViewModel {
    private let transactionRepository: TransactionRepository
    private let accountRepository: AccountRepository
    private let transactionValidator: KMPTransactionValidatorProtocol
    private let categorizationEngine: KMPCategorizationEngineProtocol

    /// The transaction being edited, or `nil` for create mode.
    private let editingTransaction: TransactionItem?

    /// Whether this form is editing an existing transaction.
    var isEditing: Bool { editingTransaction != nil }

    var currentStep: Step = .type

    enum Step: Int, CaseIterable {
        case type = 0, details = 1, review = 2
        var title: String {
            switch self {
            case .type: String(localized: "Type")
            case .details: String(localized: "Details")
            case .review: String(localized: "Review")
            }
        }
    }

    var transactionType: TransactionTypeUI = .expense
    var amountText = ""
    var payee = ""
    var selectedAccountId: String?
    var selectedCategoryId: String?
    var date = Date()
    var note = ""
    var currencyCode = "USD"
    var isSaving = false
    var showingValidationError = false
    var validationMessage = ""

    /// Category auto-suggested by the KMP CategorizationEngine based on payee.
    var suggestedCategoryId: String?

    var accounts: [PickerOption] = []

    var categories: [PickerOption] = [
        PickerOption(id: "c1", name: "Groceries", icon: "cart"),
        PickerOption(id: "c2", name: "Dining Out", icon: "fork.knife"),
        PickerOption(id: "c3", name: "Transport", icon: "car"),
        PickerOption(id: "c4", name: "Entertainment", icon: "film"),
        PickerOption(id: "c5", name: "Shopping", icon: "bag"),
        PickerOption(id: "c6", name: "Income", icon: "dollarsign.circle"),
    ]

    var canAdvance: Bool {
        switch currentStep {
        case .type: true
        case .details: !amountText.isEmpty && selectedAccountId != nil && !payee.isEmpty
        case .review: true
        }
    }

    var amountMinorUnits: Int64 { Int64((Double(amountText) ?? 0) * 100) }

    /// Navigation title for the form.
    var navigationTitle: String {
        isEditing ? String(localized: "Edit Transaction") : String(localized: "New Transaction")
    }

    /// Label for the save button on the review step.
    var saveButtonTitle: String {
        isEditing ? String(localized: "Update Transaction") : String(localized: "Save Transaction")
    }

    init(
        transactionRepository: TransactionRepository,
        accountRepository: AccountRepository,
        transaction: TransactionItem? = nil,
        transactionValidator: KMPTransactionValidatorProtocol = KMPBridge.shared.transactionValidator,
        categorizationEngine: KMPCategorizationEngineProtocol = KMPBridge.shared.categorizationEngine
    ) {
        self.transactionRepository = transactionRepository
        self.accountRepository = accountRepository
        self.editingTransaction = transaction
        self.transactionValidator = transactionValidator
        self.categorizationEngine = categorizationEngine

        if let transaction {
            // Pre-fill fields from the existing transaction
            transactionType = transaction.type
            amountText = Self.formatAmountForEditing(abs(transaction.amountMinorUnits))
            payee = transaction.payee
            date = transaction.date
            currencyCode = transaction.currencyCode
            // Category and account IDs are resolved after loadData()
        }
    }

    /// Loads accounts for the account picker and resolves edit mode references.
    func loadData() async {
        do {
            let accountItems = try await accountRepository.getAccounts()
            accounts = accountItems.map { PickerOption(id: $0.id, name: $0.name, icon: $0.icon) }
        } catch {
            // Fall back to empty accounts; user will see "Select Account" prompt
            accounts = []
        }

        // Resolve category and account IDs for edit mode
        if let transaction = editingTransaction {
            selectedCategoryId = categories.first { $0.name == transaction.category }?.id
            selectedAccountId = accounts.first { $0.name == transaction.accountName }?.id
        }
    }

    /// Asks the KMP CategorizationEngine for a category suggestion based on
    /// the current payee. Auto-selects the suggestion when no category has
    /// been manually chosen.
    func updateCategorySuggestion() {
        suggestedCategoryId = categorizationEngine.suggest(payee: payee)
        if selectedCategoryId == nil, let suggested = suggestedCategoryId {
            selectedCategoryId = suggested
        }
    }

    func advance() {
        guard let next = Step(rawValue: currentStep.rawValue + 1) else { return }
        currentStep = next
    }

    func goBack() {
        guard let prev = Step(rawValue: currentStep.rawValue - 1) else { return }
        currentStep = prev
    }

    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }

        let categoryName = categories.first { $0.id == selectedCategoryId }?.name ?? ""
        let accountName = accounts.first { $0.id == selectedAccountId }?.name ?? ""

        let transaction = TransactionItem(
            id: editingTransaction?.id ?? UUID().uuidString,
            payee: payee,
            category: categoryName,
            accountName: accountName,
            amountMinorUnits: transactionType == .income ? amountMinorUnits : -amountMinorUnits,
            currencyCode: currencyCode,
            date: date,
            type: transactionType,
            status: editingTransaction?.status ?? .pending
        )

        do {
            if isEditing {
                try await transactionRepository.updateTransaction(transaction)
            } else {
                try await transactionRepository.createTransaction(transaction)
            }

            // Teach the categorization engine this payee → category mapping
            if let categoryId = selectedCategoryId, !payee.isEmpty {
                categorizationEngine.learnFromHistory(payee: payee, categoryId: categoryId)
            }

            return true
        } catch {
            validationMessage = error.localizedDescription
            showingValidationError = true
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
        if payee.isEmpty {
            validationMessage = String(localized: "Please enter a payee.")
            showingValidationError = true
            return false
        }
        if selectedAccountId == nil {
            validationMessage = String(localized: "Please select an account.")
            showingValidationError = true
            return false
        }

        // KMP TransactionValidator for business-rule validation
        let candidate = KMPTransaction(
            id: editingTransaction?.id ?? UUID().uuidString,
            householdId: "default",
            accountId: selectedAccountId ?? "",
            categoryId: selectedCategoryId,
            type: transactionType.toKMP(),
            status: .pending,
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

    // MARK: - Helpers

    /// Formats minor units to a decimal string for editing (e.g., 2550 → "25.50").
    private static func formatAmountForEditing(_ minorUnits: Int64) -> String {
        let value = Double(minorUnits) / 100.0
        return String(format: "%.2f", value)
    }
}
