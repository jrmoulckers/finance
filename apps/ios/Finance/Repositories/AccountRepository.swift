// SPDX-License-Identifier: BUSL-1.1

// AccountRepository.swift
// Finance
//
// Protocol defining the data-access contract for financial accounts.
// Swap the concrete implementation to move from mock data to a
// KMP-backed repository without changing any ViewModel or View code.

import Foundation

/// Data-access contract for financial accounts.
///
/// All methods are `async throws` so implementations can perform
/// network, database, or KMP bridge calls transparently.
protocol AccountRepository: Sendable {

    /// Returns every non-archived account.
    func getAccounts() async throws -> [AccountItem]

    /// Returns all accounts including archived ones.
    func getAllAccounts() async throws -> [AccountItem]

    /// Returns a single account by its identifier, or `nil` if not found.
    func getAccount(id: String) async throws -> AccountItem?

    /// Persists changes to an existing account (name, type, currency, notes).
    func updateAccount(_ account: AccountItem) async throws

    /// Soft-archives the account with the given identifier.
    /// The account is hidden from default lists but data is preserved.
    func archiveAccount(id: String) async throws

    /// Restores a previously archived account to the active list.
    func unarchiveAccount(id: String) async throws

    /// Permanently deletes the account with the given identifier.
    func deleteAccount(id: String) async throws

    /// Permanently deletes all accounts.
    func deleteAllAccounts() async throws
}
