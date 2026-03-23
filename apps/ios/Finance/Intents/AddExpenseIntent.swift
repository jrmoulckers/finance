// SPDX-License-Identifier: BUSL-1.1

// AddExpenseIntent.swift
// Finance
//
// App Intent for adding an expense via Siri Shortcuts.
// Accepts amount, category, payee, and account parameters, then creates
// a transaction through the shared TransactionRepository.

import AppIntents
import Foundation
import os

// MARK: - Expense Category

/// Expense categories surfaced to Siri and the Shortcuts app.
///
/// Maps to the same categories used in ``TransactionCreateViewModel``.
enum ExpenseCategoryAppEnum: String, AppEnum {
    case groceries
    case diningOut
    case transport
    case entertainment
    case shopping
    case other

    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: LocalizedStringResource("Category")
    )

    static let caseDisplayRepresentations: [ExpenseCategoryAppEnum: DisplayRepresentation] = [
        .groceries: DisplayRepresentation(
            title: LocalizedStringResource("Groceries"),
            image: .init(systemName: "cart")
        ),
        .diningOut: DisplayRepresentation(
            title: LocalizedStringResource("Dining Out"),
            image: .init(systemName: "fork.knife")
        ),
        .transport: DisplayRepresentation(
            title: LocalizedStringResource("Transport"),
            image: .init(systemName: "car")
        ),
        .entertainment: DisplayRepresentation(
            title: LocalizedStringResource("Entertainment"),
            image: .init(systemName: "film")
        ),
        .shopping: DisplayRepresentation(
            title: LocalizedStringResource("Shopping"),
            image: .init(systemName: "bag")
        ),
        .other: DisplayRepresentation(
            title: LocalizedStringResource("Other"),
            image: .init(systemName: "ellipsis.circle")
        ),
    ]

    /// Human-readable category name persisted in the transaction record.
    var categoryName: String {
        switch self {
        case .groceries: String(localized: "Groceries")
        case .diningOut: String(localized: "Dining Out")
        case .transport: String(localized: "Transport")
        case .entertainment: String(localized: "Entertainment")
        case .shopping: String(localized: "Shopping")
        case .other: String(localized: "Other")
        }
    }
}

// MARK: - Add Expense Intent

/// Creates a new expense transaction.
///
/// Available as a Siri Shortcut with the phrase *"Add expense in Finance"*.
/// The intent validates the amount, builds a ``TransactionItem``, and persists
/// it through ``TransactionRepository``.
struct AddExpenseIntent: AppIntent {

    static let title: LocalizedStringResource = "Add Expense"

    static let description: IntentDescription = IntentDescription(
        "Record a new expense transaction in Finance.",
        categoryName: "Transactions"
    )

    // MARK: - Parameters

    @Parameter(title: "Amount", description: "Expense amount in major currency units (e.g. 12.50).")
    var amount: Double

    @Parameter(title: "Category", description: "Expense category.")
    var category: ExpenseCategoryAppEnum

    @Parameter(title: "Payee", description: "Who you paid (e.g. \"Whole Foods\").")
    var payee: String?

    @Parameter(title: "Account", description: "Account name to charge.")
    var account: String?

    // MARK: - Logging

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "AddExpenseIntent"
    )

    // MARK: - Perform

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard amount > 0 else {
            throw IntentError.invalidAmount
        }

        let amountMinorUnits = Int64((amount * 100).rounded())
        let resolvedPayee = payee ?? category.categoryName
        let resolvedAccount = account ?? ""

        let transaction = TransactionItem(
            id: UUID().uuidString,
            payee: resolvedPayee,
            category: category.categoryName,
            accountName: resolvedAccount,
            amountMinorUnits: -amountMinorUnits, // expenses are negative
            currencyCode: "USD",
            date: .now,
            type: .expense,
            status: .pending
        )

        let repository = RepositoryProvider.shared.transactions

        do {
            try await repository.createTransaction(transaction)
        } catch {
            Self.logger.error(
                "Failed to create transaction: \(error.localizedDescription, privacy: .public)"
            )
            throw IntentError.saveFailed
        }

        let formatted = Self.formatCurrency(minorUnits: amountMinorUnits)
        Self.logger.info("Expense added: \(formatted, privacy: .public) — \(category.categoryName)")

        return .result(
            dialog: "Added \(formatted) expense for \(category.categoryName)."
        )
    }

    // MARK: - Helpers

    /// Formats minor units to a locale-aware currency string.
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

// MARK: - Intent Errors

/// Errors surfaced to the user when an App Intent cannot complete.
enum IntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
    case invalidAmount
    case saveFailed
    case notFound

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .invalidAmount:
            "The amount must be greater than zero."
        case .saveFailed:
            "Could not save the transaction. Please try again."
        case .notFound:
            "The requested item was not found."
        }
    }
}
