// SPDX-License-Identifier: BUSL-1.1

// TransactionEditViewModel.swift
// Finance
//
// ViewModel for editing an existing transaction using the same
// multi-step wizard flow as transaction creation.

import Observation
import os
import SwiftUI

@Observable
@MainActor
final class TransactionEditViewModel {
    private let logger = Logger(subsystem: "com.finance.app", category: "TransactionEditViewModel")
    private let repository: TransactionRepository
    private let accountRepository: AccountRepository
    let originalTransaction: TransactionItem

    // MARK: - Step Tracking

    /// Wizard steps shared with the creation flow.
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

    var currentStep: Step = .type

    // MARK: - Form Fields (pre-populated from original)

    var transactionType: TransactionTypeUI
    var amountText: String
    var payee: String
    var selectedAccountId: String?
    var selectedCategoryId: String?
    var date: Date
    var note: String
    var currencyCode: String

    // MARK: - State

    var isSaving = false
    var showingValidationError = false
    var validationMessage = ""
    var accounts: [PickerOption] = []

    var categories: [PickerOption] = [
        PickerOption(id: "c1", name: "Groceries", icon: "cart"),
        PickerOption(id: "c2", name: "Dining Out", icon: "fork.knife"),
        PickerOption(id: "c3", name: "Transport", icon: "car"),
        PickerOption(id: "c4", name: "Entertainment", icon: "film"),
        PickerOption(id: "c5", name: "Shopping", icon: "bag"),
        PickerOption(id: "c6", name: "Income", icon: "dollarsign.circle"),
    ]

    // MARK: - Change Tracking

    /// Stores the resolved account ID from the original transaction after
    /// `loadData()` maps the account name to an ID.
    private var originalAccountId: String?

    /// Stores the resolved category ID from the original transaction after
    /// `loadData()` maps the category name to an ID.
    private var originalCategoryId: String?

    /// Whether the user has modified any field relative to the original transaction.
    var hasChanges: Bool {
        transactionType != originalTransaction.type
            || amountText != Self.formattedAmount(from: originalTransaction.amountMinorUnits)
            || payee != originalTransaction.payee
            || selectedAccountId != originalAccountId
            || selectedCategoryId != originalCategoryId
            || !Calendar.current.isDate(date, inSameDayAs: originalTransaction.date)
            || note != (originalTransaction.note ?? "")
    }

    // MARK: - Computed

    var canAdvance: Bool {
        switch currentStep {
        case .type: true
        case .details: !amountText.isEmpty && selectedAccountId != nil && !payee.isEmpty
        case .review: true
        }
    }

    var amountMinorUnits: Int64 { Int64((Double(amountText) ?? 0) * 100) }

    // MARK: - Init

    init(
        transaction: TransactionItem,
        repository: TransactionRepository,
        accountRepository: AccountRepository
    ) {
        self.originalTransaction = transaction
        self.repository = repository
        self.accountRepository = accountRepository

        self.transactionType = transaction.type
        self.amountText = Self.formattedAmount(from: transaction.amountMinorUnits)
        self.payee = transaction.payee
        self.date = transaction.date
        self.note = transaction.note ?? ""
        self.currencyCode = transaction.currencyCode
    }

    // MARK: - Data Loading

    /// Loads accounts for the picker and resolves the original transaction's
    /// account and category to their respective IDs.
    func loadData() async {
        do {
            let accountItems = try await accountRepository.getAccounts()
            accounts = accountItems.map { PickerOption(id: $0.id, name: $0.name, icon: $0.icon) }
        } catch {
            logger.error("Failed to load accounts: \(error.localizedDescription, privacy: .public)")
            accounts = []
        }

        // Resolve account ID from the original transaction's account name
        selectedAccountId = accounts.first { $0.name == originalTransaction.accountName }?.id
        originalAccountId = selectedAccountId

        // Resolve category ID from the original transaction's category name
        selectedCategoryId = categories.first { $0.name == originalTransaction.category }?.id
        originalCategoryId = selectedCategoryId
    }

    // MARK: - Navigation

    func advance() {
        guard let next = Step(rawValue: currentStep.rawValue + 1) else { return }
        currentStep = next
    }

    func goBack() {
        guard let prev = Step(rawValue: currentStep.rawValue - 1) else { return }
        currentStep = prev
    }

    // MARK: - Save

    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }

        let categoryName = categories.first { $0.id == selectedCategoryId }?.name ?? ""
        let accountName = accounts.first { $0.id == selectedAccountId }?.name ?? ""

        let updated = TransactionItem(
            id: originalTransaction.id,
            payee: payee,
            category: categoryName,
            accountName: accountName,
            amountMinorUnits: transactionType == .income ? amountMinorUnits : -amountMinorUnits,
            currencyCode: currencyCode,
            date: date,
            type: transactionType,
            status: originalTransaction.status,
            note: note.isEmpty ? nil : note
        )

        do {
            try await repository.updateTransaction(updated)
            logger.info("Transaction \(self.originalTransaction.id, privacy: .private) updated successfully")
            return true
        } catch {
            logger.error("Failed to update transaction: \(error.localizedDescription, privacy: .public)")
            validationMessage = error.localizedDescription
            showingValidationError = true
            return false
        }
    }

    // MARK: - Validation

    private func validate() -> Bool {
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
        return true
    }

    // MARK: - Helpers

    /// Formats minor-unit amounts (e.g. `8540` → `"85.40"`) for the text field.
    static func formattedAmount(from minorUnits: Int64) -> String {
        String(format: "%.2f", Double(abs(minorUnits)) / 100.0)
    }
}
