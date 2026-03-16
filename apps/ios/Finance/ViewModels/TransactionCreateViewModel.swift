// SPDX-License-Identifier: BUSL-1.1

// TransactionCreateViewModel.swift
// Finance
//
// ViewModel for the multi-step transaction creation sheet. Loads accounts
// from AccountRepository for the picker and saves via TransactionRepository.

import Observation
import SwiftUI

@Observable
@MainActor
final class TransactionCreateViewModel {
    private let transactionRepository: TransactionRepository
    private let accountRepository: AccountRepository

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

    init(
        transactionRepository: TransactionRepository,
        accountRepository: AccountRepository
    ) {
        self.transactionRepository = transactionRepository
        self.accountRepository = accountRepository
    }

    /// Loads accounts for the account picker.
    func loadData() async {
        do {
            let accountItems = try await accountRepository.getAccounts()
            accounts = accountItems.map { PickerOption(id: $0.id, name: $0.name, icon: $0.icon) }
        } catch {
            // Fall back to empty accounts; user will see "Select Account" prompt
            accounts = []
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
            id: UUID().uuidString,
            payee: payee,
            category: categoryName,
            accountName: accountName,
            amountMinorUnits: transactionType == .income ? amountMinorUnits : -amountMinorUnits,
            currencyCode: currencyCode,
            date: date,
            type: transactionType,
            status: .pending
        )

        do {
            try await transactionRepository.createTransaction(transaction)
            return true
        } catch {
            validationMessage = error.localizedDescription
            showingValidationError = true
            return false
        }
    }

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
}
