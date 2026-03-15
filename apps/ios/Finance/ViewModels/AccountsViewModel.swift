// SPDX-License-Identifier: BUSL-1.1

// AccountsViewModel.swift
// Finance
//
// ViewModel for the accounts list screen. Loads accounts from a
// repository and groups them by account type for sectioned display.

import Foundation
import Observation
import os

@Observable
@MainActor
final class AccountsViewModel {
    private let repository: AccountRepository
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AccountsViewModel"
    )

    var accountGroups: [AccountGroup] = []
    var isLoading = false
    var errorMessage: String?
    var showingAddAccount = false

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
            errorMessage = nil
        } catch {
            logger.error("Failed to load accounts: \(error.localizedDescription, privacy: .public)")
            errorMessage = error.localizedDescription
        }
    }

    func deleteAccount(id: String) async {
        do {
            try await repository.deleteAccount(id: id)
        } catch {
            logger.error("Failed to delete account: \(error.localizedDescription, privacy: .public)")
        }
        // Remove from local state for immediate UI feedback
        accountGroups = accountGroups.compactMap { group in
            let filtered = group.accounts.filter { $0.id != id }
            guard !filtered.isEmpty else { return nil }
            return AccountGroup(id: group.id, type: group.type, accounts: filtered)
        }
    }
}
