// SPDX-License-Identifier: BUSL-1.1

// AccountsViewModel.swift
// Finance
//
// ViewModel for the accounts list screen. Loads accounts from a
// repository and groups them by account type for sectioned display.
// Supports archive/unarchive and a toggle to show archived accounts.

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
    var archivedAccounts: [AccountItem] = []
    var isLoading = false
    var showingAddAccount = false
    var showArchivedAccounts = false
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
            let allAccounts = try await repository.getAllAccounts()
            let active = allAccounts.filter { !\$0.isArchived }
            archivedAccounts = allAccounts.filter { \$0.isArchived }
            let grouped = Dictionary(grouping: active) { \$0.type }
            accountGroups = AccountTypeUI.allCases.compactMap { type in
                guard let items = grouped[type], !items.isEmpty else { return nil }
                return AccountGroup(id: type.rawValue, type: type, accounts: items)
            }
        } catch {
            errorMessage = String(localized: "Failed to load accounts. Please try again.")
            Self.logger.error("Accounts load failed: \(error.localizedDescription, privacy: .public)")
            accountGroups = []
            archivedAccounts = []
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
            let filtered = group.accounts.filter { \$0.id != id }
            guard !filtered.isEmpty else { return nil }
            return AccountGroup(id: group.id, type: group.type, accounts: filtered)
        }
        archivedAccounts.removeAll { \$0.id == id }
    }

    func archiveAccount(id: String) async {
        do {
            try await repository.archiveAccount(id: id)
            Self.logger.info("Account \(id, privacy: .private) archived from list")
        } catch {
            errorMessage = String(localized: "Failed to archive account. Please try again.")
            Self.logger.error("Account archive failed: \(error.localizedDescription, privacy: .public)")
        }
        // Move to archived in local state for immediate UI feedback
        var archivedItem: AccountItem?
        accountGroups = accountGroups.compactMap { group in
            let filtered = group.accounts.filter { account in
                if account.id == id {
                    archivedItem = AccountItem(
                        id: account.id, name: account.name,
                        balanceMinorUnits: account.balanceMinorUnits,
                        currencyCode: account.currencyCode,
                        type: account.type, icon: account.icon, isArchived: true
                    )
                    return false
                }
                return true
            }
            guard !filtered.isEmpty else { return nil }
            return AccountGroup(id: group.id, type: group.type, accounts: filtered)
        }
        if let item = archivedItem {
            archivedAccounts.append(item)
        }
    }

    func unarchiveAccount(id: String) async {
        do {
            try await repository.unarchiveAccount(id: id)
            Self.logger.info("Account \(id, privacy: .private) unarchived from list")
        } catch {
            errorMessage = String(localized: "Failed to unarchive account. Please try again.")
            Self.logger.error("Account unarchive failed: \(error.localizedDescription, privacy: .public)")
        }
        // Refresh to get correct grouping
        await loadAccounts()
    }
}
