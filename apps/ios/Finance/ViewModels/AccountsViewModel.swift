// SPDX-License-Identifier: BUSL-1.1

// AccountsViewModel.swift
// Finance
//
// ViewModel for the accounts list screen. Loads accounts from a
// repository and groups them by account type for sectioned display.

import Observation
import Foundation
import os

@Observable
final class AccountsViewModel {
    private let repository: AccountRepository

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AccountsViewModel"
    )

    var accountGroups: [AccountGroup] = []
    var isLoading = false
    var showingAddAccount = false
    var errorMessage: String?

    /// Whether an error alert should be presented.
    var showError: Bool { errorMessage != nil }

    /// Clears the current error message, dismissing the alert.
    func dismissError() { errorMessage = nil }

    init(repository: AccountRepository) {
        self.repository = repository
    }

    func loadAccounts() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let accounts = try await repository.getAccounts()
            let grouped = Dictionary(grouping: accounts) { $0.type }
            accountGroups = AccountTypeUI.allCases.compactMap { type in
                guard let items = grouped[type], !items.isEmpty else { return nil }
                return AccountGroup(id: type.rawValue, type: type, accounts: items)
            }
        } catch {
            errorMessage = String(localized: "Failed to load accounts. Please try again.")
            Self.logger.error("Accounts load failed: \(error.localizedDescription, privacy: .public)")
            accountGroups = []
        }
    }

    func deleteAccount(id: String) async {
        do {
            try await repository.deleteAccount(id: id)
        } catch {
            errorMessage = String(localized: "Failed to delete account. Please try again.")
            Self.logger.error("Account deletion failed: \(error.localizedDescription, privacy: .public)")
        }
        // Remove from local state for immediate UI feedback
        accountGroups = accountGroups.compactMap { group in
            let filtered = group.accounts.filter { $0.id != id }
            guard !filtered.isEmpty else { return nil }
            return AccountGroup(id: group.id, type: group.type, accounts: filtered)
        }
    }
}
