// SPDX-License-Identifier: BUSL-1.1

// MockAccountRepository.swift
// Finance
//
// In-memory mock implementation of AccountRepository.
// TODO: Replace MockAccountRepository with KMP-backed repository
// that reads from SQLDelight via the Swift Export bridge.

import Foundation

/// Returns hardcoded sample accounts for development and SwiftUI previews.
struct MockAccountRepository: AccountRepository {

    func getAccounts() async throws -> [AccountItem] {
        [
            AccountItem(
                id: "a1", name: "Main Checking",
                balanceMinorUnits: 12_450_00, currencyCode: "USD",
                type: .checking, icon: "building.columns", isArchived: false
            ),
            AccountItem(
                id: "a2", name: "Savings",
                balanceMinorUnits: 25_000_00, currencyCode: "USD",
                type: .savings, icon: "banknote", isArchived: false
            ),
            AccountItem(
                id: "a3", name: "Travel Card",
                balanceMinorUnits: -1_200_00, currencyCode: "USD",
                type: .creditCard, icon: "creditcard", isArchived: false
            ),
            AccountItem(
                id: "a4", name: "Brokerage",
                balanceMinorUnits: 18_500_00, currencyCode: "USD",
                type: .investment, icon: "chart.line.uptrend.xyaxis", isArchived: false
            ),
            AccountItem(
                id: "a5", name: "Emergency Fund",
                balanceMinorUnits: 10_000_00, currencyCode: "USD",
                type: .savings, icon: "banknote", isArchived: false
            ),
            AccountItem(
                id: "a6", name: "Old Checking",
                balanceMinorUnits: 0, currencyCode: "USD",
                type: .checking, icon: "building.columns", isArchived: true
            ),
        ]
    }

    func getAllAccounts() async throws -> [AccountItem] {
        try await getAccounts()
    }

    func getAccount(id: String) async throws -> AccountItem? {
        try await getAllAccounts().first { $0.id == id }
    }

    func updateAccount(_ account: AccountItem) async throws { }
    func archiveAccount(id: String) async throws { }
    func unarchiveAccount(id: String) async throws { }
    func deleteAccount(id: String) async throws { }
    func deleteAllAccounts() async throws { }
}
