// SPDX-License-Identifier: BUSL-1.1

// AccountEditViewModel.swift
// Finance
//
// ViewModel for the account edit form. Tracks field changes, validates
// input, and persists updates via AccountRepository.

import Observation
import os
import Foundation

@Observable
@MainActor
final class AccountEditViewModel {
    private let repository: AccountRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AccountEditViewModel"
    )

    let original: AccountItem

    var name: String
    var selectedType: AccountTypeUI
    var currencyCode: String
    var notes: String
    var isSaving = false
    var showingValidationError = false
    var validationMessage = ""
    var errorMessage: String?
    var showError: Bool { errorMessage != nil }
    func dismissError() { errorMessage = nil }

    /// Whether the user has made any changes to the form fields.
    var hasChanges: Bool {
        name != original.name
            || selectedType != original.type
            || currencyCode != original.currencyCode
            || !notes.isEmpty
    }

    /// Navigation title for the edit form.
    var navigationTitle: String {
        String(localized: "Edit Account")
    }

    /// Supported currency codes for the currency picker.
    static let supportedCurrencies: [String] = [
        "USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "BRL",
    ]

    init(repository: AccountRepository, account: AccountItem) {
        self.repository = repository
        self.original = account
        self.name = account.name
        self.selectedType = account.type
        self.currencyCode = account.currencyCode
        self.notes = ""
    }

    /// Validates and persists the account changes.
    ///
    /// - Returns: `true` if the save succeeded; `false` on validation
    ///   failure or repository error.
    func save() async -> Bool {
        guard validate() else { return false }
        isSaving = true
        defer { isSaving = false }

        let updated = updatedAccount

        do {
            try await repository.updateAccount(updated)
            Self.logger.info("Account \(self.original.id, privacy: .private) updated")
            return true
        } catch {
            errorMessage = String(localized: "Failed to update account. Please try again.")
            Self.logger.error(
                "Account update failed: \(error.localizedDescription, privacy: .public)"
            )
            return false
        }
    }

    /// Returns the updated account item reflecting current form state.
    var updatedAccount: AccountItem {
        AccountItem(
            id: original.id,
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            balanceMinorUnits: original.balanceMinorUnits,
            currencyCode: currencyCode,
            type: selectedType,
            icon: selectedType.systemImage,
            isArchived: original.isArchived
        )
    }

    private func validate() -> Bool {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            validationMessage = String(localized: "Please enter an account name.")
            showingValidationError = true
            return false
        }
        if trimmed.count > 100 {
            validationMessage = String(localized: "Account name must be 100 characters or fewer.")
            showingValidationError = true
            return false
        }
        return true
    }
}
