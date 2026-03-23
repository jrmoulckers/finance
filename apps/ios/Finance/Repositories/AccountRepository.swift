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

    /// Returns a single account by its identifier, or `nil` if not found.
    func getAccount(id: String) async throws -> AccountItem?

    /// Permanently deletes the account with the given identifier.
    func deleteAccount(id: String) async throws

    /// Permanently deletes all accounts.
    func deleteAllAccounts() async throws
}
