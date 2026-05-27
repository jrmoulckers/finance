// SPDX-License-Identifier: BUSL-1.1
// LogTransactionIntent.swift — Refs #1605

import AppIntents
import Foundation
import os

/// Transaction direction exposed to Shortcuts and Spotlight.
enum LogTransactionTypeAppEnum: String, AppEnum {
    case expense
    case income

    static let typeDisplayRepresentation = TypeDisplayRepresentation(
        name: LocalizedStringResource("Transaction Type")
    )

    static let caseDisplayRepresentations: [LogTransactionTypeAppEnum: DisplayRepresentation] = [
        .expense: DisplayRepresentation(title: LocalizedStringResource("Expense"), image: .init(systemName: "minus.circle")),
        .income: DisplayRepresentation(title: LocalizedStringResource("Income"), image: .init(systemName: "plus.circle")),
    ]

    var transactionType: TransactionTypeUI {
        switch self {
        case .expense: .expense
        case .income: .income
        }
    }
}

/// App Intent used by widgets, Shortcuts, and Spotlight to log a transaction.
struct LogTransactionIntent: AppIntent {
    static let title: LocalizedStringResource = "Log Transaction"
    static let description = IntentDescription(
        "Record a transaction in Finance.",
        categoryName: "Transactions"
    )

    @Parameter(title: "Amount", description: "Amount in major currency units, such as 12.50.")
    var amount: Double

    @Parameter(title: "Type", description: "Whether this is an expense or income.")
    var type: LogTransactionTypeAppEnum

    @Parameter(title: "Category", description: "Transaction category.")
    var category: ExpenseCategoryAppEnum

    @Parameter(title: "Payee", description: "Who paid or was paid.")
    var payee: String?

    @Parameter(title: "Account", description: "Account name.")
    var account: String?

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.finance",
        category: "LogTransactionIntent"
    )

    init() {
        amount = 0
        type = .expense
        category = .other
    }

    init(
        amount: Double,
        type: LogTransactionTypeAppEnum = .expense,
        category: ExpenseCategoryAppEnum = .other,
        payee: String? = nil,
        account: String? = nil
    ) {
        self.amount = amount
        self.type = type
        self.category = category
        self.payee = payee
        self.account = account
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let minorUnits = try Self.minorUnits(from: amount)
        let transaction = Self.makeTransaction(
            amountMinorUnits: minorUnits,
            type: type,
            category: category,
            payee: payee,
            account: account
        )

        do {
            try await RepositoryProvider.shared.transactions.createTransaction(transaction)
        } catch {
            Self.logger.error("Failed to log transaction: \(error.localizedDescription, privacy: .public)")
            throw IntentError.saveFailed
        }

        Self.logger.info("Transaction logged via App Intent")
        return .result(dialog: IntentDialog(String(localized: "Transaction logged.")))
    }

    /// Converts major currency units to integer minor units.
    static func minorUnits(from amount: Double) throws -> Int64 {
        guard amount > 0, amount.isFinite else {
            throw IntentError.invalidAmount
        }
        return Int64((amount * 100).rounded())
    }

    /// Builds the transaction without persisting it, enabling deterministic tests.
    static func makeTransaction(
        amountMinorUnits: Int64,
        type: LogTransactionTypeAppEnum,
        category: ExpenseCategoryAppEnum,
        payee: String?,
        account: String?
    ) -> TransactionItem {
        let signedAmount = type == .income ? amountMinorUnits : -amountMinorUnits
        let trimmedPayee = payee?.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedPayee = trimmedPayee?.isEmpty == false
            ? (trimmedPayee ?? category.categoryName)
            : category.categoryName

        return TransactionItem(
            id: UUID().uuidString,
            payee: resolvedPayee,
            category: category.categoryName,
            accountName: account ?? "",
            amountMinorUnits: signedAmount,
            currencyCode: "USD",
            date: .now,
            type: type.transactionType,
            status: .pending
        )
    }
}
