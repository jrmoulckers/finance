// SPDX-License-Identifier: BUSL-1.1

// ShowBalanceIntent.swift
// Finance
//
// App Intent for showing account balances via Siri Shortcuts.
// Returns total balance across all accounts or a specific account balance
// when an account name is provided.

import AppIntents
import Foundation
import os

/// Shows the user's account balance.
///
/// Available as a Siri Shortcut with the phrase *"Show balance in Finance"*.
/// When no account is specified, returns the total balance across all
/// non-archived accounts.
struct ShowBalanceIntent: AppIntent {

    static let title: LocalizedStringResource = "Show Balance"

    static let description: IntentDescription = IntentDescription(
        "Check your total balance or a specific account balance.",
        categoryName: "Accounts"
    )

    // MARK: - Parameters

    @Parameter(
        title: "Account",
        description: "Account name to check. Leave empty for total balance."
    )
    var accountName: String?

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "ShowBalanceIntent"
    )

    // MARK: - Perform

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let repository = RepositoryProvider.shared.accounts

        let accounts: [AccountItem]
        do {
            accounts = try await repository.getAccounts()
        } catch {
            Self.logger.error(
                "Failed to fetch accounts: \(error.localizedDescription, privacy: .public)"
            )
            throw IntentError.saveFailed
        }

        if let name = accountName {
            // Specific account — case-insensitive match
            guard let matched = accounts.first(where: {
                $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame
            }) else {
                Self.logger.info("Account not found: \(name, privacy: .private)")
                throw IntentError.notFound
            }

            let formatted = Self.formatCurrency(
                minorUnits: matched.balanceMinorUnits,
                currencyCode: matched.currencyCode
            )

            return .result(
                dialog: "Your \(matched.name) balance is \(formatted)."
            )
        }

        // Total balance across all accounts
        let totalMinorUnits = accounts.reduce(Int64(0)) { $0 + $1.balanceMinorUnits }
        let currencyCode = accounts.first?.currencyCode ?? "USD"
        let formatted = Self.formatCurrency(
            minorUnits: totalMinorUnits,
            currencyCode: currencyCode
        )

        let accountCount = accounts.count
        let accountWord = accountCount == 1
            ? String(localized: "account")
            : String(localized: "accounts")

        Self.logger.info("Balance query — \(accountCount) accounts, total \(formatted, privacy: .public)")

        return .result(
            dialog: "Your total balance across \(accountCount) \(accountWord) is \(formatted)."
        )
    }

    // MARK: - Helpers

    private static func formatCurrency(
        minorUnits: Int64,
        currencyCode: String = "USD"
    ) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currencyCode
        let majorUnits = NSDecimalNumber(value: minorUnits)
            .dividing(by: NSDecimalNumber(decimal: 100))
        return formatter.string(from: majorUnits) ?? "\(currencyCode) \(minorUnits)"
    }
}
