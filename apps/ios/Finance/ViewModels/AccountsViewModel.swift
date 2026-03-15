// SPDX-License-Identifier: BUSL-1.1

// AccountsViewModel.swift
// Finance
//
// ViewModel for the accounts list screen. Loads accounts from a
// repository and groups them by account type for sectioned display.

import Observation
import Foundation

@Observable
@MainActor
final class AccountsViewModel {
    private let repository: AccountRepository

    var accountGroups: [AccountGroup] = []
    var isLoading = false
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
        } catch {
            // Error handling will be enhanced with KMP-backed repository
            accountGroups = []
        }
    }

    func deleteAccount(id: String) async {
        do {
            try await repository.deleteAccount(id: id)
        } catch {
            // Deletion error handling will be enhanced with KMP-backed repository
        }
        // Remove from local state for immediate UI feedback
        accountGroups = accountGroups.compactMap { group in
            let filtered = group.accounts.filter { $0.id != id }
            guard !filtered.isEmpty else { return nil }
            return AccountGroup(id: group.id, type: group.type, accounts: filtered)
        }
    }
}
